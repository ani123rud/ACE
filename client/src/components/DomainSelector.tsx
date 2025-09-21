import React, { useEffect, useState } from 'react';
import { getDomains } from '../api/client';

interface Props {
  value: string | null;
  onChange: (domain: string) => void;
}

export default function DomainSelector({ value, onChange }: Props) {
  const [domains, setDomains] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    getDomains()
      .then((d) => {
        if (!mounted) return;
        setDomains(d || []);
        setError(null);
      })
      .catch((e) => {
        if (!mounted) return;
        setError('Failed to load domains');
      })
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) return <div className="muted">Loading domains…</div>;
  if (error) return <div className="error">{error}</div>;

  if (!domains.length) {
    return (
      <div className="muted">
        No domains available yet. Ask an admin to upload PDFs via Admin Ingest, then refresh this page.
      </div>
    );
  }

  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
      <option value="" disabled>Select a domain…</option>
      {domains.map((d) => (
        <option key={d} value={d}>{d}</option>
      ))}
    </select>
  );
}
