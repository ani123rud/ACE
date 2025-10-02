import { Router } from 'express';
import ProctorLog from '../models/ProctorLog.js';
import { computeIntegrityScore } from '../utils/scoring.js';
import { xaddAlert } from '../utils/streams.js';

const r = Router();

r.post('/', async (req, res) => {
  const { sessionId, type, data, severity } = req.body || {};
  const log = await ProctorLog.create({ sessionId, type, data, severity });
  const logs = await ProctorLog.find({ sessionId }).lean();
  const integrity = computeIntegrityScore(logs);
  // Emit alert to Redis Streams for async processing/persisting
  try {
    await xaddAlert({ sessionId, type, message: data?.message || String(type || 'proctor_event'), severity: severity || 'low', data });
  } catch {}
  res.json({ ok: true, logId: log._id, integrity });
});

export default r;
