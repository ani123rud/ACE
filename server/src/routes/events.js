import { Router } from 'express';
import InterviewEvent from '../models/InterviewEvent.js';

const r = Router();

r.post('/', async (req, res) => {
  try {
    const { sessionId, type, payload, severity, at } = req.body || {};
    if (!sessionId || !type) return res.status(400).json({ error: 'sessionId and type are required' });
    const doc = await InterviewEvent.create({ sessionId, type, payload, severity, at });
    res.json({ ok: true, id: doc._id });
  } catch (e) {
    res.status(500).json({ error: 'failed_to_log_event' });
  }
});

export default r;
