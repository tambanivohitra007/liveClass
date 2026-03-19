import type { PlayerInputProps } from '../types';

export default function McqInput({ round, onSubmit, disabled }: PlayerInputProps) {
  const options = (round.meta?.options as { value: string; label: string }[]) || [];

  return (
    <div className="flex flex-col items-center gap-3 w-full max-w-md">
      <div className="grid grid-cols-2 gap-3 w-full">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => !disabled && onSubmit(opt.value)}
            disabled={disabled}
            className="px-4 py-4 rounded-2xl text-base font-bold transition-all active:scale-95 bg-white/10 border border-white/20 text-white hover:bg-brand/20 hover:border-brand/40 disabled:opacity-50"
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
