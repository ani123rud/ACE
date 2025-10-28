import { Router } from 'express';
import { getOllamaClient } from '../config/ollama.js';
import Answer from '../models/Answer.js';
import Question from '../models/Question.js';
import Session from '../models/Session.js';
import { evaluateAnswer } from '../services/rag/evaluator.js';
import { queryDomain as queryLlamaIndex } from '../services/rag/llamaindex.js';
import { redis } from '../config/redis.js';
import crypto from 'crypto';
import mongoose from 'mongoose';

const r = Router();

/*
POST /api/scoring/final
Body: {
  sessionId: string,
  qa: Array<{ question: string, answer: string, score?: number }>,
  proctor: {
    integrity: number,
    stats: any,
    events: Array<{ type: string, severity: 'low'|'medium'|'high', at: number, data?: any }>
  }
}
*/
async function computeFinalReport(sessionId, qa = [], proctor = {}, opts = {}) {
  console.log('[computeFinalReport] CALLED with:', { sessionId: sessionId?.substring?.(0, 20), qaLength: qa.length, proctorEvents: proctor?.events?.length || 0 });
  const DEFER = /^true$/i.test(process.env.DEFER_EVAL || 'false');
  const forceRecompute = Boolean(opts?.forceRecompute);
  console.log('[computeFinalReport] Options:', { DEFER, forceRecompute });
  
  // If forceRecompute is true, clear any existing cached report
  if (forceRecompute && sessionId && mongoose.isValidObjectId(sessionId)) {
    try {
      await Session.updateOne({ _id: sessionId }, { $unset: { finalReport: 1 } });
    } catch {}
  }
  
  // If a report already exists and we're not forcing recompute, return it immediately
  if (!forceRecompute && sessionId && mongoose.isValidObjectId(sessionId)) {
    const existing = await Session.findById(sessionId).lean();
    if (existing?.finalReport) return existing.finalReport;
  }
  
  // If QA data is explicitly provided, always use it for fresh scoring
  const useProvidedQA = Array.isArray(qa) && qa.length > 0;
  
  // If no QA provided, build it from stored Answers for this session (most recent 10)
  try {
    if ((!qa || !qa.length) && sessionId && mongoose.isValidObjectId(sessionId)) {
      const answers = await Answer.find({ sessionId }).sort({ createdAt: 1 }).lean();
      const last10 = answers.slice(-10);
      const qIds = last10.map(a => a.questionId).filter(Boolean);
      const qMap = new Map();
      if (qIds.length) {
        const qs = await Question.find({ _id: { $in: qIds } }).lean();
        for (const q of qs) qMap.set(String(q._id), q);
      }
      qa = last10.map(a => ({
        question: qMap.get(String(a.questionId))?.question || '',
        answer: a.candidateText || '',
      }));
    }
  } catch {}
  // If deferred mode, perform per-question evaluations now (once) using LlamaIndex context
  try {
    if (DEFER && sessionId) {
      const session = await Session.findById(sessionId).lean();
      if (session) {
        const answers = await Answer.find({ sessionId }).lean();
        const CONCURRENCY = 3;
        const tasks = answers.map((a) => async () => {
          if (a?.eval?.score != null && a?.eval?.feedback) return;
          const q = await Question.findById(a.questionId).lean();
          if (!q) return;
          let ctx = [];
          try {
            const composite = `${q.question}\n\nCandidate answer: ${a.candidateText || ''}`;
            const h = crypto.createHash('sha1').update(session.domain + '|' + composite).digest('hex');
            const cacheKey = `rag:ctx:${session.domain}:${h}`;
            const cached = redis.isOpen ? await redis.get(cacheKey) : null;
            if (cached) {
              try { ctx = JSON.parse(cached); } catch { ctx = []; }
            }
            if (!ctx.length) {
              const llama = await queryLlamaIndex(session.domain, composite);
              const sources = (llama?.sources || [])
                .map(s => (typeof s?.text === 'string' ? s.text : ''))
                .filter(Boolean)
                .slice(0, 5);
              ctx = sources;
              if (redis.isOpen && sources.length) {
                await redis.set(cacheKey, JSON.stringify(sources), { EX: 300 });
              }
            }
          } catch {}
          try {
            const ev = await evaluateAnswer({ question: q.question, candidateText: a.candidateText, context: ctx, history: session.history || [] });
            await Answer.updateOne(
              { _id: a._id },
              {
                $set: {
                  eval: { score: ev.score, feedback: ev.feedback },
                  retrievedRefs: ctx,
                  askedDifficulty: q?.difficulty || 'easy',
                  nextSuggestion: {
                    question: ev?.nextQuestion || null,
                    difficulty: ev?.nextDifficulty || undefined,
                  },
                },
              }
            );
          } catch {}
        });
        for (let i = 0; i < tasks.length; i += CONCURRENCY) {
          const batch = tasks.slice(i, i + CONCURRENCY).map(fn => fn());
          await Promise.allSettled(batch);
        }
      }
    }
  } catch {}

  const client = getOllamaClient();
  const system = `You are a rigorous technical interviewer evaluating candidate answers for knowledge depth, accuracy, and clarity. You MUST assess each answer's quality and penalize poor/incoherent responses. Return STRICT minified JSON.`;
  // Reduce payload to speed up inference: keep last 10 QAs and truncate long answers
  const trimmed = (Array.isArray(qa) ? qa : []).slice(-10).map((x) => ({
    question: String(x?.question || '').slice(0, 400),
    answer: String(x?.answer || '').slice(0, 800),
  }));
  const qaBlock = trimmed
    .map((x, i) => `[${i + 1}] Q: ${x.question}\nA: ${x.answer || ''}`)
    .join('\n\n');
  const events = (proctor?.events || []).map((e) => `${e.type}:${e.severity}`).join(', ');
  const prompt = `Evaluate the candidate interview.\n\nQ&A:\n${qaBlock}\n\nProctoring Integrity: ${proctor?.integrity ?? 'N/A'}\nProctoring Events: ${events}\n\nScoring rubric:\n- content_score_10: 0-10 (knowledge depth, correctness, structure, comprehensiveness)\n- delivery_score_10: 0-10 (clarity, conciseness, composure, articulation)\n- integrity_adjustment_10: -3..+0 (deduct when integrity < 0.8 and severe events)\n- overall_score_10 = clamp(content_score_10*0.7 + delivery_score_10*0.3 + integrity_adjustment_10, 0, 10)\n- Convert overall_score_10 to overall_score_100 on a 0-100 scale (multiply by 10 and round).\n\nIMPORTANT: Analyze EACH answer's quality:\n- Brief/insufficient answers (<50 chars) = 0-3 content\n- Vague/incoherent answers = 0-4 content\n- Partial understanding shown = 4-6 content\n- Good coverage with examples = 7-9 content\n- Excellent depth and clarity = 9-10 content\n\nFor weaknesses and improvements, be SPECIFIC to the actual answers provided. If answers are poor, identify exactly what's wrong (e.g., "Answer shows confusion about transaction isolation", "Response lacks technical examples").\n\n- strengths: 3-5 concrete strengths as an array of strings\n- weaknesses: 3-5 concrete weaknesses as an array of strings\n- improvements: 3-5 actionable improvement suggestions as an array of strings\n- confidence: number 0..1 indicating confidence in the assessment (based on answer quality and consistency)\n\nOutput strictly minified JSON with keys: {"content_score_10":number,"delivery_score_10":number,"integrity_adjustment_10":number,"overall_score_10":number,"overall_score_100":number,"strengths":string[],"weaknesses":string[],"improvements":string[],"confidence":number}`;
  const scorerModel = process.env.OLLAMA_SCORER_LLM || process.env.OLLAMA_LLM || 'llama3.2:1b';
  console.log('[computeFinalReport] About to call LLM with model:', scorerModel);
  console.log('[computeFinalReport] Environment OLLAMA_SCORER_LLM:', process.env.OLLAMA_SCORER_LLM);
  
  let data;
  try {
    const response = await client.post('/api/generate', {
      model: scorerModel,
      prompt: `${system}\n\n${prompt}`,
      options: { temperature: 0.3, num_predict: 800, num_ctx: 4096 },
      stream: false,
    });
    data = response.data;
    console.log('[computeFinalReport] LLM response received:', data?.response ? 'success' : 'no response');
  } catch (error) {
    console.error('[computeFinalReport] LLM call failed:', error.message);
    // Fallback to quality-based scoring
    const analyzeQuality = (qa) => {
      if (!qa || !qa.answer) return 0;
      const ans = String(qa.answer).trim();
      const words = ans.split(/\s+/).filter(Boolean).length;
      if (words < 3) return 1;
      if (words < 10) return 2;
      if (words < 20) return 3;
      if (words < 50) return 4;
      return 5;
    };
    const qualities = trimmed.map(analyzeQuality);
    const avgQuality = qualities.reduce((a, b) => a + b, 0) / qualities.length;
    const maxQuality = Math.max(...qualities);
    const hasPoorAnswers = qualities.some(q => q <= 2);
    
    const content10 = Math.max(1, Math.min(10, Math.round(avgQuality * 2)));
    const delivery10 = Math.max(1, Math.min(10, Math.round(avgQuality * 2)));
    const overall10 = Math.round((content10 * 0.7 + delivery10 * 0.3));
    const overall100 = overall10 * 10;
    
    const strengths = hasPoorAnswers ? ['Attempted to answer questions'] : ['Provided detailed responses', 'Showed technical knowledge'];
    const weaknesses = hasPoorAnswers ? ['Answers were too brief', 'Lacked technical detail', 'Incomplete responses'] : ['Could improve technical depth'];
    const improvements = hasPoorAnswers ? ['Provide more detailed answers', 'Include technical examples', 'Explain concepts more thoroughly'] : ['Continue building technical expertise'];
    
    return {
      content_score_10: content10,
      delivery_score_10: delivery10,
      integrity_adjustment_10: 0,
      overall_score_10: overall10,
      overall_score_100: overall100,
      strengths,
      weaknesses,
      improvements,
      confidence: 0.5,
      raw: { fallback: true, avgQuality, maxQuality, hasPoorAnswers }
    };
  }
  const text = data.response || '';
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  // Analyze answer quality BEFORE parsing LLM to prevent lenient scoring
  const analyzeQuality = (qa) => {
    if (!qa || !qa.answer) return 0;
    const ans = String(qa.answer).trim();
    const words = ans.split(/\s+/).filter(w => w.length > 0).length;
    if (words < 3) return 1;
    if (words < 5) return 2;
    if (words < 10) return 3;
    const hasTech = /(because|example|when|how|why|what|difference|compare|explain|means|consists|acidity|transaction)/i.test(ans);
    return hasTech ? 5 : 2;
  };
  const qualities = trimmed.length > 0 ? trimmed.map(analyzeQuality) : [5];
  const avgQuality = qualities.reduce((sum, q) => sum + q, 0) / qualities.length;
  const maxQuality = Math.max(...qualities);
  // Use average for better overall assessment - most answers should be good
  const hasPoorAnswers = avgQuality < 4;
  console.log('[Scoring] Quality analysis:', { avgQuality, maxQuality, qualities, hasPoorAnswers, answers: trimmed.map(qa => ({ q: qa.question.substring(0, 30), a: qa.answer.substring(0, 50) })) });
  
  let parsed = {
    content_score_10: hasPoorAnswers ? Math.max(1, Math.floor(avgQuality)) : 0,
    delivery_score_10: hasPoorAnswers ? Math.max(1, Math.floor(avgQuality)) : 0,
    integrity_adjustment_10: 0,
    overall_score_10: 0,
    overall_score_100: 0,
    strengths: [],
    weaknesses: hasPoorAnswers ? ['Answers are too brief and lack technical depth', 'Unable to demonstrate core concepts'] : [],
    improvements: hasPoorAnswers ? ['Provide detailed explanations with examples', 'Study fundamental concepts before attempting technical interviews'] : [],
    confidence: hasPoorAnswers ? 0.8 : 0.5,
  };
  try {
    if (start !== -1 && end !== -1) parsed = JSON.parse(text.slice(start, end + 1));
  } catch {}
  // Backward compatibility/normalization
  const toNum = (v, def = 0) => (typeof v === 'number' && isFinite(v) ? v : def);
  let content10 = toNum(parsed.content_score_10, toNum(parsed.content_score));
  let delivery10 = toNum(parsed.delivery_score_10, toNum(parsed.delivery_score));
  
  // ENFORCE quality-based scoring for poor answers - override LLM if too lenient
  const beforeContent10 = content10;
  const beforeDelivery10 = delivery10;
  if (hasPoorAnswers && content10 > avgQuality) {
    content10 = Math.floor(avgQuality);
  }
  if (hasPoorAnswers && delivery10 > avgQuality) {
    delivery10 = Math.floor(avgQuality);
  }
  if (hasPoorAnswers && (beforeContent10 !== content10 || beforeDelivery10 !== delivery10)) {
    console.log('[Scoring] Enforced quality-based scoring:', { beforeContent10, content10, beforeDelivery10, delivery10, avgQuality, maxQuality });
  }
  
  const integrityAdj10 = toNum(parsed.integrity_adjustment_10, toNum(parsed.integrity_adjustment));
  let overall10 = toNum(parsed.overall_score_10, toNum(parsed.overall_score));
  if (!overall10 || overall10 < 0 || overall10 > 10) {
    overall10 = Math.max(0, Math.min(10, content10 * 0.7 + delivery10 * 0.3 + integrityAdj10));
  }
  
  // ENFORCE quality-based overall score for poor answers
  if (hasPoorAnswers) {
    const qualityBasedOverall = Math.max(1, Math.min(4, Math.floor(avgQuality) + 1));
    if (overall10 > qualityBasedOverall) {
      overall10 = qualityBasedOverall;
    }
  }
  
  let overall100 = toNum(parsed.overall_score_100);
  if (!overall100 || overall100 < 0 || overall100 > 100) overall100 = Math.round(overall10 * 10);
  
  // FINAL ENFORCEMENT: Override overall100 if LLM gave a lenient score for poor answers
  if (hasPoorAnswers && overall100 > (Math.floor(avgQuality) + 1) * 10) {
    overall100 = Math.round((Math.floor(avgQuality) + 1) * 10);
  }
  
  console.log('[Scoring] Final scores:', { content10, delivery10, overall10, overall100, avgQuality, maxQuality, hasPoorAnswers });
  const strengths = Array.isArray(parsed.strengths) ? parsed.strengths : [];
  const weaknesses = Array.isArray(parsed.weaknesses) ? parsed.weaknesses : [];
  const improvements = Array.isArray(parsed.improvements) ? parsed.improvements : [];
  const confidence = Math.max(0, Math.min(1, toNum(parsed.confidence, 0.5)));

  const report = {
    content_score_10: content10,
    delivery_score_10: delivery10,
    integrity_adjustment_10: integrityAdj10,
    overall_score_10: overall10,
    overall_score_100: overall100,
    strengths,
    weaknesses,
    improvements,
    confidence,
    raw: parsed,
  };
  return report;
}

