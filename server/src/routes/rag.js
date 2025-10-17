import { Router } from 'express';
import multer from 'multer';
import { ingestPdfs, queryDomain, generateQuestions } from '../services/rag/llamaindex.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { redis } from '../config/redis.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });
const r = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STORAGE_ROOT = path.join(__dirname, '..', '..', 'data', 'llamaindex');

// POST /api/rag/ingest
// form-data: domain (text), files[] (PDFs)
r.post('/ingest', upload.array('files', 10), async (req, res) => {
  try {
    const domain = req.body?.domain;
    if (!domain) return res.status(400).json({ error: 'domain is required' });
    const files = (req.files || []).map(f => ({ buffer: f.buffer, originalname: f.originalname }));
    if (!files.length) return res.status(400).json({ error: 'no files uploaded' });
    const result = await ingestPdfs(domain, files);
    res.json(result);
  } catch (e) {
    console.error('[rag] ingest error', e);
    res.status(500).json({ error: 'failed to ingest PDFs' });
  }
});

// POST /api/rag/query
// body: { domain, question }
r.post('/query', async (req, res) => {
  try {
    const { domain, question } = req.body || {};
    if (!domain || !question) return res.status(400).json({ error: 'domain and question are required' });
    const out = await queryDomain(domain, question);
    res.json(out);
  } catch (e) {
    console.error('[rag] query error', e);
    res.status(500).json({ error: String(e?.message || 'query failed') });
  }
});

// POST /api/rag/questions
// body: { domain: string, count?: number, targetDifficulty?: 'easy'|'medium'|'hard', radius?: 0|1|2, persist?: boolean, tags?: string[] }
r.post('/questions', async (req, res) => {
  try {
    const { domain, count = 10, targetDifficulty = 'medium', radius = 1, persist = false, tags = [] } = req.body || {};
    if (!domain) return res.status(400).json({ error: 'domain is required' });

    const normTarget = ['easy','medium','hard'].includes(String(targetDifficulty).toLowerCase()) ? String(targetDifficulty).toLowerCase() : 'medium';
    const rNum = Math.max(0, Math.min(2, Number(radius)));
    const cNum = Math.max(1, Math.min(50, Number(count)));

    const key = `rag:questions:${encodeURIComponent(domain)}:${normTarget}:${rNum}:${cNum}`;
    try {
      if (redis.isOpen) {
        const cached = await redis.get(key);
        if (cached) {
          return res.json({ domain, targetDifficulty: normTarget, radius: rNum, count: cNum, cached: true, items: JSON.parse(cached) });
        }
      }
    } catch {}

    // Fetch a larger pool to allow radius filtering
    const pool = await generateQuestions(domain, Math.min(100, cNum * 3));

    const order = ['easy','medium','hard'];
    const idx = order.indexOf(normTarget);
    const allowed = new Set(order.filter((_, i) => Math.abs(i - idx) <= rNum));
    const filtered = pool.filter(q => allowed.has(q.difficulty)).slice(0, cNum);

    if (!filtered.length && pool.length) filtered.push(...pool.slice(0, cNum));

    // Optional persistence
    if (persist && filtered.length) {
      try {
        const Question = (await import('../models/Question.js')).default;
        const ops = filtered.map((q) => ({
          updateOne: {
            filter: { domain, question: q.question },
            update: {
              $setOnInsert: {
                domain,
                question: q.question,
              },
              $set: {
                difficulty: q.difficulty,
                tags: Array.isArray(tags) ? tags : [],
                source: 'rag:llamaindex',
              },
            },
            upsert: true,
          },
        }));
        await Question.bulkWrite(ops, { ordered: false });
      } catch (e) {
        console.warn('[rag] persist questions failed', e?.message);
      }
    }

    try {
      if (redis.isOpen && filtered.length) {
        await redis.set(key, JSON.stringify(filtered), { EX: 900 });
      }
    } catch {}

    res.json({ domain, targetDifficulty: normTarget, radius: rNum, count: cNum, cached: false, items: filtered });
  } catch (e) {
    console.error('[rag] questions error', e);
    res.status(500).json({ error: 'failed to generate questions' });
  }
});

// GET /api/rag/domains — list domains that have LlamaIndex storage on disk
r.get('/domains', async (_req, res) => {
  try {
    let entries = [];
    try {
      entries = await fs.readdir(STORAGE_ROOT, { withFileTypes: true });
    } catch {
      // storage root may not exist yet
      res.set('Cache-Control', 'no-store');
      return res.json([]);
    }
    const domains = entries
      .filter((e) => e.isDirectory())
      .map((e) => decodeURIComponent(e.name))
      .sort((a, b) => a.localeCompare(b));
    res.set('Cache-Control', 'no-store');
    res.json(domains);
  } catch (e) {
    console.error('[rag] list domains error', e);
    res.status(500).json({ error: 'failed to list domains' });
  }
});

export default r;


