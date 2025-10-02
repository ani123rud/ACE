import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DomainSelector from './DomainSelector';

export default function StartPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('candidate@example.com');
  const [domain, setDomain] = useState<string | null>(null);

  useEffect(() => {
    const savedEmail = localStorage.getItem('ace.email');
    const savedDomain = localStorage.getItem('ace.domain');
    if (savedEmail) setEmail(savedEmail);
    if (savedDomain) setDomain(savedDomain);
  }, []);

  const canContinue = Boolean(email && domain);

  const onContinue = () => {
    if (!canContinue) return;
    localStorage.setItem('ace.email', email);
    localStorage.setItem('ace.domain', domain || '');
    localStorage.removeItem('ace.refCaptured');
    navigate('/capture');
  };

  return (
    <div className="container" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ maxWidth: 520, width: '100%', display: 'grid', gap: 16 }}>
        <h1 style={{ margin: 0, textAlign: 'center' }}>AI Voice Interview</h1>
        <div className="card" style={{ padding: 16, border: '1px solid #e5e5e5', borderRadius: 12 }}>
          <div style={{ display: 'grid', gap: 12 }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontWeight: 600 }}>Email</span>
              <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontWeight: 600 }}>Domain</span>
              <DomainSelector value={domain} onChange={setDomain} />
            </label>
            <button disabled={!canContinue} onClick={onContinue}>Continue</button>
          </div>
        </div>
        <div className="muted" style={{ textAlign: 'center' }}>Step 1 of 3: Select domain</div>
      </div>
    </div>
  );
}
