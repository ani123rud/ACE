import { Router } from 'express';
import FaceRef from '../models/FaceRef.js';
import { verify as verifyVision, createReference as createVisionRef } from '../services/vision/client.js';

const r = Router();

// Save initial reference face image (base64) and create embedding via Python service
r.post('/reference', async (req, res) => {
  const { sessionId, imageBase64 } = req.body || {};
  if (!imageBase64) return res.status(400).json({ error: 'imageBase64 required' });
  try {
    const resp = await createVisionRef(imageBase64);
    const embedding = resp?.embedding || [];
    const meta = resp?.meta || { method: 'arcface', model: 'r100' };
    const facesCount = Number(resp?.facesCount || 0);
    const hasFace = Boolean(resp?.hasFace || facesCount > 0);
    const allZero = Array.isArray(embedding) && embedding.length > 0 && embedding.every((x) => Number(x) === 0);
    if (!hasFace || !Array.isArray(embedding) || embedding.length === 0 || allZero) {
      return res.status(422).json({
        error: 'no_face_detected',
        facesCount,
        hasFace,
        allZero,
        embeddingLength: Array.isArray(embedding) ? embedding.length : 0,
      });
    }
    // If sessionId provided, persist immediately; else return embedding so client can save later.
    if (sessionId) {
      const existing = await FaceRef.findOneAndUpdate(
        { sessionId },
        { embedding, meta },
        { upsert: true, new: true }
      );
      return res.json({ ok: true, refId: existing._id, meta });
    }
    return res.json({ ok: true, embedding, meta, facesCount });
  } catch (e) {
    const code = e?.code || '';
    const timeout = code === 'ECONNABORTED' || code === 'ETIMEDOUT';
    return res.status(503).json({ error: timeout ? 'vision_service_timeout' : 'vision_service_unavailable' });
  }
});

// Persist an already computed embedding to a session
r.post('/reference/save', async (req, res) => {
  const { sessionId, embedding, meta } = req.body || {};
  if (!sessionId || !Array.isArray(embedding)) return res.status(400).json({ error: 'sessionId and embedding required' });
  const existing = await FaceRef.findOneAndUpdate(
    { sessionId },
    { embedding, meta: meta || { method: 'arcface', model: 'r100' } },
    { upsert: true, new: true }
  );
  res.json({ ok: true, refId: existing._id });
});

// Verify live frame against stored reference embedding
r.post('/verify', async (req, res) => {
  const { sessionId, imageBase64 } = req.body || {};
  if (!sessionId || !imageBase64) return res.status(400).json({ error: 'sessionId and imageBase64 required' });
  const ref = await FaceRef.findOne({ sessionId }).lean();
  if (!ref) return res.status(404).json({ error: 'Reference not found for session' });
  try {
    const result = await verifyVision(imageBase64, ref.embedding);
    // result: { matchScore, multipleFaces, lookingAway, headPose, facesCount }
    res.json({ ok: true, ...result });
  } catch (e) {
    const code = e?.code || '';
    const timeout = code === 'ECONNABORTED' || code === 'ETIMEDOUT';
    return res.status(503).json({ error: timeout ? 'vision_service_timeout' : 'vision_service_unavailable' });
  }
});

export default r;
