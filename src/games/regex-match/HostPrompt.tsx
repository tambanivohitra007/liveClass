import type { HostPromptProps } from '../types';

/** Custom host prompt for Regex Match — shows pattern and test string */
export default function RegexHostPrompt({ round, showAnswer }: HostPromptProps) {
  const testString = round.meta?.testString as string | undefined;

  return (
    <div className="bg-white/[0.07] border border-white/12 rounded-2xl p-6 sm:p-8">
      <p className="text-xs font-bold text-white/40 uppercase tracking-wider mb-2">Pattern</p>
      <div className="bg-[#1a1a2e] rounded-xl p-4 sm:p-6 my-3">
        <pre className="text-2xl sm:text-4xl font-mono text-emerald-400 text-center">{round.prompt}</pre>
      </div>
      {testString && (
        <div className="mt-4">
          <p className="text-xs font-bold text-white/40 uppercase tracking-wider mb-2">Test String</p>
          <div className="bg-[#1a1a2e] rounded-xl p-4 sm:p-6">
            <pre className="text-xl sm:text-2xl font-mono text-warning text-center">{testString}</pre>
          </div>
        </div>
      )}
      {showAnswer && (
        <div className="mt-4 text-center animate-fade-in">
          <p className="text-xs font-bold text-white/40 uppercase tracking-wider mb-1">Correct Answer</p>
          <span className="text-3xl sm:text-4xl font-bold font-mono text-success">
            {round.answer === '1' ? 'Match' : 'No Match'}
          </span>
        </div>
      )}
    </div>
  );
}
