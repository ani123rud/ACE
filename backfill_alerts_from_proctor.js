// backfill_alerts_from_proctor.js
// Usage:
//   node backfill_alerts_from_proctor.js            # insert calibrated alerts if missing
//   node backfill_alerts_from_proctor.js --rebuild  # drop alerts and rebuild calibrated from logs
// Reads ProctorLog and inserts corresponding Alert documents if missing.
// Applies the SAME calibration as server /api/proctor:
//  - per-type min confidence
//  - 60s dedup per session/type (based on createdAt ordering)
//  - severity mapping from confidence
// Requires: npm install mongodb

const { MongoClient, ObjectId } = require('mongodb');

const ATLAS_URI = "mongodb+srv://anirudhkulkarni2382004:RK3vV18CD82zDLsK@cluster0.i3arv.mongodb.net/ai_interviewer?retryWrites=true&w=majority&appName=Cluster0";
const DB_NAME = "ai_interviewer";

(async () => {
  console.log('[backfill] starting');
  const rebuild = process.argv.includes('--rebuild');
  const client = new MongoClient(ATLAS_URI);
  let inserted = 0, skipped = 0, scanned = 0;
  try {
    await client.connect();
    console.log('[backfill] connected to Mongo');
    const db = client.db(DB_NAME);
    const logs = db.collection('proctorlogs');
    const alerts = db.collection('alerts');

    if (rebuild) {
      console.log('[backfill] --rebuild enabled: dropping alerts collection');
      try { await alerts.deleteMany({}); } catch (e) { console.warn('[backfill] drop failed:', e?.message || e); }
    }

    const cur = logs.find({}, { projection: { sessionId: 1, type: 1, data: 1, severity: 1, createdAt: 1 } }).sort({ sessionId: 1, createdAt: 1 });
    // Track last alert time per session/type for 60s dedup
    const lastAtBySessionType = new Map(); // key: `${sid}:${type}` -> ms
    let skipped_low_conf = 0, skipped_dedup = 0, skipped_bad_session = 0;
    // Env-calibrated thresholds (same as server route)
    const ENV_MIN_MULTI = Number(process.env.PROCTOR_MINCONF_MULTISPEAKER || 0.85);
    const ENV_MIN_FACE  = Number(process.env.PROCTOR_MINCONF_FACECOUNT || 0.80);
    const ENV_MIN_NOISE = Number(process.env.PROCTOR_MINCONF_NOISE || 0.60);
    const DEDUP_SEC = Number(process.env.PROCTOR_DEDUP_SEC || 60);
    const STORE_BELOW = String(process.env.PROCTOR_STORE_BELOW_MINCONF || 'false').toLowerCase() === 'true';
    while (await cur.hasNext()) {
      const l = await cur.next();
      scanned++;
      if (!l) { skipped++; continue; }
      let sessionId = null;
      try {
        if (l.sessionId instanceof ObjectId) sessionId = l.sessionId;
        else if (typeof l.sessionId === 'string' && /^[a-fA-F0-9]{24}$/.test(l.sessionId)) sessionId = new ObjectId(l.sessionId);
      } catch {}
      if (!sessionId) { skipped++; skipped_bad_session++; continue; }
      const type = l.type || 'proctor_event';
      const message = (l?.data?.message) || String(type);
      // Calibration: derive confidence and thresholds
      const conf = Number((l?.data && l.data.confidence) != null ? l.data.confidence : (type === 'tab_switch' ? 1 : 0));
      const minConf = (type === 'multi_speaker') ? ENV_MIN_MULTI
                   : (type === 'face_count') ? ENV_MIN_FACE
                   : (type === 'noise') ? ENV_MIN_NOISE
                   : 1.0;
      if (!(conf >= minConf)) {
        if (STORE_BELOW) {
          const at = (l.createdAt ? new Date(l.createdAt).getTime() : Date.now());
          await alerts.insertOne({ sessionId, type, message, severity: 'low', at, raw: { ...(l.data || {}), confidence: conf, rejected: true }, createdAt: new Date(at), updatedAt: new Date(at) });
        } else {
          skipped++; skipped_low_conf++; continue;
        }
      }
      const at = (l.createdAt ? new Date(l.createdAt).getTime() : Date.now());
      // Dedup 60s per session/type
      const sidStr = String(sessionId);
      const key = `${sidStr}:${type}`;
      const lastAt = lastAtBySessionType.get(key) || 0;
      if (at - lastAt < (DEDUP_SEC * 1000)) { skipped++; skipped_dedup++; continue; }
      lastAtBySessionType.set(key, at);
      // Severity mapping from confidence if not explicitly set
      const severity = (l.severity && ['low','medium','high'].includes(String(l.severity)))
        ? l.severity
        : (conf >= 0.9 ? 'high' : conf >= 0.8 ? 'medium' : 'low');

      const existing = await alerts.findOne({ sessionId, type, at });
      if (existing) { skipped++; continue; }

      await alerts.insertOne({ sessionId, type, message, severity, at, raw: { ...(l.data || {}), confidence: conf }, createdAt: new Date(at), updatedAt: new Date(at) });
      inserted++;
      if (inserted % 100 === 0) console.log(`[backfill] inserted so far: ${inserted}`);
    }

    console.log(JSON.stringify({ scanned, inserted, skipped, skipped_low_conf, skipped_dedup, skipped_bad_session, rebuild }, null, 2));
    process.exit(0);
  } catch (e) {
    console.error('[backfill] failed:', e);
    process.exit(1);
  } finally {
    try { await client.close(); } catch {}
  }
})();

process.on('unhandledRejection', (reason) => {
  console.error('[backfill] unhandledRejection:', reason);
  process.exit(1);
});
process.on('uncaughtException', (err) => {
  console.error('[backfill] uncaughtException:', err);
  process.exit(1);
});
