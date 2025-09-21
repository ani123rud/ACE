import { Router } from 'express';
import Session from '../models/Session.js';
import Question from '../models/Question.js';
import Answer from '../models/Answer.js';
import { embedTexts } from '../services/rag/embed.js';
import { retrieveContextByEmbedding } from '../services/rag/retriever.js';
import { evaluateAnswer } from '../services/rag/evaluator.js';
import { queryDomain as queryLlamaIndex, generateQuestions } from '../services/rag/llamaindex.js';
import crypto from 'crypto';
import { redis } from '../config/redis.js';
import mongoose from 'mongoose';

const r = Router();

r.post('/start', async (req, res) => {
  const { candidateEmail, domain } = req.body || {};
  // Ensure an intro question exists for a friendly start
  const introText = 'Please introduce yourself briefly.';
  let intro = await Question.findOne({ domain, question: introText }).lean();
  if (!intro) {
    try {
      intro = await Question.create({ domain, question: introText, difficulty: 'easy' });
      intro = intro.toObject();
    } catch {}
  }
  let pool = await Question.find({ domain }).lean();
  if (!pool.length) {
    // Fallback: generate a set of questions from the domain's ingested PDFs via LlamaIndex
    try {
      const generated = await generateQuestions(domain, 12);
      if (Array.isArray(generated) && generated.length) {
        const docs = generated.map(g => ({ domain, question: g.question, difficulty: g.difficulty || 'medium' }));
        await Question.insertMany(docs);
        pool = await Question.find({ domain }).lean();
      }
    } catch (e) {
      return res.status(400).json({ error: 'No questions available for domain and failed to auto-generate. Ensure PDFs are ingested.' });
    }
  }
  if (!pool.length) return res.status(400).json({ error: 'No questions available for domain' });
  // Prefer the intro question if available
  const first = intro || pool[Math.floor(Math.random() * pool.length)];
  const session = await Session.create({ candidateEmail, domain, status: 'active', progress: { index: 0, total: 10 }, history: [] });
  return res.json({ sessionId: session._id, firstQ: { id: first._id, text: first.question } });
});

