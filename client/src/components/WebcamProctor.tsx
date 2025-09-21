import React, { useEffect, useRef, useState } from 'react';
import { saveReferenceFace, verifyFrame, createReference, saveReferenceEmbedding } from '../api/vision';

interface WebcamProctorProps {
  sessionId: string;
  captureIntervalMs?: number;
  onAlert?: (msg: string, severity?: 'low' | 'medium' | 'high') => void;
  onMetrics?: (m: any) => void;
  onReferenceCaptured?: () => void;
  autoStart?: boolean;
}

export function WebcamProctor({ sessionId, captureIntervalMs = 4000, onAlert, onMetrics, onReferenceCaptured, autoStart = false }: WebcamProctorProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [started, setStarted] = useState(false);
  // referenced: a reference embedding has been captured (either locally or saved)
  const [referenced, setReferenced] = useState(false);
  // refSaved: the reference has been persisted to the server for this session
  const [refSaved, setRefSaved] = useState(false);
  // local embedding captured before session exists
  const localEmbeddingRef = useRef<number[] | null>(null);
  const timerRef = useRef<number | null>(null);
  const busyRef = useRef(false);

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
      if (!videoRef.current) return;
      videoRef.current.srcObject = stream as any;
      try {
        await videoRef.current.play();
      } catch (_) {
        // Autoplay might be blocked; wait for user gesture
      }
      // Ensure metadata loaded
      if (!videoRef.current.videoWidth || !videoRef.current.videoHeight) {
        await new Promise<void>((resolve) => {
          const handler = () => resolve();
          videoRef.current?.addEventListener('loadeddata', handler, { once: true });
          setTimeout(() => resolve(), 800);
        });
      }
      setStarted(true);
      // Auto-capture reference once camera is ready
      setTimeout(() => { captureReference().catch(() => {}); }, 300);
      // Start verification loop only if we have a session and server-side reference saved
      if (sessionId && refSaved) {
        if (timerRef.current) window.clearInterval(timerRef.current);
        timerRef.current = window.setInterval(tick, Math.max(1200, captureIntervalMs)) as unknown as number;
      }
    } catch (e) {
      onAlert?.('Unable to start camera', 'medium');
    }
  }

  function stop() {
    if (videoRef.current) {
      const s = videoRef.current.srcObject as MediaStream | null;
      s?.getTracks().forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
    if (timerRef.current) window.clearInterval(timerRef.current);
    setStarted(false);
  }

  function getBase64(): string | null {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c) return null;
    // Downscale for faster upload + inference
    const targetW = 320;
    const targetH = 240;
    c.width = targetW;
    c.height = targetH;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(v, 0, 0, c.width, c.height);
    const dataUrl = c.toDataURL('image/jpeg', 0.7);
    return dataUrl.replace(/^data:image\/(png|jpeg);base64,/, '');
  }

  async function captureReference() {
    try {
      const b64 = getBase64();
      if (!b64) return;
      if (sessionId) {
        // Session exists: compute and persist immediately
        await saveReferenceFace(sessionId, b64);
        setReferenced(true);
        setRefSaved(true);
        onReferenceCaptured?.();
        onAlert?.('Reference face captured', 'low');
        // Start loop if not started
        if (started) {
          if (timerRef.current) window.clearInterval(timerRef.current);
          timerRef.current = window.setInterval(tick, Math.max(1200, captureIntervalMs)) as unknown as number;
        }
      } else {
        // No session yet: compute embedding only and keep locally
        const res = await createReference(b64);
        localEmbeddingRef.current = res.embedding;
        setReferenced(true);
        onReferenceCaptured?.();
        onAlert?.('Reference prepared (pre-session)', 'low');
      }
    } catch (e) {
      onAlert?.('Failed to capture reference face', 'medium');
    }
  }

  async function tick() {
    // Only verify if we have a session and server-side reference saved
    if (!sessionId || !refSaved) return;
    if (busyRef.current) return; // prevent overlap
    const b64 = getBase64();
    if (!b64) return;
    busyRef.current = true;
    try {
      // Add client-side timeout
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 2500);
      const res = await verifyFrame(sessionId, b64);
      window.clearTimeout(timeout);
      onMetrics?.(res);
      if (res.facesCount > 1 || res.multipleFaces) onAlert?.('Multiple faces detected', 'high');
      if (res.matchScore < 0.5) onAlert?.('Face mismatch risk', 'medium');
      if (res.lookingAway) onAlert?.('Looking away frequently', 'low');
    } catch (_) {
      // Silent error to avoid console spam, but inform once in a while
      onAlert?.('Vision verification failed', 'low');
    } finally {
      busyRef.current = false;
    }
  }

  useEffect(() => {
    if (autoStart && !started) {
      // start camera automatically if requested
      start().catch(() => onAlert?.('Unable to start camera', 'medium'));
    }
    if (started) {
      // timer is managed when prerequisites are satisfied
      return () => {
        if (timerRef.current) window.clearInterval(timerRef.current);
      };
    }
  }, [started, autoStart]);

  // When sessionId becomes available and we have a local embedding, persist it then enable verification
  useEffect(() => {
    (async () => {
      if (sessionId && referenced && !refSaved && localEmbeddingRef.current) {
        try {
          await saveReferenceEmbedding(sessionId, localEmbeddingRef.current);
          setRefSaved(true);
          onAlert?.('Reference saved for session', 'low');
          // Start loop if camera already started
          if (started) {
            if (timerRef.current) window.clearInterval(timerRef.current);
            timerRef.current = window.setInterval(tick, Math.max(1200, captureIntervalMs)) as unknown as number;
          }
        } catch (_) {
          onAlert?.('Failed to save session reference', 'medium');
        }
      }
    })();
  }, [sessionId, referenced, refSaved, started, captureIntervalMs]);

  return (
    <div className="webcam-proctor">
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button onClick={() => (started ? stop() : start())}>{started ? 'Stop Camera' : 'Start Camera'}</button>
        <button onClick={() => captureReference().catch(() => {})} disabled={!started || referenced}>Capture Reference</button>
      </div>
      <video ref={videoRef} width={320} height={240} style={{ marginTop: 8, background: '#000' }} />
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
}
