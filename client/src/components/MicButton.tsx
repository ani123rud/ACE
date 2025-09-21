import React from 'react';

export function MicButton({ isListening, onStart, onStop, disabled }: { isListening: boolean; onStart: () => void; onStop: () => void; disabled?: boolean }) {
  return (
    <button className={`mic ${isListening ? 'rec' : ''}`} onClick={isListening ? onStop : onStart} disabled={disabled}>
      {isListening ? 'Stop' : 'Speak'}
    </button>
  );
}