r.post('/answer', async (req, res) => {
  const { sessionId, questionId, candidateText } = req.body || {};
  const session = await Session.findById(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const q = await Question.findById(questionId).lean();
  if (!q) return res.status(404).json({ error: 'Question not found' });
  const DEFER = /^true$/i.test(process.env.DEFER_EVAL || 'false');
  const FAST_FLOW = /^true$/i.test(process.env.FAST_FLOW || 'false');

  let ctx = [];
  let evalRes = { score: null, feedback: null, nextDifficulty: 'medium' };

  if (!DEFER) {
    try {
      // Prefer LlamaIndex retrieval for context, with Redis cache-aside
      const compositeQuery = `${q.question}\n\nCandidate answer: ${candidateText || ''}`;
      const h = crypto.createHash('sha1').update(session.domain + '|' + compositeQuery).digest('hex');
      const cacheKey = `rag:ctx:${session.domain}:${h}`;
      const cached = redis.isOpen ? await redis.get(cacheKey) : null;
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          ctx = Array.isArray(parsed) ? parsed : [];
        } catch {
          ctx = [];
        }
      }
      if (!ctx.length) {
        const llama = await queryLlamaIndex(session.domain, compositeQuery);
        const sources = (llama?.sources || [])
          .map(s => (typeof s?.text === 'string' ? s.text : ''))
          .filter(Boolean)
          .slice(0, 5);
        ctx = sources;
        // set short TTL to keep API fast for repeated queries
        if (redis.isOpen && sources.length) {
          await redis.set(cacheKey, JSON.stringify(sources), { EX: 300 });
        }
      }
    } catch (e) {
      // Fallback to existing embedding-based retriever if LlamaIndex unavailable
      try {
        const [ansEmbed] = await embedTexts([candidateText || '']);
        ctx = await retrieveContextByEmbedding(ansEmbed, session.domain, 5);
      } catch {}
    }
  }

  if (!DEFER && !FAST_FLOW) {
    // Inline evaluation (can be slower)
    try {
      evalRes = await evaluateAnswer({ question: q.question, candidateText, context: ctx, history: session.history });
    } catch {
      evalRes = { score: null, feedback: 'Evaluator is busy. Continuing to next question shortly.', nextDifficulty: 'medium' };
    }
  }

  const saved = await Answer.create({
    sessionId,
    questionId,
    candidateText,
    eval: DEFER ? undefined : { score: evalRes.score, feedback: evalRes.feedback },
    retrievedRefs: ctx,
  });
  session.history.push({ questionId: saved.questionId || questionId, answerId: saved._id, score: DEFER ? null : evalRes.score });
  session.progress.index += 1;
  await session.save();

  // If FAST_FLOW, do evaluation in background and update the answer later
  if (FAST_FLOW) {
    setImmediate(async () => {
      try {
        let bgCtx = ctx;
        if (!bgCtx.length) {
          try {
            const compositeQuery = `${q.question}\n\nCandidate answer: ${candidateText || ''}`;
            const h = crypto.createHash('sha1').update(session.domain + '|' + compositeQuery).digest('hex');
            const cacheKey = `rag:ctx:${session.domain}:${h}`;
            const cached = redis.isOpen ? await redis.get(cacheKey) : null;
            if (cached) {
              try { bgCtx = JSON.parse(cached) || []; } catch { bgCtx = []; }
            }
            if (!bgCtx.length) {
              const llama = await queryLlamaIndex(session.domain, compositeQuery);
              const sources = (llama?.sources || [])
                .map(s => (typeof s?.text === 'string' ? s.text : ''))
                .filter(Boolean)
                .slice(0, 5);
              bgCtx = sources;
              if (redis.isOpen && sources.length) await redis.set(cacheKey, JSON.stringify(sources), { EX: 300 });
            }
          } catch {}
        }
        const ev = await evaluateAnswer({ question: q.question, candidateText, context: bgCtx, history: session.history || [] });
        await Answer.updateOne({ _id: saved._id }, { $set: { eval: { score: ev.score, feedback: ev.feedback }, retrievedRefs: bgCtx } });
      } catch {}
    });
  }

  // Always pick next from DB to ensure a valid questionId (avoid adhoc null IDs)
  let nextQ = null;
  const askedIds = (session.history || [])
    .map(h => h?.questionId)
    .filter(Boolean);
  const desiredDiff = evalRes?.nextDifficulty || 'medium';
  // First try desired difficulty excluding asked
  let pool = await Question.find({ domain: session.domain, difficulty: desiredDiff, _id: { $nin: askedIds } }).lean();
  // Fallback: any remaining in domain excluding asked
  if (!pool.length) {
    pool = await Question.find({ domain: session.domain, _id: { $nin: askedIds } }).lean();
  }
  // If still nothing, try to auto-generate a few fresh questions
  if (!pool.length) {
    try {
      const generated = await generateQuestions(session.domain, 6);
      if (Array.isArray(generated) && generated.length) {
        const docs = generated.map(g => ({ domain: session.domain, question: g.question, difficulty: g.difficulty || 'medium' }));
        await Question.insertMany(docs);
        pool = await Question.find({ domain: session.domain, _id: { $nin: askedIds } }).lean();
      }
    } catch {}
  }
  // As a last resort, allow reuse (drop exclusion) so flow continues
  if (!pool.length) {
    pool = await Question.find({ domain: session.domain }).lean();
  }
  if (pool.length) {
    const pick = pool[Math.floor(Math.random() * pool.length)];
    nextQ = { id: pick._id, text: pick.question };
  }

  // In FAST_FLOW, avoid per-answer feedback to keep UI snappy
  res.json({ feedback: (DEFER || FAST_FLOW) ? null : evalRes.feedback, nextQuestion: nextQ, progress: session.progress });
});

export default r;
