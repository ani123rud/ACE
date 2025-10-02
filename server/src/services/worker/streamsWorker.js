import { initRedis, redis } from '../../config/redis.js';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { connectMongo } from '../../config/db.js';
import { ensureGroups, Streams } from '../../utils/streams.js';
import Alert from '../../models/Alert.js';
import { putObject } from '../../utils/storage.js';
import { evaluateAnswer } from '../rag/evaluator.js';
import Session from '../../models/Session.js';
import Answer from '../../models/Answer.js';
import Question from '../../models/Question.js';
import { queryDomain as queryLlamaIndex } from '../rag/llamaindex.js';
import crypto from 'crypto';
import { redis as redisClient } from '../../config/redis.js';

dotenv.config();

const GROUP = process.env.STREAMS_GROUP || 'ace_group';
const CONCURRENCY = Number(process.env.STREAMS_CONCURRENCY || 3);

async function handleAlert(entry) {
  const fields = Object.fromEntries(entry[1]);
  const sessionId = fields.sessionId;
  const type = fields.type;
  const message = fields.message;
  const severity = fields.severity || 'low';
  const at = Number(fields.at || Date.now());
  let evidenceUrl = undefined;
  try {
    // If evidenceKey is a data URL or base64, store it
    const rawData = fields.data ? JSON.parse(fields.data) : {};
    if (rawData && rawData.evidenceB64) {
      const b64 = String(rawData.evidenceB64).replace(/^data:[^;]+;base64,/, '');
      const buf = Buffer.from(b64, 'base64');
      const key = `evidence/${sessionId}/${at}.jpg`;
      const saved = await putObject(key, buf, 'image/jpeg');
      evidenceUrl = saved.url;
    }
    await Alert.create({ sessionId, type, message, severity, at, evidenceUrl, raw: fields });
  } catch (e) {
    // swallow to keep worker resilient
  }
}

async function handleTask(entry) {
  const fields = Object.fromEntries(entry[1]);
  const type = fields.type;
  const payload = fields.payload ? JSON.parse(fields.payload) : {};
  if (type === 'FINAL_SCORE') {
    const { sessionId } = payload || {};
    if (!sessionId || !mongoose.isValidObjectId(sessionId)) return;
    const session = await Session.findById(sessionId).lean();
    if (!session) return;
    const answers = await Answer.find({ sessionId }).lean();
    for (let i = 0; i < answers.length; i++) {
      const a = answers[i];
      if (a?.eval?.score != null && a?.eval?.feedback) continue;
      const q = await Question.findById(a.questionId).lean();
      if (!q) continue;
      let ctx = [];
      try {
        const composite = `${q.question}\n\nCandidate answer: ${a.candidateText || ''}`;
        const h = crypto.createHash('sha1').update(session.domain + '|' + composite).digest('hex');
        const cacheKey = `rag:ctx:${session.domain}:${h}`;
        const cached = redisClient.isOpen ? await redisClient.get(cacheKey) : null;
        if (cached) {
          try { ctx = JSON.parse(cached) || []; } catch { ctx = []; }
        }
        if (!ctx.length) {
          const llama = await queryLlamaIndex(session.domain, composite);
          const sources = (llama?.sources || [])
            .map(s => (typeof s?.text === 'string' ? s.text : ''))
            .filter(Boolean)
            .slice(0, 5);
          ctx = sources;
        }
      } catch {}
      try {
        const ev = await evaluateAnswer({ question: q.question, candidateText: a.candidateText, context: ctx, history: session.history || [] });
        await Answer.updateOne({ _id: a._id }, { $set: { eval: { score: ev.score, feedback: ev.feedback } } });
      } catch {}
    }
  }
}

async function run() {
  await connectMongo();
  await initRedis();
  await ensureGroups(GROUP);

  const consumers = [
    consume(Streams.ALERTS_STREAM, handleAlert),
    consume(Streams.TASKS_STREAM, handleTask),
  ];
  await Promise.all(consumers);
}

async function consume(stream, handler) {
  const name = `${stream}-consumer-${Math.random().toString(36).slice(2, 7)}`;
  while (true) {
    try {
      const resp = await redis.xReadGroup(GROUP, name, { key: stream, id: '>' }, { COUNT: CONCURRENCY, BLOCK: 5000 });
      if (!resp) continue;
      for (const s of resp) {
        for (const entry of s.messages) {
          try {
            await handler(entry);
            await redis.xAck(stream, GROUP, entry.id);
          } catch {}
        }
      }
    } catch (e) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

run().catch((e) => {
  console.error('[streamsWorker] fatal', e);
  process.exit(1);
});
