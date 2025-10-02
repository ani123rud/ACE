import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { WebcamProctor } from './WebcamProctor';

export default function CapturePage() {
  const navigate = useNavigate();
  const [refCaptured, setRefCaptured] = useState<boolean>(false);
  const [sessionId] = useState<string>('');

  useEffect(() => {
    if (refCaptured) {
      localStorage.setItem('ace.refCaptured', 'true');
      // small delay to show confirmation
      const t = setTimeout(() => navigate('/interview'), 800);
      return () => clearTimeout(t);
    }
  }, [refCaptured]);

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ maxWidth: 820, width: '100%', display: 'grid', gap: 16 }}>
        <h2 style={{ margin: 0, textAlign: 'center' }}>Capture Your Reference Face</h2>
        <div className="card" style={{ padding: 16, border: '1px solid #e5e5e5', borderRadius: 12 }}>
          <div style={{ marginBottom: 8 }}>Make sure your face is clearly visible with good lighting and a neutral background.</div>
          <WebcamProctor
            sessionId={sessionId}
            onAlert={(m: string) => console.log('[alert]', m)}
            onMetrics={(m: any) => console.log('[metrics]', m)}
            onReferenceCaptured={() => setRefCaptured(true)}
            captureIntervalMs={2000}
          />
          {!refCaptured && <div className="muted" style={{ marginTop: 8 }}>Capturing...
            Keep your face centered and look at the camera.</div>}
          {refCaptured && <div style={{ color: 'green', marginTop: 8 }}>Reference captured. Redirecting to the interview...</div>}
        </div>
        <div className="muted" style={{ textAlign: 'center' }}>Step 2 of 3: Capture reference</div>
      </div>
    </div>
  );
}
