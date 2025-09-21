import React from 'react';

interface AlertItem { ts: number; type: string; message: string }

export function ProctorPanel({ alerts, integrity }: { alerts: AlertItem[]; integrity: number }) {
  const [open, setOpen] = React.useState(false);
  const latest = alerts.slice(0, 5);
  return (
    <div className="proctor-panel">
      <div className="integrity" style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
        <div>
          Integrity: <strong>{integrity}</strong>
        </div>
        <button onClick={() => setOpen(o => !o)} className="mic" style={{padding:'6px 10px'}}> {open ? 'Hide' : 'Show'} </button>
      </div>
      {!open && (
        <div className="muted" style={{fontSize:12}}>Proctoring minimized. Click Show to expand.</div>
      )}
      {open && (
        <div className="alerts">
          <h3>Proctor Alerts</h3>
          {latest.length === 0 && <div className="muted">No alerts yet</div>}
          {latest.map((a, i) => (
            <div key={i} className="alert-item">
              <span className="time">{new Date(a.ts).toLocaleTimeString()}</span>
              <span className={`type ${a.type}`}>{a.type}</span>
              <span className="msg">{a.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
