import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import { getDocument } from 'pdfjs-dist';
import {
  Document,
  VectorStoreIndex,
  storageContextFromDefaults,
  serviceContextFromDefaults,
  Settings,
  Ollama,
  OllamaEmbedding,
} from 'llamaindex';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STORAGE_ROOT = path.join(__dirname, '../../../data/llamaindex');

async function ensureDir(p) {
  await fsp.mkdir(p, { recursive: true });
}

function domainPath(domain) {
  return path.join(STORAGE_ROOT, encodeURIComponent(domain));
}

function configureLlamaIndexFromEnv() {
  const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  const llmModel = process.env.OLLAMA_LLM || 'llama3.1';
  const embedModel = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';
  Settings.llm = new Ollama({ model: llmModel, baseUrl });
  Settings.embedModel = new OllamaEmbedding({ model: embedModel, baseUrl });
}

async function parsePdfToText(fileBuffer) {
  const data = new Uint8Array(fileBuffer);
  // Provide standardFontDataUrl to avoid warnings/errors in Node
  const candidates = [
    // when running from monorepo root (cwd=f:/ACE)
    path.join(process.cwd(), 'server', 'node_modules', 'pdfjs-dist', 'standard_fonts') + path.sep,
    // when running with cwd=f:/ACE/server
    path.join(process.cwd(), 'node_modules', 'pdfjs-dist', 'standard_fonts') + path.sep,
    // relative to this file's directory (../../.. => server/)
    path.join(__dirname, '..', '..', '..', 'node_modules', 'pdfjs-dist', 'standard_fonts') + path.sep,
  ];
  const standardFontDataUrl = candidates.find(p => {
    try { return fs.existsSync(p); } catch { return false; }
  }) || candidates[0];
  const loadingTask = getDocument({ data, standardFontDataUrl });
  const pdf = await loadingTask.promise;
  let out = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map((it) => (it?.str ?? '')).join(' ');
    out += pageText + '\n';
  }
  try { await pdf.cleanup?.(); } catch {}
  return out;
}

export async function ingestPdfs(domain, files) {
  configureLlamaIndexFromEnv();
  // files: array of { buffer, originalname }
  await ensureDir(STORAGE_ROOT);
  const dPath = domainPath(domain);
  await ensureDir(dPath);

  const docs = [];
  for (const f of files) {
    const text = await parsePdfToText(f.buffer);
    if (!text?.trim()) continue;
    docs.push(new Document({
      text,
      metadata: { domain, filename: f.originalname },
    }));
  }
  if (!docs.length) return { added: 0 };

  // Initialize or load existing index storage
  const storageContext = await storageContextFromDefaults({ persistDir: dPath });
  let index;
  try {
    index = await VectorStoreIndex.init({ storageContext });
  } catch {
    index = null;
  }

  if (!index) {
    // create new index from docs
    index = await VectorStoreIndex.fromDocuments(docs, {
      storageContext,
      serviceContext: serviceContextFromDefaults({ llm: Settings.llm, embedModel: Settings.embedModel }),
    });
  } else {
    // append by inserting into existing index
    const insert = index.asRetriever();
    // LlamaIndex JS currently supports insert via index.insert if available
    if (typeof index.insert === 'function') {
      for (const d of docs) {
        // @ts-ignore
        await index.insert(d);
      }
      try {
        if (typeof storageContext?.persist === 'function') {
          await storageContext.persist();
        } else if (typeof index?.persist === 'function') {
          await index.persist();
        }
      } catch {}
    } else {
      // fallback: rebuild with existing + new docs
      // Load existing nodes via query engine context is non-trivial; rebuild from docs only
      index = await VectorStoreIndex.fromDocuments(docs, {
        storageContext,
        serviceContext: serviceContextFromDefaults({ llm: Settings.llm, embedModel: Settings.embedModel }),
      });
    }
  }

  // Persist index storage if supported by current LlamaIndex version
  try {
    if (typeof storageContext?.persist === 'function') {
      await storageContext.persist();
    } else if (typeof index?.persist === 'function') {
      await index.persist();
    }
  } catch {}

  return { added: docs.length };
}

export async function queryDomain(domain, question) {
  configureLlamaIndexFromEnv();
  const dPath = domainPath(domain);
  const storageContext = await storageContextFromDefaults({ persistDir: dPath });
  let index;
  try {
    index = await VectorStoreIndex.init({ storageContext });
  } catch (e) {
    throw new Error('No index for domain. Ingest PDFs first.');
  }
  const engine = index.asQueryEngine();
  const resp = await engine.query({ query: question });
  // resp has .response and .sourceNodes
  const sources = (resp.sourceNodes || []).map((n) => ({
    score: n.score,
    text: n.node?.getContent?.() || n.text || '',
    metadata: n.node?.metadata || {},
  }));
  return { answer: String(resp.response ?? ''), sources };
}

export async function generateQuestions(domain, count = 10) {
  configureLlamaIndexFromEnv();
  const dPath = domainPath(domain);
  const storageContext = await storageContextFromDefaults({ persistDir: dPath });
  let index;
  try {
    index = await VectorStoreIndex.init({ storageContext });
  } catch (e) {
    throw new Error('No index for domain. Ingest PDFs first.');
  }
  const engine = index.asQueryEngine();
  const prompt = `You are an expert interviewer. Based ONLY on the provided knowledge base, generate ${count} crisp interview questions for the domain "${domain}".
Return STRICT JSON array of objects: [{"question": string, "difficulty": "easy"|"medium"|"hard"}] with no extra text.`;
  const resp = await engine.query({ query: prompt });
  const text = String(resp?.response || '');
  let items = [];
  try {
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start !== -1 && end !== -1) items = JSON.parse(text.slice(start, end + 1));
  } catch {}
  if (!Array.isArray(items) || items.length === 0) {
    // Fallback: split lines into questions
    const lines = text.split(/\n|\r/).map(s => s.trim()).filter(Boolean);
    items = lines.slice(0, count).map(q => ({ question: q.replace(/^[-*\d.\)]\s*/, ''), difficulty: 'medium' }));
  }
  // normalize
  return items
    .map(it => ({ question: String(it?.question || '').trim(), difficulty: /^(easy|medium|hard)$/i.test(it?.difficulty) ? it.difficulty.toLowerCase() : 'medium' }))
    .filter(it => it.question)
    .slice(0, count);
}
