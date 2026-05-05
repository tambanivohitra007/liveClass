import type { HostPromptProps } from '../types';

/** Generic host prompt — shows prompt big, optional question from meta, answer on reveal */
export default function SimpleHostPrompt({ round, showAnswer }: HostPromptProps) {
  const question = round.meta?.question as string | undefined;

  return (
    <div className="bg-white/[0.07] border border-white/12 rounded-2xl p-6 sm:p-8">
      {question && (
        <p className="text-xs font-bold text-white/40 uppercase tracking-wider mb-2">{question}</p>
      )}
      <div className="flex items-center justify-center py-4">
        <span className="text-4xl sm:text-6xl font-bold font-mono tracking-wider text-brand break-all text-center">
          {round.prompt}
        </span>
      </div>
      {showAnswer && (
        <div className="mt-4 text-center animate-fade-in">
          <p className="text-xs font-bold text-white/40 uppercase tracking-wider mb-1">Correct Answer</p>
          <span className="text-3xl sm:text-4xl font-bold font-mono text-success">{round.answer}</span>
        </div>
      )}
    </div>
  );
}
