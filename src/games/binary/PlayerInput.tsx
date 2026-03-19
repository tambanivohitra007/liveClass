import { useState, useCallback, useEffect } from 'react';
import { CheckCircle2 } from 'lucide-react';
import type { PlayerInputProps } from '../types';

const PLACE_VALUES_8 = [128, 64, 32, 16, 8, 4, 2, 1];
const PLACE_VALUES_4 = [8, 4, 2, 1];

export default function BinaryPlayerInput({ round, onSubmit, disabled }: PlayerInputProps) {
  const answerType = round.type.split('2')[1]; // bin, dec, hex
  const bitCount = (round.meta?.bits as number) || 8;
  const placeValues = bitCount === 4 ? PLACE_VALUES_4 : PLACE_VALUES_8;

  const [bits, setBits] = useState<number[]>(new Array(bitCount).fill(0));
  const [textInput, setTextInput] = useState('');

  // Reset when round changes
  useEffect(() => {
    setBits(new Array(bitCount).fill(0));
    setTextInput('');
  }, [round.prompt, bitCount]);

  const toggleBit = useCallback((index: number) => {
    if (disabled) return;
    setBits((prev) => {
      const next = [...prev];
      next[index] = next[index] === 0 ? 1 : 0;
      return next;
    });
  }, [disabled]);

  const binaryDecimalValue = bits.reduce((sum, b, i) => sum + b * placeValues[i], 0);

  const handleSubmit = () => {
    if (disabled) return;
    const submission = answerType === 'bin' ? bits.join('') : textInput.trim().toUpperCase();
    if (!submission) return;
    onSubmit(submission);
  };

  // Keyboard: Enter to submit, number keys to toggle bits
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (disabled) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        if (e.code === 'Enter') { e.preventDefault(); handleSubmit(); }
        return;
      }
      if (e.code === 'Enter') { e.preventDefault(); handleSubmit(); return; }
      if (answerType === 'bin') {
        const num = parseInt(e.key);
        if (!isNaN(num) && num >= 1 && num <= bitCount) {
          toggleBit(num - 1);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [disabled, bits, textInput, answerType, bitCount]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col items-center gap-3 w-full">
      {answerType === 'bin' ? (
        <div className="w-full max-w-lg">
          {/* Place values */}
          <div className={`grid gap-1.5 sm:gap-3 mb-1 ${bitCount === 8 ? 'grid-cols-8' : 'grid-cols-4'}`}>
            {placeValues.map((v, i) => (
              <div key={i} className="text-center text-[9px] sm:text-xs font-bold text-white/30">
                {v}
              </div>
            ))}
          </div>
          {/* Bit toggles */}
          <div className={`grid gap-1.5 sm:gap-3 ${bitCount === 8 ? 'grid-cols-8' : 'grid-cols-4'}`}>
            {bits.map((b, i) => (
              <button
                key={i}
                onClick={() => toggleBit(i)}
                disabled={disabled}
                className={`aspect-square rounded-lg sm:rounded-2xl text-lg sm:text-3xl font-bold transition-all active:scale-95 disabled:opacity-50 ${
                  b === 1
                    ? 'bg-brand text-white shadow-lg shadow-brand/30 scale-105'
                    : 'bg-white/10 text-white/30 hover:bg-white/20'
                }`}
              >
                {b}
              </button>
            ))}
          </div>
          {/* Current decimal value */}
          <div className="text-center mt-2">
            <span className="text-[10px] text-white/40">= </span>
            <span className="text-xs font-bold tabular-nums text-white/60">{binaryDecimalValue}</span>
            <span className="text-[10px] text-white/40"> dec</span>
          </div>
        </div>
      ) : (
        <div className="w-full max-w-sm">
          <input
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            disabled={disabled}
            placeholder={answerType === 'dec' ? 'Enter decimal...' : 'Enter hex (e.g. 2A)...'}
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
            className="w-full bg-white/10 border-2 border-white/20 rounded-2xl px-4 py-3 text-center text-2xl font-bold font-mono text-white placeholder-white/20 focus:outline-none focus:border-brand transition-colors disabled:opacity-50"
          />
        </div>
      )}

      {!disabled && (
        <button
          onClick={handleSubmit}
          disabled={disabled || (!textInput.trim() && answerType !== 'bin')}
          className="btn-3d-cyan px-8 py-2.5 text-base font-bold flex items-center gap-2 disabled:opacity-50"
        >
          <CheckCircle2 className="w-4 h-4" />
          Submit
        </button>
      )}
    </div>
  );
}
