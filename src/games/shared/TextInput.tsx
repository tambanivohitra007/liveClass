import { useState, useEffect } from 'react';
import { CheckCircle2 } from 'lucide-react';
import type { PlayerInputProps } from '../types';

export default function TextInput({ round, onSubmit, disabled }: PlayerInputProps) {
  const [value, setValue] = useState('');

  useEffect(() => { setValue(''); }, [round.prompt]);

  const handleSubmit = () => {
    if (disabled || !value.trim()) return;
    onSubmit(value.trim());
  };

  return (
    <div className="flex flex-col items-center gap-3 w-full max-w-sm">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={disabled}
        placeholder="Type your answer..."
        autoFocus
        onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
        className="w-full bg-white/10 border-2 border-white/20 rounded-2xl px-4 py-3 text-center text-2xl font-bold font-mono text-white placeholder-white/20 focus:outline-none focus:border-brand transition-colors disabled:opacity-50"
      />
      {!disabled && (
        <button
          onClick={handleSubmit}
          disabled={disabled || !value.trim()}
          className="btn-3d-cyan px-8 py-2.5 text-base font-bold flex items-center gap-2 disabled:opacity-50"
        >
          <CheckCircle2 className="w-4 h-4" />
          Submit
        </button>
      )}
    </div>
  );
}
