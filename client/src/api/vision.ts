import { api } from './client';

export async function saveReferenceFace(sessionId: string, imageBase64: string) {
  const { data } = await api.post('/api/vision/reference', { sessionId, imageBase64 }, { timeout: 4000 });
  return data as { ok: boolean; refId: string; meta: any };
}

export async function verifyFrame(sessionId: string, imageBase64: string) {
  const { data } = await api.post('/api/vision/verify', { sessionId, imageBase64 }, { timeout: 2500 });
  return data as {
    ok: boolean;
    matchScore: number; // 0..1
    multipleFaces: boolean;
    facesCount: number;
    lookingAway?: boolean;
    headPose?: { pitch: number; yaw: number; roll: number };
  };
}

// New: create reference without session, returns embedding so we can save later
export async function createReference(imageBase64: string) {
  const { data } = await api.post('/api/vision/reference', { imageBase64 }, { timeout: 4000 });
  return data as { ok: boolean; embedding: number[]; meta: any };
}

// New: persist a previously computed embedding to a session
export async function saveReferenceEmbedding(sessionId: string, embedding: number[], meta?: any) {
  const { data } = await api.post('/api/vision/reference/save', { sessionId, embedding, meta }, { timeout: 4000 });
  return data as { ok: boolean; refId: string };
}
