import { Router } from 'express';
import Alert from '../models/Alert.js';

const r = Router();

// Read latest alerts for a session (persisted in Mongo)
r.get('/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 100));
  const list = await Alert.find({ sessionId }).sort({ at: -1 }).limit(limit).lean();
  res.set('Cache-Control', 'no-store');
  res.json({ items: list });
});

export default r;
