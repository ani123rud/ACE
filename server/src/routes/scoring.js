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
async function computeFinalReport(sessionId, qa = [], proctor = {}) {
  const DEFER = /^true$/i.test(process.env.DEFER_EVAL || 'false');
  // If a report already exists, return it immediately
  if (sessionId && mongoose.isValidObjectId(sessionId)) {
    const existing = await Session.findById(sessionId).lean();
    if (existing?.finalReport) return existing.finalReport;
  }
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
            await Answer.updateOne({ _id: a._id }, { $set: { eval: { score: ev.score, feedback: ev.feedback }, retrievedRefs: ctx } });
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
  const system = `You are an expert interviewer evaluating both content and delivery under proctoring constraints. Return STRICT minified JSON.`;
  // Reduce payload to speed up inference: keep last 10 QAs and truncate long answers
  const trimmed = (Array.isArray(qa) ? qa : []).slice(-10).map((x) => ({
    question: String(x?.question || '').slice(0, 300),
    answer: String(x?.answer || '').slice(0, 600),
  }));
  const qaBlock = trimmed
    .map((x, i) => `[${i + 1}] Q: ${x.question}\nA: ${x.answer || ''}`)
    .join('\n\n');
  const events = (proctor?.events || []).map((e) => `${e.type}:${e.severity}`).join(', ');
  const prompt = `Evaluate the candidate interview.\n\nQ&A:\n${qaBlock}\n\nProctoring Integrity: ${proctor?.integrity ?? 'N/A'}\nProctoring Events: ${events}\n\nScoring rubric:\n- content_score_10: 0-10 (knowledge depth, correctness, structure)\n- delivery_score_10: 0-10 (clarity, conciseness, composure)\n- integrity_adjustment_10: -3..+0 (deduct when integrity < 0.8 and severe events)\n- overall_score_10 = clamp(content_score_10*0.7 + delivery_score_10*0.3 + integrity_adjustment_10, 0, 10)\n- Convert overall_score_10 to overall_score_100 on a 0-100 scale (multiply by 10 and round).\n- strengths: 3-5 concrete strengths as an array of strings\n- weaknesses: 3-5 concrete weaknesses as an array of strings\n- improvements: 3-5 actionable improvement suggestions as an array of strings\n- confidence: number 0..1 indicating confidence in the assessment (based on answer quality and consistency)\n\nOutput strictly minified JSON with keys: {"content_score_10":number,"delivery_score_10":number,"integrity_adjustment_10":number,"overall_score_10":number,"overall_score_100":number,"strengths":string[],"weaknesses":string[],"improvements":string[],"confidence":number}`;
  const scorerModel = process.env.OLLAMA_SCORER_LLM || process.env.OLLAMA_LLM || 'mistral';
  const { data } = await client.post('/api/generate', {
    model: scorerModel,
    prompt: `${system}\n\n${prompt}`,
    options: { temperature: 0.2, num_predict: 200, num_ctx: 2048 },
    stream: false,
  });
  const text = data.response || '';
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  let parsed = {
    content_score_10: 0,
    delivery_score_10: 0,
    integrity_adjustment_10: 0,
    overall_score_10: 0,
    overall_score_100: 0,
    strengths: [],
    weaknesses: [],
    improvements: [],
    confidence: 0.5,
  };
  try {
    if (start !== -1 && end !== -1) parsed = JSON.parse(text.slice(start, end + 1));
  } catch {}
  // Backward compatibility/normalization
  const toNum = (v, def = 0) => (typeof v === 'number' && isFinite(v) ? v : def);
  const content10 = toNum(parsed.content_score_10, toNum(parsed.content_score));
  const delivery10 = toNum(parsed.delivery_score_10, toNum(parsed.delivery_score));
  const integrityAdj10 = toNum(parsed.integrity_adjustment_10, toNum(parsed.integrity_adjustment));
  let overall10 = toNum(parsed.overall_score_10, toNum(parsed.overall_score));
  if (!overall10 || overall10 < 0 || overall10 > 10) {
    overall10 = Math.max(0, Math.min(10, content10 * 0.7 + delivery10 * 0.3 + integrityAdj10));
  }
  let overall100 = toNum(parsed.overall_score_100);
  if (!overall100 || overall100 < 0 || overall100 > 100) overall100 = Math.round(overall10 * 10);
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
  const { sessionId, qa = [], proctor = {} } = req.body || {};
  try {
    const report = await computeFinalReport(sessionId, qa, proctor);
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
  const { sessionId, qa = [], proctor = {} } = req.body || {};
  if (sessionId && mongoose.isValidObjectId(sessionId)) {
    // mark as finalizing to avoid duplicate heavy runs
    await Session.updateOne({ _id: sessionId }, { $set: { status: 'finalizing' } });
  }
  setImmediate(async () => {
    try {
      const report = await computeFinalReport(sessionId, qa, proctor);
      if (sessionId && mongoose.isValidObjectId(sessionId)) {
        await Session.updateOne({ _id: sessionId }, { $set: { finalReport: report, status: 'ended', endedAt: new Date() } });
      }
    } catch {}
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
