import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { collection, doc, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowLeft, Loader2, Lock, LockOpen, Play, RotateCcw, Square, Trophy, Users, X } from 'lucide-react';
import { db } from '../../lib/firebase';
import { APP_HOST, APP_URL } from '../../lib/config';
import { useToastStore } from '../../stores/toastStore';
import { ARCADE_MODES, type ArcadeEvent, type ArcadeGame, type ArcadePlayer } from '../../types/arcade';
import { arcadeApi, errorMessage, formatClock } from './api';

export default function ArcadeHost() {
  const { gameId = '' } = useParams();
  const navigate = useNavigate();
  const addToast = useToastStore((s) => s.addToast);
  const [game, setGame] = useState<ArcadeGame | null | undefined>(undefined);
  const [players, setPlayers] = useState<ArcadePlayer[]>([]);
  const [events, setEvents] = useState<ArcadeEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const u1 = onSnapshot(doc(db, 'arcade_games', gameId), (s) => setGame(s.exists() ? ({ ...(s.data() as ArcadeGame), id: s.id }) : null));
    const u2 = onSnapshot(query(collection(db, 'arcade_games', gameId, 'players'), orderBy('score', 'desc')), (s) =>
      setPlayers(s.docs.map((d) => ({ ...(d.data() as ArcadePlayer), id: d.id }))),
    );
    const u3 = onSnapshot(query(collection(db, 'arcade_games', gameId, 'events'), orderBy('at', 'desc'), limit(8)), (s) =>
      setEvents(s.docs.map((d) => ({ ...(d.data() as ArcadeEvent), id: d.id }))),
    );
    return () => {
      u1();
      u2();
      u3();
    };
  }, [gameId]);

  useEffect(() => {
    if (game?.status !== 'live') return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [game?.status]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      addToast('error', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (game === undefined) {
    return (
      <div className="h-dvh flex items-center justify-center bg-[#0B1224]">
        <Loader2 className="w-10 h-10 text-white/60 animate-spin" />
      </div>
    );
  }
  if (game === null) {
    return (
      <div className="h-dvh flex flex-col items-center justify-center gap-4 bg-[#0B1224] text-white">
        <p className="font-bold">Game not found.</p>
        <Link to="/arcade" className="btn-3d-blue px-6 py-3">Back to Arcade</Link>
      </div>
    );
  }

  const mode = ARCADE_MODES[game.mode];
  const joinUrl = `${APP_URL}/join?pin=${game.pinCode}`;
  const pinPretty = `${game.pinCode.slice(0, 3)} ${game.pinCode.slice(3)}`;
  const remaining = game.endsAt ? game.endsAt - now : null;

  const playAgain = () =>
    run(async () => {
      const r = await arcadeApi.create({ quizId: game.quizId, mode: game.mode, settings: game.settings });
      navigate(`/arcade/${r.gameId}/host`, { replace: true });
    });

  return (
    <div className="h-dvh flex flex-col bg-gradient-to-b from-[#0B1224] to-[#151D3B] text-white overflow-hidden">
      <header className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-white/10 bg-black/20">
        <Link to="/arcade" className="p-2 rounded-xl hover:bg-white/10" aria-label="Back to Arcade">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <span className="text-3xl">{mode.emoji}</span>
        <div className="min-w-0">
          <h1 className="text-xl leading-tight truncate">{mode.name}</h1>
          <p className="text-white/50 text-sm font-semibold truncate">{game.quizTitle}</p>
        </div>
        <div className="flex-1" />
        {game.status !== 'lobby' && (
          <span className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 font-bold text-sm">
            PIN <span className="tabular-nums">{pinPretty}</span>
          </span>
        )}
        <span className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 font-bold">
          <Users className="w-4 h-4" /> {players.length}
        </span>
        {game.status === 'live' && remaining !== null && (
          <span className={`px-4 py-1.5 rounded-full font-black text-lg tabular-nums ${remaining < 30_000 ? 'bg-rose-500 animate-pulse' : 'bg-white/10'}`}>
            {formatClock(remaining)}
          </span>
        )}
        {game.status === 'live' && (
          <button type="button" disabled={busy} onClick={() => run(() => arcadeApi.end({ gameId }))} className="btn-3d-danger px-4 py-2 flex items-center gap-2">
            <Square className="w-4 h-4" /> End
          </button>
        )}
      </header>

      {game.status === 'lobby' && (
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-6 p-4 sm:p-6 overflow-y-auto">
          <div className="lg:w-[420px] shrink-0 flex flex-col items-center gap-4 rounded-3xl bg-white/5 border border-white/10 p-6">
            <p className="text-white/60 font-bold uppercase tracking-widest text-sm">Join at {APP_HOST}</p>
            <div className="text-6xl sm:text-7xl font-black tracking-wider tabular-nums">{pinPretty}</div>
            <div className="bg-white p-4 rounded-3xl">
              <QRCodeSVG value={joinUrl} size={220} level="M" />
            </div>
            <p className="text-white/40 text-sm text-center break-all">{joinUrl}</p>
          </div>
          <div className="flex-1 min-w-0 flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-2xl flex-1">{players.length === 0 ? 'Waiting for players…' : `${players.length} player${players.length === 1 ? '' : 's'} ready`}</h2>
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => arcadeApi.setLock({ gameId, locked: !game.joinLocked }))}
                className="btn-3d-ghost px-4 py-2 flex items-center gap-2"
              >
                {game.joinLocked ? <Lock className="w-4 h-4" /> : <LockOpen className="w-4 h-4" />}
                {game.joinLocked ? 'Locked' : 'Open'}
              </button>
              <button
                type="button"
                disabled={busy || players.length === 0}
                onClick={() => run(() => arcadeApi.start({ gameId }))}
                className="btn-3d-success btn-3d-lg px-8 py-3 flex items-center gap-2 disabled:opacity-40"
              >
                <Play className="w-5 h-5" /> Start
              </button>
            </div>
            <p className="text-white/50 font-semibold">
              {mode.tagline}{' '}
              {game.settings.timeLimitSec ? `· ${Math.round(game.settings.timeLimitSec / 60)} min` : ''}
              {game.settings.goal ? ` · goal ${game.settings.goal.toLocaleString()}${game.mode === 'gold' ? ' gold' : ''}` : ''}
              {` · ${game.questionCount} questions`}
            </p>
            <div className="flex flex-wrap gap-2 content-start">
              {players
                .slice()
                .sort((a, b) => a.joinedAt - b.joinedAt)
                .map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    title="Remove player"
                    onClick={() => run(() => arcadeApi.kick({ gameId, playerId: p.id }))}
                    className="group flex items-center gap-2 pl-2 pr-3 py-2 rounded-full bg-white/10 hover:bg-rose-500/80 font-bold animate-bounce-in transition-colors"
                  >
                    <span className="text-xl">{p.avatar}</span>
                    {p.nickname}
                    <X className="w-4 h-4 opacity-0 group-hover:opacity-100" />
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {game.status === 'live' && (
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-4 p-4 sm:p-6">
          <div className="flex-1 min-w-0 min-h-0 overflow-y-auto">
            {game.mode === 'racing' ? <RaceTrack players={players} goal={game.settings.goal ?? 20} /> : <Board players={players} mode={game.mode} goal={game.settings.goal} />}
          </div>
          {game.mode !== 'tower' && game.mode !== 'cafe' && (
            <aside className="lg:w-80 shrink-0 rounded-3xl bg-white/5 border border-white/10 p-4 max-h-64 lg:max-h-none overflow-y-auto">
              <h3 className="text-lg mb-3">Live feed</h3>
              {events.length === 0 && <p className="text-white/40 text-sm">Big moments show up here.</p>}
              <ul className="space-y-2">
                {events.map((e) => (
                  <li key={e.id} className="rounded-xl bg-white/5 px-3 py-2 text-sm font-semibold animate-slide-down">
                    {e.text}
                  </li>
                ))}
              </ul>
            </aside>
          )}
        </div>
      )}

      {game.status === 'ended' && (
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-8 flex flex-col items-center gap-8">
          <Podium players={players} winnerId={game.winnerId} mode={game.mode} />
          <div className="w-full max-w-3xl rounded-3xl bg-white/5 border border-white/10 overflow-hidden">
            <table className="w-full text-left">
              <thead className="text-white/50 text-sm uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Player</th>
                  <th className="px-4 py-3 text-right">{game.mode === 'gold' ? 'Gold' : game.mode === 'racing' ? 'Distance' : 'Score'}</th>
                  <th className="px-4 py-3 text-right">Accuracy</th>
                </tr>
              </thead>
              <tbody>
                {players.map((p, i) => (
                  <tr key={p.id} className="border-t border-white/5">
                    <td className="px-4 py-2 font-bold text-white/60">{i + 1}</td>
                    <td className="px-4 py-2 font-bold">
                      {p.avatar} {p.nickname}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums font-black">{p.score.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-white/70">
                      {p.answered ? `${Math.round((p.correct / p.answered) * 100)}% (${p.correct}/${p.answered})` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-3 pb-6">
            <button type="button" disabled={busy} onClick={playAgain} className="btn-3d-blue px-6 py-3 flex items-center gap-2">
              <RotateCcw className="w-5 h-5" /> Play again
            </button>
            <Link to="/arcade" className="btn-3d-ghost px-6 py-3">New game</Link>
          </div>
        </div>
      )}
    </div>
  );
}

function Board({ players, mode, goal }: { players: ArcadePlayer[]; mode: ArcadeGame['mode']; goal: number | null }) {
  const top = players.slice(0, 12);
  const max = Math.max(goal ?? 0, top[0]?.score ?? 0, 1);
  const unit = mode === 'gold' ? '💰' : mode === 'cafe' ? '$' : 'pts';
  return (
    <div className="space-y-2">
      {top.map((p, i) => (
        <div key={p.id} className="relative flex items-center gap-3 rounded-2xl bg-white/5 border border-white/10 px-4 py-3 overflow-hidden">
          <div
            className={`absolute inset-y-0 left-0 transition-all duration-700 ease-out ${i === 0 ? 'bg-amber-400/25' : 'bg-brand/15'}`}
            style={{ width: `${(p.score / max) * 100}%` }}
          />
          <span className="relative w-8 text-center font-black text-white/60">{i + 1}</span>
          <span className="relative text-3xl">{p.avatar}</span>
          <span className="relative flex-1 min-w-0 font-bold text-lg truncate">{p.nickname}</span>
          {p.streak >= 3 && <span className="relative text-sm font-bold text-orange-300">🔥{p.streak}</span>}
          <span className="relative font-black text-xl tabular-nums">
            {mode === 'cafe' ? `$${p.score.toLocaleString()}` : `${p.score.toLocaleString()} ${unit}`}
          </span>
        </div>
      ))}
      {players.length > top.length && <p className="text-white/40 text-center font-semibold">+{players.length - top.length} more players</p>}
    </div>
  );
}

function RaceTrack({ players, goal }: { players: ArcadePlayer[]; goal: number }) {
  const lanes = players.slice(0, 15);
  return (
    <div className="rounded-3xl bg-gradient-to-b from-emerald-900/40 to-emerald-950/40 border border-white/10 p-3 sm:p-4 space-y-1.5">
      {lanes.map((p, i) => {
        const pct = Math.min(1, p.score / goal);
        return (
          <div key={p.id} className="relative h-12 rounded-xl bg-slate-800/80 border-y-2 border-dashed border-white/10 overflow-hidden">
            <div className="absolute inset-y-0 right-0 w-8 bg-[repeating-conic-gradient(#fff_0_25%,#111_0_50%)] bg-[length:12px_12px] opacity-70" />
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-white/30 font-black text-sm">{i + 1}</span>
            <div className="absolute top-1/2 -translate-y-1/2 flex items-center gap-2 transition-all duration-700 ease-out" style={{ left: `calc(${pct} * (100% - 11rem) + 1.5rem)` }}>
              <span className="text-3xl drop-shadow-lg">{p.avatar}</span>
              <span className="font-bold text-sm whitespace-nowrap bg-black/40 rounded-full px-2 py-0.5">
                {p.nickname} {p.finishedAt ? '🏁' : ''}
              </span>
            </div>
          </div>
        );
      })}
      {players.length > lanes.length && <p className="text-white/40 text-center font-semibold pt-1">+{players.length - lanes.length} more racers</p>}
    </div>
  );
}

function Podium({ players, winnerId, mode }: { players: ArcadePlayer[]; winnerId: string | null; mode: ArcadeGame['mode'] }) {
  const ordered = [...players];
  const wi = ordered.findIndex((p) => p.id === winnerId);
  if (wi > 0) ordered.unshift(...ordered.splice(wi, 1));
  const [first, second, third] = ordered;
  const slot = (p: ArcadePlayer | undefined, place: number, h: string, color: string) =>
    p ? (
      <div className="flex flex-col items-center gap-2 w-28 sm:w-36 animate-slide-up">
        <span className="text-5xl sm:text-6xl">{p.avatar}</span>
        <span className="font-bold text-center truncate w-full">{p.nickname}</span>
        <span className="text-white/70 font-black tabular-nums">{p.score.toLocaleString()}{mode === 'gold' ? ' 💰' : ''}</span>
        <div className={`w-full ${h} ${color} rounded-t-2xl flex items-start justify-center pt-3 text-4xl font-black`}>{place}</div>
      </div>
    ) : null;
  return (
    <div className="flex flex-col items-center gap-4">
      <h2 className="text-4xl flex items-center gap-3">
        <Trophy className="w-10 h-10 text-amber-300" /> Winners
      </h2>
      <div className="flex items-end gap-2 sm:gap-4">
        {slot(second, 2, 'h-24', 'bg-slate-400/70')}
        {slot(first, 1, 'h-36', 'bg-amber-400/80')}
        {slot(third, 3, 'h-16', 'bg-orange-700/70')}
      </div>
    </div>
  );
}
