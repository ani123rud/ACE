import { createClient } from 'redis';
import dotenv from 'dotenv';
dotenv.config();

const {
  REDIS_URL,
  REDIS_HOST = '127.0.0.1',
  REDIS_PORT = '6379',
  REDIS_PASSWORD,
} = process.env;

const url = REDIS_URL || `redis://${REDIS_PASSWORD ? `:${encodeURIComponent(REDIS_PASSWORD)}@` : ''}${REDIS_HOST}:${REDIS_PORT}`;

export const redis = createClient({ url });

redis.on('error', (err) => console.error('[redis] client error', err));

let ready = false;
export async function initRedis() {
  if (ready) return redis;
  await redis.connect();
  ready = true;
  return redis;
}

export default redis;
