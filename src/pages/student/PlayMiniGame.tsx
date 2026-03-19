import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, functions } from '../../lib/firebase';
import { useToastStore } from '../../stores/toastStore';
import {
  Binary, Globe, Hash, Zap, Calculator, Code, Cpu,
  Trophy, CheckCircle2, XCircle, Clock,
} from 'lucide-react';
import type { MiniGame, MiniGamePlayer } from '../../types/models';
import type { GameModule } from '../../games/types';
import { getGameModule } from '../../games/registry';

const ICON_MAP: Record<string, typeof Binary> = { Binary, Globe, Hash, Zap, Calculator, Code, Cpu };

const MESH_BG: React.CSSProperties = {
  background: `
    radial-gradient(ellipse at 20% 0%, rgba(0,158,226,0.12) 0%, transparent 50%),
    radial-gradient(ellipse at 80% 0%, rgba(112,30,168,0.08) 0%, transparent 50%),
    radial-gradient(ellipse at 50% 100%, rgba(244,207,93,0.06) 0%, transparent 50%),
    linear-gradient(160deg, #080F1E 0%, #0F1729 40%, #080F1E 100%)
  `,
};

export default function PlayMiniGame() {
  const { miniGameId, playerId } = useParams<{ miniGameId: string; playerId: string }>();
  const navigate = useNavigate();
  const { addToast } = useToastStore();

  const [game, setGame] = useState<MiniGame | null>(null);
  const [player, setPlayer] = useState<MiniGamePlayer | null>(null);
  const [error, setError] = useState('');
  const [module, setModule] = useState<GameModule | null>(null);

  // Answer state
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    correct: boolean;
    pointsAwarded: number;
    correctAnswer: string;
    totalPoints: number;
    streak: number;
  } | null>(null);
  const [answered, setAnswered] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);

  const roundStartRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastRoundRef = useRef(-1);

  // Subscribe to game and player
  useEffect(() => {
    if (!miniGameId || !playerId) return;

    const unsub1 = onSnapshot(doc(db, 'mini_games', miniGameId), (snap) => {
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() } as MiniGame;
        setGame(data);

        // Look up module once we know the game type
        const mod = getGameModule(data.gameType);
        if (mod) {
          setModule(mod);
        } else {
          setError(`Unknown game type: ${data.gameType}`);
        }
      } else {
        setError('Game not found');
      }
    });

    const unsub2 = onSnapshot(doc(db, `mini_games/${miniGameId}/players`, playerId), (snap) => {
      if (snap.exists()) {
        setPlayer({ id: snap.id, ...snap.data() } as MiniGamePlayer);
      }
    });

    return () => {
      unsub1();
      unsub2();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [miniGameId, playerId]);

  // Reset state on new round
  useEffect(() => {
    if (!game || game.currentRoundIndex === lastRoundRef.current) return;
    lastRoundRef.current = game.currentRoundIndex;
    setAnswered(false);
    setFeedback(null);
    setSubmitting(false);
  }, [game?.currentRoundIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // Countdown timer (handles pause + extend)
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    if (!game || game.roundState !== 'live' || !game.roundStartedAt) {
      setTimeLeft(0);
      return;
    }

    const currentRound = game.rounds[game.currentRoundIndex];
    if (!currentRound) return;

    if (game.timerPaused) {
      const elapsed = (game.timerPausedAt! - game.roundStartedAt) / 1000;
      const totalTime = currentRound.timeLimitSec + (game.timerExtendedBy || 0);
      setTimeLeft(Math.max(0, totalTime - elapsed));
      return;
    }

    roundStartRef.current = game.roundStartedAt;
    const totalTime = currentRound.timeLimitSec + (game.timerExtendedBy || 0);

    const updateTimer = () => {
      const elapsed = (Date.now() - roundStartRef.current) / 1000;
      setTimeLeft(Math.max(0, totalTime - elapsed));
    };

    updateTimer();
    timerRef.current = setInterval(updateTimer, 100);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [game?.roundState, game?.roundStartedAt, game?.currentRoundIndex, game?.timerPaused, game?.timerExtendedBy]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = useCallback(async (submission: string) => {
    if (!game || !miniGameId || !playerId || answered || submitting) return;
    if (!submission) {
      addToast('warning', 'Enter your answer first');
      return;
    }

    const timeMs = game.roundStartedAt ? Date.now() - game.roundStartedAt : 0;

    setSubmitting(true);
    try {
      const fn = httpsCallable<Record<string, unknown>, {
        correct: boolean;
        pointsAwarded: number;
        correctAnswer: string;
        totalPoints: number;
        streak: number;
      }>(functions, 'submitMiniGameAnswer');

      const result = await fn({
        miniGameId,
        playerId,
        roundIndex: game.currentRoundIndex,
        submission,
        timeMs,
      });

      setFeedback(result.data);
      setAnswered(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to submit';
      if (msg.includes('Already answered')) {
        setAnswered(true);
      } else {
        addToast('error', msg);
      }
    } finally {
      setSubmitting(false);
    }
  }, [game, miniGameId, playerId, answered, submitting, addToast]);

  // Prevent accidental navigation
  useEffect(() => {
    if (!game || game.status === 'ended') return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [game]);

  // ═══════════ ERROR ═══════════
  if (error) {
    return (
      <div className="h-dvh flex items-center justify-center text-white overflow-hidden" style={MESH_BG}>
        <div className="text-center">
          <p className="text-lg text-danger mb-4">{error}</p>
          <button onClick={() => navigate('/join')} className="btn-3d-ghost">Back</button>
        </div>
      </div>
    );
  }

  // ═══════════ LOADING ═══════════
  if (!game || !player || !module) {
    return (
      <div className="h-dvh flex items-center justify-center text-white overflow-hidden" style={MESH_BG}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-3 border-brand/30 border-t-brand rounded-full animate-spin" />
          <p className="text-white/60 text-sm">Connecting...</p>
        </div>
      </div>
    );
  }

  const currentRound = game.currentRoundIndex >= 0 ? game.rounds[game.currentRoundIndex] : null;
  const IconComponent = ICON_MAP[module.metadata.icon] || Binary;
  const roundLabel = currentRound && module.getRoundLabel ? module.getRoundLabel(currentRound) : null;

  // ═══════════ LOBBY (waiting) ═══════════
  if (game.status === 'lobby') {
    return (
      <div className="h-dvh flex flex-col items-center justify-center text-white p-4 overflow-y-auto" style={MESH_BG}>
        <div className="text-center animate-fade-in">
          <div className="w-20 h-20 rounded-full bg-brand/20 flex items-center justify-center mx-auto mb-4">
            <IconComponent className="w-10 h-10 text-brand" />
          </div>
          <h1 className="text-2xl font-bold mb-2">{module.metadata.name}</h1>
          <p className="text-white/50 text-sm mb-6">Waiting for the host to start...</p>
          <div className="bg-white/[0.07] border border-white/12 rounded-2xl px-6 py-4 inline-block">
            <p className="text-sm text-white/40 mb-1">You joined as</p>
            <div className="flex items-center gap-2 justify-center">
              {player.avatar && <span className="text-2xl">{player.avatar}</span>}
              <span className="text-xl font-bold">{player.nickname}</span>
            </div>
          </div>
          <div className="mt-6 flex items-center gap-2 justify-center text-white/30">
            <Clock className="w-4 h-4 animate-pulse" />
            <span className="text-sm">Get ready...</span>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════ ENDED ═══════════
  if (game.status === 'ended') {
    const top10 = game.top10Snapshot || [];
    const myRank = top10.findIndex((e) => e.playerId === playerId);

    return (
      <div className="h-dvh flex flex-col items-center justify-center text-white p-4 overflow-y-auto" style={MESH_BG}>
        <div className="text-center mb-4 animate-fade-in">
          <div className="w-12 h-12 rounded-full bg-warning/20 flex items-center justify-center mx-auto mb-2">
            <Trophy className="w-6 h-6 text-warning" />
          </div>
          <h2 className="text-xl font-bold mb-1">Game Over!</h2>
          <p className="text-white/50 text-xs">
            {player.correctCount || 0}/{player.answeredCount || 0} correct
          </p>
        </div>

        {/* Your Score */}
        <div className="bg-white/[0.07] border border-white/12 rounded-2xl p-4 mb-4 text-center w-full max-w-sm">
          <span className="text-3xl font-bold text-brand">{player.totalPoints || 0}</span>
          <span className="text-sm text-white/30 ml-1">pts</span>
          {myRank >= 0 && (
            <span className="ml-2 text-sm text-warning font-bold">#{myRank + 1}</span>
          )}
        </div>

        {/* Top 10 */}
        {top10.length > 0 && (
          <div className="w-full max-w-sm bg-white/[0.07] border border-white/10 rounded-2xl overflow-hidden mb-6">
            <div className="px-4 py-3 border-b border-white/10">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Trophy className="w-4 h-4 text-warning" />
                Final Standings
              </h3>
            </div>
            {top10.map((entry, i) => (
              <div
                key={entry.playerId}
                className={`flex items-center gap-3 px-4 py-2.5 border-b border-white/5 last:border-0 ${
                  entry.playerId === playerId ? 'bg-brand/10' : ''
                }`}
              >
                <span className={`text-sm font-bold w-5 ${
                  i === 0 ? 'text-warning' : i < 3 ? 'text-white/60' : 'text-white/30'
                }`}>
                  {i + 1}
                </span>
                <span className="text-sm font-medium flex-1 truncate">
                  {entry.nickname}
                  {entry.playerId === playerId && <span className="text-brand ml-1">(you)</span>}
                </span>
                <span className="text-sm font-bold tabular-nums text-brand">{entry.totalPoints}</span>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={() => navigate('/join')}
          className="btn-3d-ghost px-6 py-3 text-base"
        >
          Play Again
        </button>
      </div>
    );
  }

  // ═══════════ LIVE GAME ═══════════
  if (!currentRound) return null;

  // Waiting between rounds
  if (game.roundState === 'waiting') {
    return (
      <div className="h-dvh flex flex-col items-center justify-center text-white p-4 overflow-y-auto" style={MESH_BG}>
        <div className="text-center animate-fade-in">
          <Clock className="w-10 h-10 text-brand mx-auto mb-4 animate-pulse" />
          <h2 className="text-xl font-bold mb-2">Get Ready!</h2>
          <p className="text-white/50 text-sm">Next round starting soon...</p>
        </div>
      </div>
    );
  }

  // Reveal state — show feedback or waiting
  if (game.roundState === 'reveal') {
    return (
      <div className="h-dvh flex flex-col items-center justify-center text-white p-4 overflow-y-auto" style={MESH_BG}>
        {feedback ? (
          <div className="text-center animate-fade-in w-full max-w-sm">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
              feedback.correct ? 'bg-success/20' : 'bg-danger/20'
            }`}>
              {feedback.correct
                ? <CheckCircle2 className="w-8 h-8 text-success" />
                : <XCircle className="w-8 h-8 text-danger" />}
            </div>
            <h2 className={`text-2xl font-bold mb-2 ${feedback.correct ? 'text-success' : 'text-danger'}`}>
              {feedback.correct ? 'Correct!' : 'Wrong!'}
            </h2>
            {!feedback.correct && (
              <p className="text-white/50 text-sm mb-2">
                Answer: <span className="font-mono font-bold text-white">{feedback.correctAnswer}</span>
              </p>
            )}
            <div className="flex items-center justify-center gap-4 mt-4">
              <div className="bg-white/[0.07] rounded-xl px-4 py-2 text-center">
                <p className="text-xs text-white/40">Points</p>
                <p className="text-xl font-bold text-brand">+{feedback.pointsAwarded}</p>
              </div>
              <div className="bg-white/[0.07] rounded-xl px-4 py-2 text-center">
                <p className="text-xs text-white/40">Total</p>
                <p className="text-xl font-bold">{feedback.totalPoints}</p>
              </div>
              {feedback.streak > 1 && (
                <div className="bg-warning/10 rounded-xl px-4 py-2 text-center">
                  <p className="text-xs text-warning/60">Streak</p>
                  <p className="text-xl font-bold text-warning flex items-center gap-1">
                    <Zap className="w-4 h-4" />{feedback.streak}
                  </p>
                </div>
              )}
            </div>
            <p className="text-white/30 text-sm mt-6">Waiting for next round...</p>
          </div>
        ) : answered ? (
          <div className="text-center animate-fade-in">
            <CheckCircle2 className="w-10 h-10 text-success mx-auto mb-4" />
            <p className="text-white/50">Answer submitted! Waiting...</p>
          </div>
        ) : (
          <div className="text-center animate-fade-in">
            <Clock className="w-10 h-10 text-white/30 mx-auto mb-4" />
            <p className="text-white/40">Time's up!</p>
            <p className="text-white/50 text-sm mt-2">
              Answer: <span className="font-mono font-bold text-white">{currentRound.answer}</span>
            </p>
          </div>
        )}
      </div>
    );
  }

  // ═══════════ ACTIVE ROUND ═══════════
  const PlayerInput = module.PlayerInput;
  const totalTimeSec = currentRound.timeLimitSec + (game.timerExtendedBy || 0);

  return (
    <div className="h-dvh flex flex-col text-white overflow-hidden" style={MESH_BG}>
      {/* Compact Header: round info + points + timer in one row */}
      <header className="flex items-center justify-between px-3 py-1.5 shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-white/50">{game.currentRoundIndex + 1}/{game.roundCount}</span>
          {roundLabel && (
            <span className="px-1.5 py-0.5 rounded-full bg-brand/10 text-brand text-[9px] font-bold">
              {roundLabel}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {player.streak > 1 && (
            <span className="flex items-center gap-0.5 text-warning text-xs font-bold">
              <Zap className="w-3 h-3" />{player.streak}
            </span>
          )}
          <span className="text-xs font-bold text-brand tabular-nums">{player.totalPoints || 0} pts</span>
          <div className={`text-lg font-bold tabular-nums px-2 py-0.5 rounded-full min-w-[3rem] text-center ${
            game.timerPaused ? 'bg-warning/20 text-warning' :
            timeLeft <= 5 ? 'bg-danger/20 text-danger animate-pulse' :
            'bg-white/10 text-white'
          }`}>
            {game.timerPaused ? '⏸' : `${Math.ceil(timeLeft)}s`}
          </div>
        </div>
      </header>

      {/* Timer Bar */}
      <div className="w-full h-1 bg-white/10 shrink-0">
        <div
          className={`h-full transition-all duration-100 ${
            game.timerPaused ? 'bg-warning' : timeLeft <= 5 ? 'bg-danger' : 'bg-brand'
          }`}
          style={{ width: `${totalTimeSec > 0 ? (timeLeft / totalTimeSec) * 100 : 0}%` }}
        />
      </div>

      {/* Main Content — fills remaining space, no scroll */}
      <main className="flex-1 flex flex-col items-center justify-center px-3 py-2 gap-2 min-h-0 overflow-y-auto">
        {/* Prompt — what the student needs to answer */}
        <div className="text-center shrink-0">
          <div className="text-2xl sm:text-4xl font-bold font-mono text-brand tracking-wider break-all leading-tight">
            {currentRound.prompt}
          </div>
        </div>

        {/* Player Input */}
        <div className="w-full shrink-0">
          <PlayerInput
            round={currentRound}
            onSubmit={handleSubmit}
            disabled={answered || submitting}
          />
        </div>

        {/* Feedback / Status */}
        {answered && !feedback && (
          <div className="flex items-center gap-2 text-success animate-fade-in shrink-0">
            <CheckCircle2 className="w-4 h-4" />
            <span className="text-xs font-medium">Submitted!</span>
          </div>
        )}

        {feedback && game.roundState === 'live' && (
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl animate-fade-in shrink-0 ${
            feedback.correct ? 'bg-success/20 border border-success/30' : 'bg-danger/20 border border-danger/30'
          }`}>
            {feedback.correct
              ? <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
              : <XCircle className="w-4 h-4 text-danger shrink-0" />}
            <span className={`text-sm font-bold ${feedback.correct ? 'text-success' : 'text-danger'}`}>
              {feedback.correct ? `+${feedback.pointsAwarded}` : 'Wrong'}
            </span>
            {!feedback.correct && (
              <span className="text-white/50 text-xs truncate">= <span className="font-mono font-bold text-white">{feedback.correctAnswer}</span></span>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
