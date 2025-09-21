import { useCallback, useEffect, useRef, useState } from 'react';
import * as faceapi from 'face-api.js';
import { api } from '../api/client';

interface AlertItem {
  ts: number;
  type: 'tab_switch' | 'face_count' | 'noise' | 'multi_speaker';
  message: string;
}

export function useProctoring(sessionId: string | null) {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [integrityScore, setIntegrity] = useState<number>(100);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastAlertRef = useRef<Record<AlertItem['type'], number>>({
    tab_switch: 0,
    face_count: 0,
    noise: 0,
    multi_speaker: 0,
  });
  const lastFaceCountRef = useRef<number | null>(null);
  const noFaceStreakRef = useRef<number>(0);

  const pushAlert = useCallback((a: AlertItem) => setAlerts((prev) => [a, ...prev].slice(0, 20)), []);

  const log = useCallback(async (type: AlertItem['type'], data: any, message: string) => {
    // cooldowns per type (ms)
    const cooldowns: Record<AlertItem['type'], number> = {
      tab_switch: 10000,
      face_count: 5000,
      noise: 10000,
      multi_speaker: 8000,
    };
    const now = Date.now();
    const last = lastAlertRef.current[type] || 0;
    if (now - last < cooldowns[type]) return; // skip repeated spam
    lastAlertRef.current[type] = now;
    pushAlert({ ts: now, type, message });
    if (!sessionId) return;
    try {
      const { data: resp } = await api.post('/api/proctor', { sessionId, type, data });
      if (typeof resp.integrity === 'number') setIntegrity(resp.integrity);
    } catch {}
  }, [sessionId, pushAlert]);

  const onVisibility = useCallback(() => {
    if (document.hidden) {
      log('tab_switch', { hidden: true }, 'Tab switch detected');
    }
  }, [log]);

  const setupMicMonitor = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    src.connect(analyser);
    audioCtxRef.current = ctx;
    analyserRef.current = analyser;

    const buf = new Float32Array(analyser.fftSize);
    const loop = () => {
      analyser.getFloatTimeDomainData(buf);
      let rms = 0;
      for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
      rms = Math.sqrt(rms / buf.length);
      // less sensitive noise spike threshold
      if (rms > 0.12) {
        log('noise', { rms }, 'Noise spike detected');
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [log]);

  const setupFaceMonitor = useCallback(async () => {
    try {
      // Try multiple model base URLs; if all fail, skip face detection gracefully
      const bases = [
        // Community mirror with models
        'https://cdn.jsdelivr.net/gh/vladmandic/face-api/model',
        // Alternate older mirror
        'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js-models/weights',
        // Local public path if user places weights under /models
        '/models'
      ];

      let loaded = false;
      for (const b of bases) {
        try {
          await faceapi.nets.tinyFaceDetector.loadFromUri(b);
          loaded = true;
          break;
        } catch (_) {
          // try next base
        }
      }
      if (!loaded) {
        console.warn('[proctor] face-api models not found; skipping face detection');
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) return;
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      const video = document.createElement('video');
      video.muted = true;
      (video as any).playsInline = true;
      video.srcObject = stream as any;
      await video.play();
      // wait until video has dimensions
      if (!video.videoWidth || !video.videoHeight) {
        await new Promise<void>((resolve) => {
          const onReady = () => resolve();
          video.addEventListener('loadeddata', onReady, { once: true });
          setTimeout(() => resolve(), 1500);
        });
      }
      videoRef.current = video;

      const detect = async () => {
        if (!videoRef.current) return;
        const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.3 });
        const det = await faceapi.detectAllFaces(videoRef.current, options);
        const c = det.length;
        // Only log when face count state changes or after persistent misses
        const last = lastFaceCountRef.current;
        if (c === 0) {
          noFaceStreakRef.current += 1;
        } else {
          noFaceStreakRef.current = 0;
        }
        const persistentNoFace = c === 0 && noFaceStreakRef.current >= 3;
        if (last !== c || persistentNoFace) {
          if (c === 0 || c > 1) {
            log('face_count', { count: c }, c === 0 ? 'No face detected' : 'Multiple faces detected');
          }
          lastFaceCountRef.current = c;
        }
        setTimeout(detect, 2000);
      };
      setTimeout(detect, 1500);
    } catch (e) {
      // ignore failures silently
    }
  }, [log]);

  const init = useCallback(() => {
    document.addEventListener('visibilitychange', onVisibility);
    setupMicMonitor();
    setupFaceMonitor();
  }, [onVisibility, setupMicMonitor, setupFaceMonitor]);

  const dispose = useCallback(() => {
    document.removeEventListener('visibilitychange', onVisibility);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    try { audioCtxRef.current?.close(); } catch {}
    try {
      const v = videoRef.current;
      v?.pause();
      const stream = v?.srcObject as MediaStream | undefined;
      stream?.getTracks().forEach(t => t.stop());
    } catch {}
  }, [onVisibility]);

  return { alerts, integrityScore, init, dispose };
}
