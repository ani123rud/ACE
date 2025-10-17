import axios from 'axios';

export const api = axios.create({
  timeout: 30000,
});

export async function uploadRagPdfs(domain: string, files: File[]) {
  const fd = new FormData();
  fd.append('domain', domain);
  for (const f of files) fd.append('files', f);
  const { data } = await api.post('/api/rag/ingest', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data as { added: number };
}

export async function queryRag(domain: string, question: string) {
  const { data } = await api.post('/api/rag/query', { domain, question });
  return data as { answer: string; sources: { score?: number; text: string; metadata?: any }[] };
}

export async function getDomains() {
  const { data } = await api.get('/api/rag/domains');
  return data as string[];
}

export async function startFinalScoring(params: { sessionId: string; qa: Array<{ question: string; answer: string }>; proctor: any }) {
  const { data } = await api.post('/api/scoring/final/start', params, { timeout: 10000 });
  return data as { started: boolean };
}

export async function fetchFinalReport(sessionId: string) {
  const { data } = await api.get(`/api/scoring/report/${encodeURIComponent(sessionId)}?ts=${Date.now()}`, { timeout: 10000 });
  return data as { ready: boolean; report?: any };
}
