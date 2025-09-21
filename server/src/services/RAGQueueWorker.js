import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { initRedis, redis } from '../config/redis.js';
import { STREAMS, GROUPS, ensureStreamGroup } from './queue.js';
import { ingestPdfs } from './rag/llamaindex.js';

dotenv.config();

async function processMessage(id, fields) {
  // fields is an array like [k1, v1, k2, v2, ...]
  const obj = {};
  for (let i = 0; i < fields.length; i += 2) {
    const k = fields[i];
    let v = fields[i + 1];
    try {
      v = JSON.parse(v);
    } catch {}
    obj[k] = v;
  }
  const domain = obj.domain;
  const filePath = obj.path;
  const originalname = obj.originalname || path.basename(filePath || '');
  if (!domain || !filePath) {
    console.warn('[RAGWorker] invalid job', id, obj);
    return;
  }
  const buf = await fs.readFile(filePath);
  // ingest single file as an array
  await ingestPdfs(domain, [{ buffer: buf, originalname }]);
  // cleanup file after success
  try { await fs.unlink(filePath); } catch {}
}

async function run() {
  await initRedis();
  await ensureStreamGroup(STREAMS.RAG_INGEST, GROUPS.RAG_INGEST);
  const consumer = `c-${process.pid}`;
  console.log(`[RAGWorker] listening on stream=${STREAMS.RAG_INGEST} group=${GROUPS.RAG_INGEST} consumer=${consumer}`);
  while (true) {
    try {
      const resp = await redis.xReadGroup(GROUPS.RAG_INGEST, consumer, [{ key: STREAMS.RAG_INGEST, id: '>' }], { COUNT: 10, BLOCK: 5000 });
      if (!resp) continue; // timeout
      for (const stream of resp) {
        for (const msg of stream.messages) {
          try {
            await processMessage(msg.id, msg.message);
            await redis.xAck(STREAMS.RAG_INGEST, GROUPS.RAG_INGEST, msg.id);
          } catch (e) {
            console.error('[RAGWorker] job error', msg.id, e);
            // Optionally add retry/dead letter logic
          }
        }
      }
    } catch (e) {
      console.error('[RAGWorker] loop error', e);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

run().catch((e) => {
  console.error('[RAGWorker] fatal', e);
  process.exit(1);
});
