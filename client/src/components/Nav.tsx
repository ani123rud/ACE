import React from 'react';
import { Link, useLocation } from 'react-router-dom';

export default function Nav() {
  const { pathname } = useLocation();
  const linkStyle = (to: string) => ({
    padding: '8px 12px',
    borderRadius: 6,
    textDecoration: 'none',
    color: pathname === to ? '#fff' : '#333',
    background: pathname === to ? '#1f6feb' : '#e6e8eb',
  } as React.CSSProperties);
  return (
    <nav style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 12, borderBottom: '1px solid #e5e7eb' }}>
      <div style={{ fontWeight: 700 }}>AI Interview</div>
      <div style={{ flex: 1 }} />
      <Link to="/ingest" style={linkStyle('/ingest')}>Upload PDFs</Link>
      <Link to="/interview" style={linkStyle('/interview')}>Start Interview</Link>
    </nav>
  );
}
