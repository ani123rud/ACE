import React, { useState } from 'react';
import axios from 'axios';

export default function AdminIngest() {
  const [domain, setDomain] = useState('demo');
  const [files, setFiles] = useState<File[]>([]);
  const [token, setToken] = useState('');
  const [status, setStatus] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files ? Array.from(e.target.files) : [];
    setFiles(list);
  };

  const doUpload = async () => {
    if (!token.trim()) {
      setStatus('Enter admin token.');
      return;
    }
    if (!domain.trim() || files.length === 0) {
      setStatus('Pick a domain and one or more PDFs.');
      return;
    }
    setBusy(true);
    setStatus('Uploading and indexing...');
    try {
      const fd = new FormData();
      fd.append('domain', domain.trim());
      for (const f of files) fd.append('files', f);
      const { data } = await axios.post('/api/admin/rag/ingest', fd, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'x-admin-token': token.trim(),
        }
      });
      setStatus(`Indexed ${data?.added ?? 0} document(s).`);
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.message || 'upload failed';
      setStatus(`Failed: ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 800, margin: '1rem auto', padding: '1rem', border: '1px solid #ddd', borderRadius: 8 }}>
      <h2>Admin: Upload PDFs for a Domain</h2>
      <div style={{ display: 'grid', gap: 12 }}>
        <label>
          Admin Token
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Enter admin token"
            style={{ width: '100%', padding: 8, marginTop: 4 }}
          />
        </label>
        <label>
          Domain
          <input
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="e.g., javascript"
            style={{ width: '100%', padding: 8, marginTop: 4 }}
          />
        </label>
        <label>
          Select PDF files
          <input type="file" accept="application/pdf" multiple onChange={onPick} style={{ display: 'block', marginTop: 4 }} />
        </label>
        <button onClick={doUpload} disabled={busy}>{busy ? 'Working…' : 'Upload & Ingest PDFs'}</button>
        {status && <div role="status">{status}</div>}
      </div>
    </div>
  );
}
