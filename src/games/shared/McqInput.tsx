import type { PlayerInputProps } from '../types';

export default function McqInput({ round, onSubmit, disabled }: PlayerInputProps) {
  const options = (round.meta?.options as { value: string; label: string }[]) || [];
  // Use single column if more than 4 options, 2 columns otherwise
  const cols = options.length > 4 ? 'grid-cols-1' : 'grid-cols-2';

  return (
    <div className="flex flex-col items-center gap-2 w-full max-w-md">
      <div className={`grid ${cols} gap-2 w-full`}>
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => !disabled && onSubmit(opt.value)}
            disabled={disabled}
            className="px-3 py-3 rounded-xl text-sm font-bold transition-all active:scale-95 bg-white/10 border border-white/20 text-white hover:bg-brand/20 hover:border-brand/40 disabled:opacity-50"
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
