import React from 'react';

interface Props {
  show: boolean;
  text?: string;
}

export default function LoadingOverlay({ show, text }: Props) {
  if (!show) return null;
  return (
    <div style={overlayStyle} role="status" aria-live="polite">
      <div style={boxStyle}>
        <div style={spinnerStyle} aria-hidden="true" />
        <div style={{ marginTop: 12, fontWeight: 600 }}>{text || 'Processing…'}</div>
        <div style={{ marginTop: 4, fontSize: 12, color: '#9aa4b2' }}>You can keep this tab open; this may take a moment.</div>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(10,12,14,0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 9999,
  backdropFilter: 'blur(2px)'
};

const boxStyle: React.CSSProperties = {
  background: '#14181c',
  color: '#e6e9ef',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 12,
  padding: '20px 24px',
  minWidth: 260,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center'
};

const spinnerStyle: React.CSSProperties = {
  width: 36,
  height: 36,
  border: '4px solid #2a3036',
  borderTopColor: '#60a5fa',
  borderRadius: '50%',
  animation: 'spin 1s linear infinite'
};

// Inject keyframes once
if (typeof document !== 'undefined' && !document.getElementById('loading-overlay-spin')) {
  const style = document.createElement('style');
  style.id = 'loading-overlay-spin';
  style.innerHTML = `@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`;
  document.head.appendChild(style);
}
