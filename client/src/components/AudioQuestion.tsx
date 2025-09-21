import React, { useEffect } from 'react';

export function AudioQuestion({ text, onEnd }: { text: string; onEnd?: () => void }) {
  useEffect(() => {
    if (!text) return;
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1;
    utter.pitch = 1;
    utter.onend = () => onEnd?.();
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
    return () => {
      window.speechSynthesis.cancel();
    };
  }, [text, onEnd]);
  return null;
}
