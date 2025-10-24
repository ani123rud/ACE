// compute_redis_hit_ratio.js
// Usage: node compute_redis_hit_ratio.js
// Reads rag:stats:hits and rag:stats:misses from Redis and prints hit ratio.
// Requires: npm install redis dotenv

const { createClient } = require('redis');
require('dotenv').config();

const {
  REDIS_URL,
  REDIS_HOST = '127.0.0.1',
  REDIS_PORT = '6379',
  REDIS_PASSWORD,
} = process.env;

const url = REDIS_URL || `redis://${REDIS_PASSWORD ? `:${encodeURIComponent(REDIS_PASSWORD)}@` : ''}${REDIS_HOST}:${REDIS_PORT}`;

(async () => {
  const client = createClient({ url });
  try {
    await client.connect();
    const hits = Number(await client.get('rag:stats:hits')) || 0;
    const misses = Number(await client.get('rag:stats:misses')) || 0;
    const total = hits + misses;
    const ratio = total ? (100 * hits / total) : 0;
    console.log(JSON.stringify({ hits, misses, hit_ratio_pct: Number(ratio.toFixed(2)) }, null, 2));
  } catch (e) {
    console.error('[redis-ratio] failed:', e);
    process.exit(1);
  } finally {
    try { await client.quit(); } catch {}
  }
})();
