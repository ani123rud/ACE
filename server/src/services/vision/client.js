import axios from 'axios';
import { getEnv } from '../../config/env.js';

// Simple client for the Python YOLOv3 + Embedding microservice
// Exposes: createReference(imageBase64), verify(imageBase64, referenceEmbedding)

const defaultBase = 'http://localhost:5001';

export function getVisionBase() {
  try {
    const { VISION_BASE_URL } = getEnv();
    return VISION_BASE_URL || defaultBase;
  } catch {
    return defaultBase;
  }
}

async function withRetry(fn, { retries = 1 } = {}) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try { return await fn(); } catch (e) {
      lastErr = e;
      // only retry on network timeouts/aborts
      const code = e?.code || e?.response?.status;
      if (code !== 'ECONNABORTED' && code !== 'ECONNRESET' && code !== 'ETIMEDOUT') break;
      await new Promise(r => setTimeout(r, 800));
    }
  }
  throw lastErr;
}

export async function createReference(imageBase64) {
  const base = getVisionBase();
  return withRetry(async () => {
    const res = await axios.post(`${base}/api/vision/reference`, { image: imageBase64 }, { timeout: 15000 });
    return res.data; // { ok, embedding: number[], meta }
  }, { retries: 1 });
}

export async function verify(imageBase64, referenceEmbedding) {
  const base = getVisionBase();
  return withRetry(async () => {
    const res = await axios.post(`${base}/api/vision/verify`, {
      image: imageBase64,
      referenceEmbedding,
    }, { timeout: 8000 });
    return res.data; // { ok, matchScore, multipleFaces, lookingAway, headPose, facesCount }
  }, { retries: 1 });
}
