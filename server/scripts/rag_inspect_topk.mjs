#!/usr/bin/env node
import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import { VectorStoreIndex, storageContextFromDefaults, Settings, Ollama, OllamaEmbedding } from 'llamaindex';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function domainPath(domain) {
  const root = path.join(__dirname, '..', 'data', 'llamaindex');
  return path.join(root, encodeURIComponent(domain));
}

function configureFromEnv() {
  const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  const llmModel = process.env.OLLAMA_LLM || 'llama3.1';
  const embedModel = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';
  Settings.llm = new Ollama({ model: llmModel, baseUrl });
  Settings.embedModel = new OllamaEmbedding({ model: embedModel, baseUrl });
}

function parseArgs() {
  const [, , ...argv] = process.argv;
  const args = { domain: '', query: '', k: 5 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--domain' || a === '-d') args.domain = argv[++i];
    else if (a === '--query' || a === '-q') args.query = argv[++i];
    else if (a === '--k' || a === '-k') args.k = Number(argv[++i] || 5);
  }
  if (!args.domain || !args.query) {
    console.log('Usage: node scripts/rag_inspect_topk.mjs --domain <name> --query "<question>" [--k 5]');
    process.exit(1);
  }
  if (!Number.isFinite(args.k) || args.k <= 0) args.k = 5;
  return args;
}

function snippet(text = '', max = 220) {
  const t = String(text).replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max) + '…' : t;
}

async function main() {
  const { domain, query, k } = parseArgs();
  configureFromEnv();
  const dPath = domainPath(domain);
  const storageContext = await storageContextFromDefaults({ persistDir: dPath });
  let index;
  try {
    index = await VectorStoreIndex.init({ storageContext });
  } catch (e) {
    console.error(`[ERROR] No index for domain "${domain}". Ingest PDFs first.`);
    process.exit(2);
  }

  // Use query engine with top-k control so we also get .sourceNodes
  const engine = index.asQueryEngine({ similarityTopK: k });
  const resp = await engine.query({ query });
  const nodes = resp?.sourceNodes || [];

  console.log(`\nTop-${k} chunks for domain="${domain}" query="${query}":\n`);
  nodes.slice(0, k).forEach((n, i) => {
    const score = typeof n.score === 'number' ? n.score.toFixed(4) : String(n.score);
    const meta = n?.node?.metadata || n?.metadata || {};
    const text = n?.node?.getContent?.() || n?.text || '';
    console.log(`[#${i + 1}] score=${score} file=${meta.filename ?? 'N/A'} chunk=${meta.chunk ?? 'N/A'}`);
    console.log(snippet(text));
    console.log('---');
  });

  if (typeof resp?.response === 'string') {
    console.log('\nLLM Answer (truncated):');
    console.log(snippet(resp.response, 400));
  }
}

main().catch((e) => {
  console.error('[FATAL]', e?.message || e);
  process.exit(3);
});
