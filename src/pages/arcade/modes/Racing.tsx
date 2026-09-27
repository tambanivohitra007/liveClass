import { useState } from 'react';
import type { ArcadePlayer } from '../../../types/arcade';
import QuestionPanel from '../QuestionPanel';
import type { PlayerAuth } from '../api';

interface Props {
  auth: PlayerAuth;
  me: ArcadePlayer;
  players: ArcadePlayer[];
  goal: number;
}

/** Student view: a mini track with every racer, plus the question loop. */
export default function Racing({ auth, me, players, goal }: Props) {
  const [n, setN] = useState(0);
  const [boost, setBoost] = useState(false);
  const rank = players.filter((p) => p.score > me.score).length + 1;

  if (me.finishedAt) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 p-6 text-center text-white animate-fade-in">
        <div className="text-7xl">🏁</div>
        <h2 className="text-3xl">You crossed the finish line!</h2>
        <p className="text-white/60 font-semibold">Place #{rank}</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="shrink-0 px-3 pt-3">
        <div className="relative h-14 rounded-2xl bg-gradient-to-r from-slate-800 to-slate-700 border border-white/10 overflow-hidden">
          <div className="absolute inset-y-0 right-0 w-6 bg-[repeating-conic-gradient(#fff_0_25%,#111_0_50%)] bg-[length:12px_12px] opacity-80" />
          {players.slice(0, 30).map((p) => {
            const pct = Math.min(1, p.score / goal);
            const mine = p.id === me.id;
            return (
              <span
                key={p.id}
                title={p.nickname}
                className={`absolute top-1/2 -translate-y-1/2 transition-all duration-700 ease-out ${mine ? 'text-3xl z-10 drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]' : 'text-lg opacity-50'}`}
                style={{ left: `calc(${pct * 100}% * 0.9 + 4px)` }}
              >
                {p.avatar}
              </span>
            );
          })}
        </div>
        <div className="flex justify-between text-white/70 text-sm font-bold mt-1 px-1">
          <span>
            {me.score} / {goal}
          </span>
          <span>{boost ? '⚡ Speed boost!' : me.streak >= 2 ? `🔥 ${me.streak} streak` : ''}</span>
          <span>#{rank} of {players.length}</span>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <QuestionPanel
          key={n}
          auth={auth}
          onResult={(r) => {
            setBoost(!!r.correct && (r.progress ?? 0) - me.score > 1);
            setN((x) => x + 1);
          }}
        />
      </div>
    </div>
  );
}
