import type { PlayerInputProps } from '../types';

/** Simple 0/1 toggle input for logic gates, boolean algebra */
export default function ToggleSingleInput({ onSubmit, disabled }: PlayerInputProps) {
  return (
    <div className="flex items-center gap-4">
      {[0, 1].map((v) => (
        <button
          key={v}
          onClick={() => !disabled && onSubmit(String(v))}
          disabled={disabled}
          className={`w-20 h-20 sm:w-24 sm:h-24 rounded-2xl text-3xl sm:text-4xl font-bold transition-all active:scale-95 disabled:opacity-50 ${
            v === 1
              ? 'bg-success/20 border-2 border-success/40 text-success hover:bg-success/30'
              : 'bg-danger/20 border-2 border-danger/40 text-danger hover:bg-danger/30'
          }`}
        >
          {v}
        </button>
      ))}
    </div>
  );
}
