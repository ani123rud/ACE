import { redis } from '../config/redis.js';

export const STREAMS = {
  RAG_INGEST: 'rag:ingest',
};

export const GROUPS = {
  RAG_INGEST: 'rag-workers',
};

export async function ensureStreamGroup(stream, group) {
  try {
    await redis.xGroupCreate(stream, group, '0', { MKSTREAM: true });
  } catch (e) {
    if (!(e?.message || '').includes('BUSYGROUP')) {
      throw e;
    }
  }
}

export async function enqueue(stream, payloadObj) {
  const fields = [];
  for (const [k, v] of Object.entries(payloadObj || {})) {
    fields.push(k, typeof v === 'string' ? v : JSON.stringify(v));
  }
  const id = await redis.xAdd(stream, '*', fields, { TRIM: { strategy: 'MAXLEN', strategyModifier: '~', threshold: 1000 } });
  return id;
}
