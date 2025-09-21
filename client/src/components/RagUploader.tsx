import React, { useState } from 'react';
import { uploadRagPdfs, queryRag } from '../api/client';

export default function RagUploader() {
  const [domain, setDomain] = useState('demo');
  const [files, setFiles] = useState<File[]>([]);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string>('');
  const [sources, setSources] = useState<{ score?: number; text: string; metadata?: any }[]>([]);
  const [busy, setBusy] = useState(false);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files ? Array.from(e.target.files) : [];
    setFiles(list);
  };

  const doUpload = async () => {
    if (!domain.trim() || files.length === 0) {
      setUploadStatus('Please pick a domain and select one or more PDF files.');
      return;
    }
    setBusy(true);
    setUploadStatus('Uploading and indexing...');
    try {
      const res = await uploadRagPdfs(domain.trim(), files);
      setUploadStatus(`Indexed ${res.added} document(s).`);
    } catch (e: any) {
      setUploadStatus(`Failed: ${e?.message || 'unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  const doQuery = async () => {
    if (!domain.trim() || !question.trim()) return;
    setBusy(true);
    setAnswer('');
    setSources([]);
    try {
      const res = await queryRag(domain.trim(), question.trim());
      setAnswer(res.answer || '');
      setSources(res.sources || []);
    } catch (e: any) {
      setAnswer(`Query failed: ${e?.message || 'unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 800, margin: '1rem auto', padding: '1rem', border: '1px solid #ddd', borderRadius: 8 }}>
      <h2>RAG PDF Ingestion & Query (Test Panel)</h2>
      <div style={{ display: 'grid', gap: 12 }}>
        <label>
          Domain
          <input
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="your-domain"
            style={{ width: '100%', padding: 8, marginTop: 4 }}
          />
        </label>

        <label>
          Select PDF files
          <input type="file" accept="application/pdf" multiple onChange={onPick} style={{ display: 'block', marginTop: 4 }} />
        </label>
        <button onClick={doUpload} disabled={busy}>
          {busy ? 'Working...' : 'Upload & Ingest PDFs'}
        </button>
        {uploadStatus && <div role="status">{uploadStatus}</div>}

        <hr />

        <label>
          Ask a question
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={3}
            placeholder="Type your question about the ingested PDFs"
            style={{ width: '100%', padding: 8, marginTop: 4 }}
          />
        </label>
        <button onClick={doQuery} disabled={busy}>
          {busy ? 'Working...' : 'Query'}
        </button>

        {answer && (
          <div>
            <h3>Answer</h3>
            <div style={{ whiteSpace: 'pre-wrap' }}>{answer}</div>
          </div>
        )}

        {sources?.length > 0 && (
          <div>
            <h3>Sources</h3>
            <ul>
              {sources.map((s, i) => (
                <li key={i} style={{ marginBottom: 8 }}>
                  <div><b>Score:</b> {typeof s.score === 'number' ? s.score.toFixed(3) : 'n/a'}</div>
                  <div style={{ fontSize: 12, color: '#555' }}>{s.text.slice(0, 400)}</div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
