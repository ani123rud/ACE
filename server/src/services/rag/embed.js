import { getOllamaClient } from '../../config/ollama.js';

export async function embedTexts(texts) {
  const client = getOllamaClient();
  const results = [];
  for (const t of texts) {
    const { data } = await client.post('/api/embeddings', {
      model: process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text',
      input: t,
    });
    // Ollama embeddings response commonly includes { embedding: number[] }
    // Some variants may return { embeddings: number[][] } for batched input.
    const vec = data.embedding || (Array.isArray(data.embeddings) ? data.embeddings[0] : null);
    if (!vec) throw new Error('Embedding generation failed');
    results.push(vec);
  }
  return results;
}
