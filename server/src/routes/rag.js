import { Router } from 'express';
import multer from 'multer';
import { ingestPdfs, queryDomain } from '../services/rag/llamaindex.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
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

// GET /api/rag/domains — list domains that have LlamaIndex storage on disk
r.get('/domains', async (_req, res) => {
  try {
    let entries = [];
    try {
      entries = await fs.readdir(STORAGE_ROOT, { withFileTypes: true });
    } catch {
      // storage root may not exist yet
      return res.json([]);
    }
    const domains = entries
      .filter((e) => e.isDirectory())
      .map((e) => decodeURIComponent(e.name))
      .sort((a, b) => a.localeCompare(b));
    res.json(domains);
  } catch (e) {
    console.error('[rag] list domains error', e);
    res.status(500).json({ error: 'failed to list domains' });
  }
});

export default r;

