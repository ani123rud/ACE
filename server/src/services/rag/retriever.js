import Material from '../../models/Material.js';

function cosine(a, b) {
  const dot = a.reduce((s, v, i) => s + v * (b[i] ?? 0), 0);
  const na = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
  const nb = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
  return dot / (na * nb + 1e-9);
}

export async function retrieveContextByEmbedding(embedding, domain, k = 5) {
  const mats = await Material.find({ domain }).select('text embedding').lean();
  const scored = mats.map(m => ({ text: m.text, score: cosine(embedding, m.embedding || []) }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k).map(s => s.text);
}