// Legacy synchronous endpoint (kept for compatibility)
r.post('/final', async (req, res) => {
  const { sessionId, qa = [], proctor = {}, forceRecompute = false } = req.body || {};
  try {
    const report = await computeFinalReport(sessionId, qa, proctor, { forceRecompute });
    // persist in session
    if (sessionId && mongoose.isValidObjectId(sessionId)) {
      await Session.updateOne({ _id: sessionId }, { $set: { finalReport: report, status: 'ended', endedAt: new Date() } });
    }
    res.json({ sessionId, report });
  } catch (e) {
    res.status(500).json({ error: 'final scoring failed' });
  }
});

// Async start endpoint: kicks off in background and returns immediately
r.post('/final/start', async (req, res) => {
  const { sessionId, qa = [], proctor = {}, forceRecompute = false } = req.body || {};
  if (sessionId && mongoose.isValidObjectId(sessionId)) {
    // mark as finalizing to avoid duplicate heavy runs
    await Session.updateOne({ _id: sessionId }, { $set: { status: 'finalizing' } });
  }
  setImmediate(async () => {
    try {
      console.log('[Scoring] Starting async final report computation for session:', sessionId);
      const report = await computeFinalReport(sessionId, qa, proctor, { forceRecompute });
      console.log('[Scoring] Report computed successfully, saving to session');
      console.log('[Scoring] Report data:', { 
        overall_score_100: report?.overall_score_100, 
        overall_score_10: report?.overall_score_10,
        hasReport: !!report 
      });
      if (sessionId && mongoose.isValidObjectId(sessionId)) {
        const updateResult = await Session.updateOne({ _id: sessionId }, { $set: { finalReport: report, status: 'ended', endedAt: new Date() } });
        console.log('[Scoring] Session updated:', { matched: updateResult.matchedCount, modified: updateResult.modifiedCount });
      }
    } catch (e) {
      console.error('[Scoring] FAILED to compute final report:', e.message, e.stack);
      // Set a fallback report if computation fails
      if (sessionId && mongoose.isValidObjectId(sessionId)) {
        const fallbackReport = {
          content_score_10: 2,
          delivery_score_10: 2,
          integrity_adjustment_10: 0,
          overall_score_10: 2,
          overall_score_100: 20,
          strengths: ['Attempted to answer questions'],
          weaknesses: ['Scoring system unavailable'],
          improvements: ['Try again later'],
          confidence: 0.1,
          raw: { error: e.message }
        };
        await Session.updateOne({ _id: sessionId }, { $set: { finalReport: fallbackReport, status: 'ended', endedAt: new Date() } });
        console.log('[Scoring] Fallback report saved');
      }
    }
  });
  res.json({ started: true });
});

// Report fetch endpoint
r.get('/report/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  if (!sessionId || !mongoose.isValidObjectId(sessionId)) return res.json({ ready: false });
  const s = await Session.findById(sessionId).lean();
  if (!s || !s.finalReport) return res.json({ ready: false });
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.json({ ready: true, report: s.finalReport });
});

export default r;
