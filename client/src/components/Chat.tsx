import React from 'react';

interface Item { role: 'interviewer' | 'candidate'; text: string }

export function Chat({ items }: { items: Item[] }) {
  return (
    <div className="chat-window">
      {items.map((m, i) => (
        <div key={i} className={`msg ${m.role}`}>
          <div className="bubble">
            <span className="role">{m.role === 'interviewer' ? 'Interviewer' : 'You'}</span>
            <div className="text">{m.text}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
