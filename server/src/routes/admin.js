import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fsp from 'fs/promises';
import { enqueue, STREAMS } from '../services/queue.js';
import Question from '../models/Question.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const r = Router();

function checkAdmin(req, res, next) {
  const configured = process.env.ADMIN_TOKEN;
  const hdr = req.headers['x-admin-token'] || req.headers['authorization'] || '';
  const token = typeof hdr === 'string' && hdr.toLowerCase().startsWith('bearer ')
    ? hdr.slice(7)
    : hdr;
  if (!configured || token !== configured) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

// POST /api/admin/rag/ingest
// headers: { x-admin-token: <ADMIN_TOKEN> } or Authorization: Bearer <ADMIN_TOKEN>
// form-data: domain (text), files[] (PDFs)
r.post('/rag/ingest', checkAdmin, upload.array('files', 10), async (req, res) => {
  try {
    const domain = req.body?.domain;
    if (!domain) return res.status(400).json({ error: 'domain is required' });
    const files = (req.files || []).map(f => ({ buffer: f.buffer, originalname: f.originalname }));
    if (!files.length) return res.status(400).json({ error: 'no files uploaded' });
    // Persist uploaded buffers to temp folder so worker can read later
    const uploadsDir = path.join(process.cwd(), 'server', 'tmp', 'uploads');
    await fsp.mkdir(uploadsDir, { recursive: true });
    const jobIds = [];
    for (const f of files) {
      const safeName = `${Date.now()}-${Math.random().toString(36).slice(2)}-${f.originalname.replace(/[^a-zA-Z0-9_.-]/g, '_')}`;
      const absPath = path.join(uploadsDir, safeName);
      await fsp.writeFile(absPath, f.buffer);
      const id = await enqueue(STREAMS.RAG_INGEST, { domain, path: absPath, originalname: f.originalname });
      jobIds.push(id);
    }
    // Return quickly; worker will process asynchronously
    res.json({ queued: files.length, jobIds });
  } catch (e) {
    console.error('[admin:RAG] enqueue error', e);
    res.status(500).json({ error: 'failed to enqueue PDFs for ingestion' });
  }
});

export default r;

// POST /api/admin/seed/questions
// headers: { x-admin-token: <ADMIN_TOKEN> }
// body: { domain: string, items?: Array<{ question: string, difficulty?: 'easy'|'medium'|'hard' }> }
// If items not provided, a default seed set will be used for certain domains.
r.post('/seed/questions', checkAdmin, async (req, res) => {
  try {
    const { domain, items } = req.body || {};
    if (!domain) return res.status(400).json({ error: 'domain is required' });

    let seed = Array.isArray(items) ? items : null;
    if (!seed) {
      const d = String(domain).toLowerCase();
      if (d === 'dbms') {
        seed = [
          { question: 'What is normalization in DBMS and why is it used?', difficulty: 'easy' },
          { question: 'Explain the differences between 1NF, 2NF, and 3NF with examples.', difficulty: 'medium' },
          { question: 'What is a transaction? Explain ACID properties.', difficulty: 'easy' },
          { question: 'How does indexing improve query performance? What are the trade-offs?', difficulty: 'medium' },
          { question: 'Describe deadlocks and strategies to handle them in databases.', difficulty: 'hard' },
          { question: 'Differentiate between clustered and non-clustered indexes.', difficulty: 'medium' },
          { question: 'What is the difference between primary key, unique key, and foreign key?', difficulty: 'easy' },
          { question: 'Explain normalization vs denormalization and when to use each.', difficulty: 'medium' },
          { question: 'How does concurrency control work? Compare optimistic vs pessimistic locking.', difficulty: 'hard' },
          { question: 'Explain the concept of isolation levels and phenomena like dirty reads, non-repeatable reads, and phantom reads.', difficulty: 'hard' },
          { question: 'What are B-Trees and why are they used in databases?', difficulty: 'medium' },
          { question: 'How would you design a schema for an e-commerce order system?', difficulty: 'medium' }
        ];
      } else if (d === 'javascript') {
        seed = [
          { question: 'Explain event loop and task/microtask queues in JavaScript.', difficulty: 'medium' },
          { question: 'What are closures and how are they used?', difficulty: 'easy' },
          { question: 'Differentiate between var, let, and const.', difficulty: 'easy' },
          { question: 'What is prototypal inheritance?', difficulty: 'medium' }
        ];
      } else {
        seed = [
          { question: `Provide an overview of fundamentals in ${domain}.`, difficulty: 'easy' },
          { question: `Explain intermediate concepts in ${domain} with examples.`, difficulty: 'medium' },
          { question: `Discuss advanced topics and trade-offs in ${domain}.`, difficulty: 'hard' },
        ];
      }
    }

    const docs = seed
      .map(it => ({ domain, question: String(it?.question || '').trim(), difficulty: (it?.difficulty || 'medium').toLowerCase() }))
      .filter(it => it.question);
    if (!docs.length) return res.json({ inserted: 0 });

    // Avoid duplicates by upserting based on (domain, question)
    let inserted = 0;
    for (const d of docs) {
      const existing = await Question.findOne({ domain, question: d.question }).lean();
      if (existing) continue;
      await Question.create(d);
      inserted += 1;
    }
    res.json({ inserted, domain });
  } catch (e) {
    console.error('[admin:seed] error', e);
    res.status(500).json({ error: 'failed to seed questions' });
  }
});
