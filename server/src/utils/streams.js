import { redis } from '../config/redis.js';

const ALERTS_STREAM = process.env.ALERTS_STREAM || 'streams:alerts';
const TASKS_STREAM = process.env.TASKS_STREAM || 'streams:tasks';

/**
 * Append an alert to Redis Streams (non-blocking).
 * @param {{ sessionId: string, type: string, message: string, severity?: 'low'|'medium'|'high', data?: any, at?: number, evidenceKey?: string }} evt
 */
export async function xaddAlert(evt) {
  try {
    if (!redis.isOpen) return;
    const at = evt.at || Date.now();
    const fields = {
      sessionId: String(evt.sessionId || ''),
      type: String(evt.type || ''),
      message: String(evt.message || ''),
      severity: String(evt.severity || 'low'),
      at: String(at),
      data: JSON.stringify(evt.data || {}),
      evidenceKey: String(evt.evidenceKey || ''),
    };
    await redis.xAdd(ALERTS_STREAM, '*', fields);
  } catch (_) {}
}

/**
 * Append a task to Redis Streams (non-blocking).
 * @param {{ type: string, payload: any }} task
 */
export async function xaddTask(task) {
  try {
    if (!redis.isOpen) return;
    const fields = {
      type: String(task?.type || ''),
      payload: JSON.stringify(task?.payload || {}),
      at: String(Date.now()),
    };
    await redis.xAdd(TASKS_STREAM, '*', fields);
  } catch (_) {}
}

/**
 * Create a consumer group if it doesn't exist.
 */
export async function ensureGroups(group = process.env.STREAMS_GROUP || 'ace_group') {
  try {
    if (!redis.isOpen) return;
    const create = async (stream) => {
      try {
        await redis.xGroupCreate(stream, group, '0', { MKSTREAM: true });
      } catch (e) {
        // BUSYGROUP means it already exists
        if (!String(e?.message || '').includes('BUSYGROUP')) throw e;
      }
    };
    await create(ALERTS_STREAM);
    await create(TASKS_STREAM);
  } catch (_) {}
}

export const Streams = {
  ALERTS_STREAM,
  TASKS_STREAM,
};
