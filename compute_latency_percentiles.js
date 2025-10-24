// compute_latency_percentiles.js
// Usage: node compute_latency_percentiles.js
// Computes P50/P95 latency for /api/interview/answer by mode from Mongo collection 'latency'
// Requires: npm install mongodb

const { MongoClient } = require('mongodb');

const ATLAS_URI = "mongodb+srv://anirudhkulkarni2382004:RK3vV18CD82zDLsK@cluster0.i3arv.mongodb.net/ai_interviewer?retryWrites=true&w=majority&appName=Cluster0";
const DB_NAME = "ai_interviewer";

function percentile(arr, p) {
  if (!arr.length) return 0;
  const a = [...arr].sort((x, y) => x - y);
  const idx = Math.ceil((p / 100) * a.length) - 1;
  return a[Math.max(0, Math.min(a.length - 1, idx))];
}

(async () => {
  const client = new MongoClient(ATLAS_URI);
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const col = db.collection('latency');
    const docs = await col.find({ route: '/api/interview/answer' }).project({ mode: 1, ms: 1 }).toArray();
    const byMode = new Map();
    for (const d of docs) {
      const key = d.mode || 'Unknown';
      if (!byMode.has(key)) byMode.set(key, []);
      byMode.get(key).push(Number(d.ms) || 0);
    }
    const out = {};
    for (const [mode, arr] of byMode.entries()) {
      out[mode] = {
        count: arr.length,
        p50: Number(percentile(arr, 50).toFixed(2)),
        p95: Number(percentile(arr, 95).toFixed(2)),
      };
    }
    console.log(JSON.stringify(out, null, 2));
  } catch (e) {
    console.error('[latency] failed:', e);
    process.exit(1);
  } finally {
    await client.close();
  }
})();
