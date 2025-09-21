import { useCallback, useEffect, useRef, useState } from 'react';

interface UseSpeech {
  supported: boolean;
  isListening: boolean;
  resultText: string;
  startListening: () => void;
  stopListening: () => void;
  resetResult: () => void;
  speak: (text: string | { text: string; onEnd?: () => void }) => void;
}

export function useSpeech(): UseSpeech {
  const Recognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
  const supported = Boolean(Recognition) && 'speechSynthesis' in window;

  const recRef = useRef<any | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [resultText, setResultText] = useState('');

  useEffect(() => {
    if (!supported) return;
    const rec = new Recognition();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onresult = (e: any) => {
      const t = e.results?.[0]?.[0]?.transcript || '';
      setResultText(t);
    };
    rec.onend = () => setIsListening(false);
    rec.onerror = () => setIsListening(false);

    recRef.current = rec;
    return () => {
      try { rec.stop(); } catch {}
      recRef.current = null;
    };
  }, [supported]);

  const startListening = useCallback(() => {
    if (!supported || !recRef.current) return;
    try {
      setResultText('');
      recRef.current.start();
      setIsListening(true);
    } catch {}
  }, [supported]);

  const stopListening = useCallback(() => {
    if (!supported || !recRef.current) return;
    try { recRef.current.stop(); } catch {}
    setIsListening(false);
  }, [supported]);

  const speak = useCallback((arg: string | { text: string; onEnd?: () => void }) => {
    const payload = typeof arg === 'string' ? { text: arg } : arg;
    if (!('speechSynthesis' in window)) {
      // If TTS not available, still invoke onEnd to continue flow
      payload.onEnd?.();
      return;
    }
    const u = new SpeechSynthesisUtterance(payload.text);
    u.rate = 1.0;
    u.pitch = 1.0;
    u.lang = 'en-US';
    if (payload.onEnd) {
      u.onend = () => {
        try { payload.onEnd?.(); } catch {}
      };
    }
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }, []);

  const resetResult = useCallback(() => setResultText(''), []);

  return { supported, isListening, resultText, startListening, stopListening, resetResult, speak };
}
