import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { ArcadeChestResult, ArcadeTarget, ChestOutcome } from '../../../types/arcade';
import QuestionPanel from '../QuestionPanel';
import { arcadeApi, chestLabel, errorMessage, type PlayerAuth } from '../api';

type Phase =
  | { kind: 'loading' }
  | { kind: 'question'; n: number }
  | { kind: 'chests' }
  | { kind: 'reveal'; result: ArcadeChestResult; picked: number }
  | { kind: 'target'; outcome: ChestOutcome; targets: ArcadeTarget[] }
  | { kind: 'social'; text: string };

const TONE: Record<string, string> = {
  good: 'from-amber-400 to-yellow-600',
  bad: 'from-rose-500 to-rose-700',
  social: 'from-purple-500 to-fuchsia-700',
  neutral: 'from-slate-500 to-slate-700',
};

export default function GoldQuest({ auth }: { auth: PlayerAuth }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [round, setRound] = useState(0);

  const nextQuestion = () => {
    setError('');
    setRound((r) => r + 1);
    setPhase({ kind: 'question', n: round + 1 });
  };

  // Resume unopened chests / a pending steal after a refresh.
  useEffect(() => {
    arcadeApi.resume(auth).then(
      (r) => {
        if (r.pending && (r.pending.kind === 'steal' || r.pending.kind === 'swap')) {
          setPhase({ kind: 'target', outcome: r.pending, targets: r.targets });
        } else if (r.chests) setPhase({ kind: 'chests' });
        else setPhase({ kind: 'question', n: 0 });
      },
      () => setPhase({ kind: 'question', n: 0 }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openChest = async (index: number) => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await arcadeApi.chest({ ...auth, index });
      setPhase({ kind: 'reveal', result, picked: index });
    } catch (e) {
      setError(errorMessage(e));
      nextQuestion();
    } finally {
      setBusy(false);
    }
  };

  const chooseTarget = async (target: ArcadeTarget) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await arcadeApi.target({ ...auth, targetId: target.id });
      const text = r.outcome.kind === 'swap'
        ? `You swapped gold with ${target.nickname}! You now have ${r.score.toLocaleString()}.`
        : `You stole ${r.gained.toLocaleString()} gold from ${target.nickname}!`;
      setPhase({ kind: 'social', text });
    } catch (e) {
      setError(errorMessage(e));
      nextQuestion();
    } finally {
      setBusy(false);
    }
  };

  switch (phase.kind) {
    case 'loading':
      return (
        <div className="h-full flex items-center justify-center">
          <Loader2 className="w-10 h-10 text-white/60 animate-spin" />
        </div>
      );

    case 'question':
      return (
        <QuestionPanel
          key={phase.n}
          auth={auth}
          onResult={(r) => (r.correct && r.chests ? setPhase({ kind: 'chests' }) : nextQuestion())}
          onError={(m) => {
            if (/chest/i.test(m)) setPhase({ kind: 'chests' });
          }}
        />
      );

    case 'chests':
      return (
        <div className="h-full flex flex-col items-center justify-center gap-6 p-4 animate-fade-in">
          <h2 className="text-3xl sm:text-4xl text-white text-center">Choose a chest!</h2>
          <div className="grid grid-cols-3 gap-3 sm:gap-6 w-full max-w-xl">
            {[0, 1, 2].map((i) => (
              <button
                key={i}
                type="button"
                disabled={busy}
                onClick={() => openChest(i)}
                className="aspect-square rounded-3xl bg-gradient-to-b from-amber-500 to-amber-800 border-4 border-amber-300/60 shadow-[0_10px_0_#78350f] active:translate-y-2 active:shadow-[0_2px_0_#78350f] transition-all flex items-center justify-center text-5xl sm:text-7xl hover:scale-105 disabled:opacity-60"
                aria-label={`Chest ${i + 1}`}
              >
                <span className="drop-shadow-lg">🎁</span>
              </button>
            ))}
          </div>
          {error && <p className="text-rose-300 font-semibold">{error}</p>}
        </div>
      );

    case 'reveal': {
      const { result, picked } = phase;
      const main = chestLabel(result.outcome);
      return (
        <div className="h-full flex flex-col items-center justify-center gap-6 p-4 animate-fade-in">
          <div className={`w-full max-w-sm rounded-3xl bg-gradient-to-b ${TONE[main.tone]} p-8 text-center text-white shadow-2xl animate-bounce-in`}>
            <div className="text-6xl mb-2">{main.emoji}</div>
            <div className="text-3xl font-black">{main.title}</div>
            {!result.needsTarget && <div className="mt-2 text-white/85 font-semibold">You have {result.score.toLocaleString()} gold</div>}
          </div>
          <div className="flex gap-3">
            {result.revealed.map((o, i) =>
              i === picked ? null : (
                <div key={i} className="rounded-2xl bg-white/5 border border-white/10 px-3 py-2 text-center text-white/50 text-sm">
                  <div className="text-2xl">{chestLabel(o).emoji}</div>
                  {chestLabel(o).title}
                </div>
              ),
            )}
          </div>
          {result.needsTarget ? (
            <button
              type="button"
              className="btn-3d-purple px-8 py-3 text-lg"
              onClick={() => setPhase({ kind: 'target', outcome: result.outcome, targets: result.targets })}
            >
              Choose a player
            </button>
          ) : (
            <button type="button" className="btn-3d-blue px-8 py-3 text-lg" onClick={nextQuestion}>
              Next question
            </button>
          )}
        </div>
      );
    }

    case 'target':
      return (
        <div className="h-full flex flex-col gap-3 p-4 animate-fade-in min-h-0">
          <h2 className="text-2xl text-white text-center shrink-0">
            {phase.outcome.kind === 'swap' ? 'Swap gold with…' : `Steal ${phase.outcome.kind === 'steal' ? phase.outcome.percent : 0}% from…`}
          </h2>
          <div className="flex-1 min-h-0 overflow-y-auto grid gap-2 content-start">
            {phase.targets.map((t) => (
              <button
                key={t.id}
                type="button"
                disabled={busy}
                onClick={() => chooseTarget(t)}
                className="flex items-center gap-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-3 text-left text-white transition-colors disabled:opacity-50"
              >
                <span className="text-3xl">{t.avatar}</span>
                <span className="flex-1 font-bold truncate">{t.nickname}</span>
                <span className="font-black text-amber-300">{t.score.toLocaleString()} 💰</span>
              </button>
            ))}
          </div>
          {error && <p className="text-rose-300 text-center font-semibold">{error}</p>}
        </div>
      );

    case 'social':
      return (
        <div className="h-full flex flex-col items-center justify-center gap-6 p-4 animate-fade-in">
          <div className="w-full max-w-sm rounded-3xl bg-gradient-to-b from-purple-500 to-fuchsia-700 p-8 text-center text-white shadow-2xl animate-bounce-in">
            <div className="text-6xl mb-3">😈</div>
            <div className="text-xl font-black">{phase.text}</div>
          </div>
          <button type="button" className="btn-3d-blue px-8 py-3 text-lg" onClick={nextQuestion}>
            Next question
          </button>
        </div>
      );
  }
}
