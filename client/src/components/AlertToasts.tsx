import React, { useEffect } from 'react';

export type Toast = { id: string; message: string; severity?: 'low'|'medium'|'high'; ts: number };

export default function AlertToasts({ items, onRemove }: { items: Toast[]; onRemove: (id: string) => void }) {
  useEffect(() => {
    const timers = items.map(t => setTimeout(() => onRemove(t.id), 4000));
    return () => { timers.forEach(clearTimeout); };
  }, [items]);
  const badge = (sev?: string) => {
    const color = sev === 'high' ? '#b00020' : sev === 'medium' ? '#b36b00' : '#2f6d2f';
    return <span style={{ background: color, color: '#fff', padding: '2px 6px', borderRadius: 6, fontSize: 11, marginRight: 6 }}>{sev || 'low'}</span>;
  };
  return (
    <div style={{ position: 'fixed', right: 16, top: 16, display: 'grid', gap: 8, zIndex: 9999 }}>
      {items.map(t => (
        <div key={t.id} style={{ background: '#111', color: '#fff', padding: '8px 12px', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.25)', maxWidth: 360, display: 'flex', alignItems: 'center' }}>
          {badge(t.severity)}
          <div style={{ lineHeight: 1.2 }}>{t.message}</div>
        </div>
      ))}
    </div>
  );
}
