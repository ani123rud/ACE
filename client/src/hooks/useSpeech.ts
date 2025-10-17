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
  const stopRequestedRef = useRef(false);

  useEffect(() => {
    if (!supported) return;
    const rec = new Recognition();
    rec.lang = 'en-US';
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (e: any) => {
      let final = '';
      const ri = e.resultIndex || 0;
      for (let i = ri; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          final += e.results[i][0]?.transcript || '';
        }
      }
      if (final) setResultText(final.trim());
    };
    rec.onend = () => {
      if (stopRequestedRef.current) {
        setIsListening(false);
        return;
      }
      try {
        rec.start();
        setIsListening(true);
      } catch {}
    };
    rec.onerror = () => {
      if (stopRequestedRef.current) {
        setIsListening(false);
        return;
      }
      try {
        rec.start();
        setIsListening(true);
      } catch {}
    };

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
      stopRequestedRef.current = false;
      recRef.current.start();
      setIsListening(true);
    } catch {}
  }, [supported]);

  const stopListening = useCallback(() => {
    if (!supported || !recRef.current) return;
    try { stopRequestedRef.current = true; recRef.current.stop(); } catch {}
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
