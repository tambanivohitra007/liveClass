import type { HostPromptProps } from '../types';

/** Shared host prompt for code-based games (Code Output, SQL Output) */
export default function CodeHostPrompt({ round, showAnswer }: HostPromptProps) {
  const language = (round.meta?.language as string) || '';
  const table = round.meta?.table as string | undefined;

  return (
    <div className="bg-white/[0.07] border border-white/12 rounded-2xl p-6 sm:p-8">
      {table && table !== '(no table)' && (
        <div className="mb-4 px-4 py-2 bg-white/5 rounded-xl">
          <p className="text-[10px] font-bold text-white/30 uppercase tracking-wider mb-1">Table</p>
          <p className="text-xs font-mono text-white/60">{table}</p>
        </div>
      )}
      <p className="text-xs font-bold text-white/40 uppercase tracking-wider mb-2">
        What is the output?
        {language && <span className="ml-2 px-2 py-0.5 rounded-full bg-brand/10 text-brand text-[10px]">{language}</span>}
      </p>
      <div className="bg-[#1a1a2e] rounded-xl p-4 sm:p-6 my-3">
        <pre className="text-sm sm:text-lg font-mono text-emerald-400 whitespace-pre-wrap leading-relaxed">{round.prompt}</pre>
      </div>
      {showAnswer && (
        <div className="mt-4 text-center animate-fade-in">
          <p className="text-xs font-bold text-white/40 uppercase tracking-wider mb-1">Output</p>
          <span className="text-2xl sm:text-3xl font-bold font-mono text-success">{round.answer}</span>
        </div>
      )}
    </div>
  );
}
