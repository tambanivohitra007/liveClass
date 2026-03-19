import type { HostPromptProps } from '../types';

const TYPE_LABELS: Record<string, string> = {
  dec2bin: 'DEC → BIN',
  bin2dec: 'BIN → DEC',
  dec2hex: 'DEC → HEX',
  hex2dec: 'HEX → DEC',
  hex2bin: 'HEX → BIN',
  bin2hex: 'BIN → HEX',
};

const TARGET_LABELS: Record<string, string> = {
  bin: 'Binary',
  dec: 'Decimal',
  hex: 'Hexadecimal',
};

export default function BinaryHostPrompt({ round, showAnswer }: HostPromptProps) {
  const sourceType = round.type.split('2')[0]; // dec, bin, hex
  const targetType = round.type.split('2')[1]; // bin, dec, hex

  return (
    <div className="bg-white/[0.07] border border-white/12 rounded-2xl p-6 sm:p-8">
      <p className="text-xs font-bold text-white/40 uppercase tracking-wider mb-2">
        Convert this {sourceType.toUpperCase()} value
        <span className="ml-2 px-2 py-0.5 rounded-full bg-brand/10 text-brand text-[10px]">
          {TYPE_LABELS[round.type] || round.type}
        </span>
      </p>
      <div className="flex items-center justify-center py-4">
        <span className="text-4xl sm:text-6xl font-bold font-mono tracking-wider text-brand">
          {round.prompt}
        </span>
      </div>
      <p className="text-center text-sm text-white/40 mt-2">
        to <span className="font-bold text-white/70 uppercase">{TARGET_LABELS[targetType] || targetType}</span>
      </p>

      {showAnswer && (
        <div className="mt-4 text-center animate-fade-in">
          <p className="text-xs font-bold text-white/40 uppercase tracking-wider mb-1">Correct Answer</p>
          <span className="text-3xl sm:text-4xl font-bold font-mono text-success">{round.answer}</span>
        </div>
      )}
    </div>
  );
}
