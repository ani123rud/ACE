import React, { useEffect, useMemo, useState } from 'react';
import { Chat } from './components/Chat';
import { MicButton } from './components/MicButton';
import { ProctorPanel } from './components/ProctorPanel';
import { useSpeech } from './hooks/useSpeech';
import { useProctoring } from './hooks/useProctoring';
import { api } from './api/client';
import { startFinalScoring } from './api/client';
import { useNavigate } from 'react-router-dom';
import RagUploader from './components/RagUploader';
import { WebcamProctor } from './components/WebcamProctor';
import DomainSelector from './components/DomainSelector';
import LoadingOverlay from './components/LoadingOverlay';
import AlertToasts, { Toast } from './components/AlertToasts';

interface QAItem {
  role: 'interviewer' | 'candidate';
  text: string;
}

export default function App() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentQ, setCurrentQ] = useState<{ id: string | null; text: string } | null>(null);
  const [domain, setDomain] = useState<string | null>(null);
  const [email, setEmail] = useState('candidate@example.com');
  const [transcript, setTranscript] = useState<QAItem[]>([]);
  const [evaluating, setEvaluating] = useState(false);
  const [qaList, setQaList] = useState<Array<{ question: string; answer: string }>>([]);
  const [refCaptured, setRefCaptured] = useState<boolean>(false);
  const [isStarting, setIsStarting] = useState(false);
  const [proctorEnabled, setProctorEnabled] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const { startListening, stopListening, isListening, resultText, resetResult, speak, supported: speechSupported } = useSpeech();
  const navigate = useNavigate();

  const sid = sessionId || '';
  const { alerts, integrityScore, init: initProctor, dispose: disposeProctor } = useProctoring(sid);

  useEffect(() => {
    // init webcam/mic/tab listeners when session active
    if (sessionId) {
      initProctor();
      return () => disposeProctor();
    }
  }, [sessionId]);

  // Initialize from Start/Capture steps for immersive flow
  useEffect(() => {
    const savedEmail = localStorage.getItem('ace.email');
    const savedDomain = localStorage.getItem('ace.domain');
    const savedRef = localStorage.getItem('ace.refCaptured');
    if (savedEmail) setEmail(savedEmail);
    if (savedDomain) setDomain(savedDomain);
    if (savedRef === 'true') setRefCaptured(true);
  }, []);

  // Toast alerts for proctoring
  const [toasts, setToasts] = useState<Toast[]>([]);
  const pushToast = (message: string, severity: 'low'|'medium'|'high' = 'low') => {
    setToasts(ts => [{ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, message, severity, ts: Date.now() }, ...ts].slice(0, 5));
  };
  const removeToast = (id: string) => setToasts(ts => ts.filter(t => t.id !== id));

  // Fullscreen helpers
  useEffect(() => {
    const onFs = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);
  const enterFullscreen = () => {
    document.documentElement.requestFullscreen?.();
  };
  const exitFullscreen = () => {
    document.exitFullscreen?.();
  };

  const startSession = async () => {
    if (!refCaptured) {
      setTranscript(t => [...t, { role: 'interviewer', text: 'Please capture your reference face before starting.' }]);
      return;
    }
    if (!domain) return;
    setIsStarting(true);
    setProctorEnabled(true);
    try {
      // Increase timeout as first-time generation can take longer when models cold-start
      const { data } = await api.post('/api/start', { candidateEmail: email, domain }, { timeout: 120000 });
      setSessionId(data.sessionId);
      setCurrentQ(data.firstQ);
      setTranscript(t => [...t, { role: 'interviewer', text: data.firstQ.text }]);
      // Start mic after question is spoken
      stopListening();
      speak({ text: data.firstQ.text, onEnd: () => startListening() });
    } catch (e: any) {
      const message = e?.message || 'Failed to start interview (network/timeout). Please try again.';
      setTranscript(t => [...t, { role: 'interviewer', text: message }]);
    }
    finally {
      setIsStarting(false);
    }
  };

  const newInterview = () => {
    if (isStarting || evaluating) {
      const proceed = window.confirm('Processing is ongoing. Do you still want to start a new interview?');
      if (!proceed) return;
    }
    // Keep reference capture so user doesn't need to recapture
    const keepRef = refCaptured;
    setProctorEnabled(false);
    setSessionId(null);
    setCurrentQ(null);
    setTranscript([]);
    setQaList([]);
    setEvaluating(false);
    setIsStarting(false);
    setRefCaptured(keepRef);
  };

  const submitAnswer = async (answer: string) => {
    if (!sessionId || !currentQ) return;
    setTranscript(t => [...t, { role: 'candidate', text: answer }]);
    // Collect QA for final scoring
    if (currentQ?.text) setQaList(list => [...list, { question: currentQ.text, answer }]);
    // Keep flow continuous: no mid-interview evaluation or announcements
    stopListening();
    try {
      const { data } = await api.post('/api/answer', { sessionId, questionId: currentQ.id, candidateText: answer, fast: true }, { timeout: 60000 });
      setEvaluating(false);
      if (data.nextQuestion) {
        setCurrentQ(data.nextQuestion);
        if (data.nextQuestion.text) {
          setTranscript(t => [...t, { role: 'interviewer', text: data.nextQuestion.text }]);
          speak({ text: data.nextQuestion.text, onEnd: () => startListening() });
        }
      }
      // If neither feedback nor nextQuestion text provided, still keep the flow responsive
      if (!data.nextQuestion?.text) {
        setTranscript(t => [...t, { role: 'interviewer', text: 'Thanks, moving on.' }]);
        speak({ text: 'Thanks, moving on.', onEnd: () => startListening() });
      }
    } catch (e) {
      setEvaluating(false);
      setTranscript(t => [...t, { role: 'interviewer', text: 'Continuing to next question.' }]);
      speak({ text: 'Continuing to next question.', onEnd: () => startListening() });
    }
  };

  // When STT produces a final transcript, auto-submit
  useEffect(() => {
    if (resultText) {
      const answer = resultText;
      resetResult();
      stopListening();
      submitAnswer(answer);
    }
  }, [resultText]);

  const canStart = useMemo(() => Boolean(email && domain && refCaptured), [email, domain, refCaptured]);

  const finishAndScore = async () => {
    if (!sessionId) return;
    try {
      // Stop proctor immediately to avoid further /api/proctor calls
      setProctorEnabled(false);
      try { disposeProctor(); } catch {}
      const events = alerts.map(a => ({ type: a.type, severity: a.type === 'face_count' ? 'high' : 'low', at: a.ts, data: { message: a.message } }));
      await startFinalScoring({
        sessionId,
        qa: qaList,
        proctor: {
          integrity: typeof integrityScore === 'number' ? integrityScore / 100 : integrityScore,
          events,
        }
      });
      navigate(`/report/${encodeURIComponent(sessionId)}`);
    } catch (e) {
      setTranscript(t => [...t, { role: 'interviewer', text: 'Failed to start final scoring. Please try again.' }]);
    }
  };

  return (
    <div className="container" style={{ minHeight: '100vh', display: 'grid', gridTemplateRows: 'auto 1fr' }}>
      <LoadingOverlay show={isStarting} text={'Starting interview… generating questions'} />
      <AlertToasts items={toasts} onRemove={removeToast} />
      <header className="topbar">
        <h1>AI Voice Interview</h1>
        <div className="session-controls">
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" />
          <DomainSelector value={domain} onChange={setDomain} />
          <a href="/admin" style={{ marginRight: '10px', padding: '8px 12px', backgroundColor: '#2c3e50', color: 'white', textDecoration: 'none', borderRadius: '4px' }}>Admin Panel</a>
          <button disabled={!canStart || !!sessionId} onClick={startSession}>Start Interview</button>
          {!isFullscreen && <button onClick={enterFullscreen}>Go Fullscreen</button>}
          {isFullscreen && <button onClick={exitFullscreen}>Exit Fullscreen</button>}
          <button disabled={!sessionId} onClick={finishAndScore}>Finish & Score</button>
          <button onClick={newInterview}>New Interview</button>
        </div>
      </header>

      {!speechSupported && (
        <div className="warning">Your browser does not fully support Web Speech API. Use Chrome for best results.</div>
      )}

      <main className="main">
        <section className="chat" style={{ height: 'calc(100vh - 140px)', display: 'grid', gridTemplateRows: '1fr auto', borderRight: '1px solid #eee' }}>
          <Chat items={transcript} />
          <div className="composer">
            <MicButton isListening={isListening} onStart={startListening} onStop={stopListening} disabled={!sessionId} />
          </div>
        </section>
        <aside className="proctor">
          <ProctorPanel alerts={alerts} integrity={integrityScore} />
          {sessionId && proctorEnabled && (
            <div style={{ marginTop: 12 }}>
              <WebcamProctor
                sessionId={sid}
                onAlert={(m, sev) => pushToast(m, (sev as any) || 'low')}
                onMetrics={(m) => console.log('[metrics]', m)}
              />
            </div>
          )}
          {!sessionId && proctorEnabled && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Step 1: Start camera and capture your reference face</div>
              <WebcamProctor
                sessionId={sid}
                onAlert={(m, sev) => pushToast(m, (sev as any) || 'low')}
                onMetrics={(m) => console.log('[metrics]', m)}
                onReferenceCaptured={() => setRefCaptured(true)}
                captureIntervalMs={2500}
              />
              {!refCaptured && <div className="muted" style={{ marginTop: 6 }}>Reference not captured yet.</div>}
              {refCaptured && <div style={{ color: 'green', marginTop: 6 }}>Reference captured. You can start the interview.</div>}
              <div style={{ marginTop: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Step 2: (Optional) Ingest PDFs for RAG</div>
                <RagUploader />
              </div>
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}
