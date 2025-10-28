import React, { useEffect, useRef, useState } from 'react';

interface MicRecorderProps {
  autoStart?: boolean;
  onTranscript?: (text: string) => void;
  onAudioBlob?: (blob: Blob) => void;
}

export function MicRecorder({ autoStart = false, onTranscript, onAudioBlob }: MicRecorderProps) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    const SR = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (SR) {
      const rec: SpeechRecognition = new SR();
      rec.lang = 'en-US';
      rec.continuous = true;
      rec.interimResults = true;
      rec.onresult = (e) => {
        let final = '';
        for (let i = e.resultIndex; i < e.results.length; ++i) {
          if (e.results[i].isFinal) final += e.results[i][0].transcript;
        }
        if (final && onTranscript) {
          console.log('[MicRecorder] Transcript received:', final.trim());
          onTranscript(final.trim());
        }
      };
      recognitionRef.current = rec;
    }
  }, [onTranscript]);

  async function start() {
    try {
      console.log('[MicRecorder] Requesting microphone access...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data?.size) chunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        onAudioBlob?.(blob);
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setListening(true);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
          console.log('[MicRecorder] Started speech recognition');
        } catch (e) {
          console.error('[MicRecorder] Failed to start speech recognition:', e);
        }
      }
    } catch (e) {
      console.error('[MicRecorder] Failed to access microphone:', e);
    }
  }

  function stop() {
    try {
      mediaRecorderRef.current?.stop();
      mediaRecorderRef.current?.stream.getTracks().forEach(t => t.stop());
      recognitionRef.current?.stop?.();
      setListening(false);
      console.log('[MicRecorder] Stopped recording and recognition');
    } catch (e) {
      console.error('[MicRecorder] Error stopping:', e);
    }
  }

  useEffect(() => {
    if (autoStart) start();
    return () => {
      try { stop(); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  return (
    <div className="mic-recorder">
      <button onClick={() => (listening ? stop() : start())}>
        {listening ? 'Stop Recording' : 'Start Recording'}
      </button>
    </div>
  );
}
