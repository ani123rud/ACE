import { Router } from 'express';
import ProctorLog from '../models/ProctorLog.js';
import { computeIntegrityScore } from '../utils/scoring.js';
import { xaddAlert } from '../utils/streams.js';
import Alert from '../models/Alert.js';
import { redis } from '../config/redis.js';

const r = Router();

r.post('/', async (req, res) => {
  const { sessionId, type, data, severity } = req.body || {};
  const log = await ProctorLog.create({ sessionId, type, data, severity });
  const logs = await ProctorLog.find({ sessionId }).lean();
  const integrity = computeIntegrityScore(logs);
  // Calibrated gating & dedup (configurable via env)
  const conf = Number((data && data.confidence) != null ? data.confidence : (type === 'tab_switch' ? 1 : 0));
  const ENV_MIN_MULTI = Number(process.env.PROCTOR_MINCONF_MULTISPEAKER || 0.85);
  const ENV_MIN_FACE  = Number(process.env.PROCTOR_MINCONF_FACECOUNT || 0.80);
  const ENV_MIN_NOISE = Number(process.env.PROCTOR_MINCONF_NOISE || 0.60);
  const DEDUP_SEC = Number(process.env.PROCTOR_DEDUP_SEC || 60);
  const STORE_BELOW = String(process.env.PROCTOR_STORE_BELOW_MINCONF || 'false').toLowerCase() === 'true';
  const minConf = (type === 'multi_speaker') ? ENV_MIN_MULTI
                 : (type === 'face_count') ? ENV_MIN_FACE
                 : (type === 'noise') ? ENV_MIN_NOISE
                 : 1.0; // tab_switch and others need explicit triggers

  // Dedup alerts of same type per session for DEDUP_SEC
  const dedupeKey = `proctor:dedupe:${sessionId}:${type}`;
  let withinWindow = false;
  try { if (redis.isOpen) withinWindow = Boolean(await redis.get(dedupeKey)); } catch {}

  const shouldCreate = conf >= minConf && !withinWindow;

  if (shouldCreate) {
    const sev = severity || (conf >= 0.9 ? 'high' : conf >= 0.8 ? 'medium' : 'low');
    const message = data?.message || String(type || 'proctor_event');
    // Emit to Redis Streams (async consumers)
    try { await xaddAlert({ sessionId, type, message, severity: sev, data: { ...data, confidence: conf } }); } catch {}
    // Persist directly for metrics
    try {
      await Alert.create({ sessionId, type, message, severity: sev, at: Date.now(), raw: { ...data, confidence: conf } });
    } catch {}
    // Set dedupe window
    try { if (redis.isOpen && DEDUP_SEC > 0) await redis.set(dedupeKey, '1', { EX: DEDUP_SEC }); } catch {}
  } else if (STORE_BELOW) {
    // Persist below-threshold as low severity with rejected flag for auditability
    try {
      await Alert.create({ sessionId, type, message: data?.message || String(type || 'proctor_event'), severity: 'low', at: Date.now(), raw: { ...data, confidence: conf, rejected: true } });
    } catch {}
  }
  res.json({ ok: true, logId: log._id, integrity });
});

export default r;
