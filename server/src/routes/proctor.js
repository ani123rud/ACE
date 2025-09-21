import { Router } from 'express';
import ProctorLog from '../models/ProctorLog.js';
import { computeIntegrityScore } from '../utils/scoring.js';

const r = Router();

r.post('/', async (req, res) => {
  const { sessionId, type, data, severity } = req.body || {};
  const log = await ProctorLog.create({ sessionId, type, data, severity });
  const logs = await ProctorLog.find({ sessionId }).lean();
  const integrity = computeIntegrityScore(logs);
  res.json({ ok: true, logId: log._id, integrity });
});

export default r;
