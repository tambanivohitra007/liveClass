import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { SkeletonCard } from '../../components/Skeleton';
import BackButton from '../../components/BackButton';
import { getGameModule } from '../../games/registry';
import {
  Binary, Globe, Hash, Zap, Calculator, Code, Cpu,
  Trophy, Users, Target, CheckCircle2, XCircle, Clock, Gamepad2,
} from 'lucide-react';
import type { MiniGame, MiniGamePlayer, MiniGameAnswer } from '../../types/models';

const ICON_MAP: Record<string, typeof Binary> = { Binary, Globe, Hash, Zap, Calculator, Code, Cpu, Gamepad2 };

export default function MiniGameResults() {
  const { miniGameId } = useParams<{ miniGameId: string }>();
  const navigate = useNavigate();

  const [game, setGame] = useState<MiniGame | null>(null);
  const [players, setPlayers] = useState<MiniGamePlayer[]>([]);
  const [answers, setAnswers] = useState<MiniGameAnswer[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'leaderboard' | 'rounds'>('leaderboard');

  useEffect(() => {
    if (!miniGameId) return;

    const load = async () => {
      try {
        const [gameSnap, playersSnap, answersSnap] = await Promise.all([
          getDoc(doc(db, 'mini_games', miniGameId)),
          getDocs(collection(db, `mini_games/${miniGameId}/players`)),
          getDocs(collection(db, `mini_games/${miniGameId}/answers`)),
        ]);

        if (!gameSnap.exists()) {
          navigate('/history');
          return;
        }

        setGame({ id: gameSnap.id, ...gameSnap.data() } as MiniGame);
        setPlayers(playersSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as MiniGamePlayer[]);
        setAnswers(answersSnap.docs.map((d) => d.data()) as MiniGameAnswer[]);
      } catch {
        navigate('/history');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [miniGameId, navigate]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  if (!game) return null;

  const module = getGameModule(game.gameType);
  const GameIcon = ICON_MAP[module?.metadata.icon || ''] || Gamepad2;

  const leaderboard = [...players].sort((a, b) => (b.totalPoints || 0) - (a.totalPoints || 0));
  const totalCorrect = players.reduce((sum, p) => sum + (p.correctCount || 0), 0);
  const totalAnswered = players.reduce((sum, p) => sum + (p.answeredCount || 0), 0);
  const overallAccuracy = totalAnswered > 0 ? ((totalCorrect / totalAnswered) * 100).toFixed(1) : '0';
  const avgPoints = players.length > 0 ? Math.round(players.reduce((sum, p) => sum + (p.totalPoints || 0), 0) / players.length) : 0;

  // Per-round stats
  const roundStats = game.rounds.map((round, i) => {
    const roundAnswers = answers.filter((a) => a.roundIndex === i);
    const correct = roundAnswers.filter((a) => a.correct).length;
    const avgTime = roundAnswers.length > 0
      ? Math.round(roundAnswers.reduce((sum, a) => sum + (a.timeMs || 0), 0) / roundAnswers.length / 1000 * 10) / 10
      : 0;

    return {
      round: i + 1,
      type: round.type,
      prompt: module?.formatPrompt?.(round) || round.prompt,
      answer: module?.formatAnswer?.(round) || round.answer,
      label: module?.getRoundLabel?.(round) || round.type,
      answered: roundAnswers.length,
      correct,
      accuracy: roundAnswers.length > 0 ? Math.round((correct / roundAnswers.length) * 100) : 0,
      avgTime,
    };
  });

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 text-gray-900 dark:text-white">
      {/* Header */}
      <div className="mb-8">
        <BackButton to="/history" label="Back to History" />
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center">
            <GameIcon className="w-5 h-5 text-brand" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{game.title}</h1>
            <p className="text-gray-500 dark:text-white/50 text-sm">
              {module?.metadata.name || game.gameType} &middot; {game.roundCount} rounds &middot; PIN {game.pinCode}
              {game.endedAt && (
                <> &middot; {new Date(game.endedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {[
          { icon: <Users className="w-4 h-4" />, label: 'Players', value: players.length, color: 'text-brand bg-brand/10' },
          { icon: <Target className="w-4 h-4" />, label: 'Accuracy', value: `${overallAccuracy}%`, color: 'text-success bg-success/10' },
          { icon: <Trophy className="w-4 h-4" />, label: 'Avg Points', value: avgPoints, color: 'text-warning bg-warning/10' },
          { icon: <Hash className="w-4 h-4" />, label: 'Rounds', value: game.roundCount, color: 'text-purple-400 bg-purple-400/10' },
        ].map((s) => (
          <div key={s.label} className="card-night p-4 flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl ${s.color} flex items-center justify-center shrink-0`}>{s.icon}</div>
            <div>
              <p className="text-xl font-bold">{s.value}</p>
              <p className="text-[11px] font-medium text-gray-400 dark:text-white/40 uppercase tracking-wider">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex bg-white dark:bg-white/5 rounded-xl border border-gray-200 dark:border-white/10 p-1 mb-6 w-fit">
        <button
          onClick={() => setTab('leaderboard')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            tab === 'leaderboard'
              ? 'bg-brand text-white shadow-sm'
              : 'text-gray-500 dark:text-white/50 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          <Trophy className="w-4 h-4" />
          Leaderboard
        </button>
        <button
          onClick={() => setTab('rounds')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            tab === 'rounds'
              ? 'bg-brand text-white shadow-sm'
              : 'text-gray-500 dark:text-white/50 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          <Hash className="w-4 h-4" />
          Rounds
        </button>
      </div>

      {/* Leaderboard Tab */}
      {tab === 'leaderboard' && (
        <div className="bg-white dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/10 overflow-hidden">
          <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-3 px-4 py-3 border-b border-gray-100 dark:border-white/10 text-xs font-bold text-gray-400 dark:text-white/40 uppercase tracking-wider">
            <span>#</span>
            <span>Player</span>
            <span className="text-right">Points</span>
            <span className="text-right">Correct</span>
            <span className="text-right">Streak</span>
          </div>
          {leaderboard.map((p, i) => (
            <div key={p.id} className={`grid grid-cols-[auto_1fr_auto_auto_auto] gap-3 px-4 py-3 border-b border-gray-50 dark:border-white/5 last:border-0 items-center ${i < 3 ? 'bg-warning/5' : ''}`}>
              <span className={`text-sm font-bold w-6 ${
                i === 0 ? 'text-warning' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-amber-600' : 'text-gray-300 dark:text-white/30'
              }`}>
                {i + 1}
              </span>
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-full bg-gray-100 dark:bg-white/10 flex items-center justify-center shrink-0">
                  {p.avatar
                    ? <span className="text-sm leading-none">{p.avatar}</span>
                    : <span className="text-[10px] font-bold text-gray-400 dark:text-white/60">{p.nickname.charAt(0).toUpperCase()}</span>}
                </div>
                <span className="text-sm font-medium truncate">{p.nickname}</span>
              </div>
              <span className="text-sm font-bold tabular-nums text-right text-brand">{p.totalPoints || 0}</span>
              <span className="text-sm tabular-nums text-right text-gray-500 dark:text-white/50">
                {p.correctCount || 0}/{p.answeredCount || 0}
              </span>
              <span className="text-sm tabular-nums text-right text-gray-500 dark:text-white/50 flex items-center justify-end gap-1">
                {(p.streak || 0) > 0 && <Zap className="w-3 h-3 text-warning" />}
                {p.streak || 0}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Rounds Tab */}
      {tab === 'rounds' && (
        <div className="space-y-3">
          {roundStats.map((r) => (
            <div key={r.round} className="bg-white dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/10 p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-gray-400 dark:text-white/30 w-8">R{r.round}</span>
                  <span className="px-2 py-0.5 rounded-full bg-brand/10 text-brand text-[10px] font-bold">
                    {r.label}
                  </span>
                  <span className="font-mono font-bold text-gray-900 dark:text-white">{r.prompt}</span>
                  <span className="text-gray-300 dark:text-white/30">&rarr;</span>
                  <span className="font-mono font-bold text-success">{r.answer}</span>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1">
                    {r.accuracy >= 70 ? (
                      <CheckCircle2 className="w-4 h-4 text-success" />
                    ) : r.accuracy >= 40 ? (
                      <CheckCircle2 className="w-4 h-4 text-warning" />
                    ) : (
                      <XCircle className="w-4 h-4 text-danger" />
                    )}
                    <span className={`font-bold ${
                      r.accuracy >= 70 ? 'text-success' : r.accuracy >= 40 ? 'text-warning' : 'text-danger'
                    }`}>
                      {r.accuracy}%
                    </span>
                    <span className="text-gray-400 dark:text-white/40 text-xs">({r.correct}/{r.answered})</span>
                  </div>
                  <div className="flex items-center gap-1 text-gray-400 dark:text-white/40">
                    <Clock className="w-3.5 h-3.5" />
                    <span className="text-xs">{r.avgTime}s avg</span>
                  </div>
                </div>
              </div>
              <div className="w-full h-2 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    r.accuracy >= 70 ? 'bg-success' : r.accuracy >= 40 ? 'bg-warning' : 'bg-danger'
                  }`}
                  style={{ width: `${r.accuracy}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 mt-8">
        <button
          onClick={() => navigate(`/mini-game/${game.gameType}/host`)}
          className="btn-3d-cyan px-6 py-3 text-sm font-bold flex items-center gap-2"
        >
          <GameIcon className="w-4 h-4" />
          Play Again
        </button>
        <button
          onClick={() => navigate('/history')}
          className="btn-3d-ghost px-6 py-3 text-sm"
        >
          Back to History
        </button>
      </div>
    </div>
  );
}
