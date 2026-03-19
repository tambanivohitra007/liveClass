import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, functions } from '../../lib/firebase';
import { useToastStore } from '../../stores/toastStore';
import {
  Binary, Trophy, CheckCircle2, XCircle, Clock, Zap, Hash,
} from 'lucide-react';
import type { BinaryGame, BinaryGamePlayer, BinaryConversionType } from '../../types/models';

const MESH_BG: React.CSSProperties = {
  background: `
    radial-gradient(ellipse at 20% 0%, rgba(0,158,226,0.12) 0%, transparent 50%),
    radial-gradient(ellipse at 80% 0%, rgba(112,30,168,0.08) 0%, transparent 50%),
    radial-gradient(ellipse at 50% 100%, rgba(244,207,93,0.06) 0%, transparent 50%),
    linear-gradient(160deg, #080F1E 0%, #0F1729 40%, #080F1E 100%)
  `,
};

const PLACE_VALUES_8 = [128, 64, 32, 16, 8, 4, 2, 1];
const PLACE_VALUES_4 = [8, 4, 2, 1];

const CONVERSION_LABELS: Record<BinaryConversionType, string> = {
  dec2bin: 'DEC → BIN',
  bin2dec: 'BIN → DEC',
  dec2hex: 'DEC → HEX',
  hex2dec: 'HEX → DEC',
  hex2bin: 'HEX → BIN',
  bin2hex: 'BIN → HEX',
};

export default function PlayBinaryGame() {
  const { binaryGameId, playerId } = useParams<{ binaryGameId: string; playerId: string }>();
  const navigate = useNavigate();
  const { addToast } = useToastStore();

  const [game, setGame] = useState<BinaryGame | null>(null);
  const [player, setPlayer] = useState<BinaryGamePlayer | null>(null);
  const [error, setError] = useState('');

  // Answer state
  const [bits, setBits] = useState<number[]>([]);
  const [textInput, setTextInput] = useState('');
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
    if (!binaryGameId || !playerId) return;

    const unsub1 = onSnapshot(doc(db, 'binary_games', binaryGameId), (snap) => {
      if (snap.exists()) {
        setGame({ id: snap.id, ...snap.data() } as BinaryGame);
      } else {
        setError('Game not found');
      }
    });

    const unsub2 = onSnapshot(doc(db, `binary_games/${binaryGameId}/players`, playerId), (snap) => {
      if (snap.exists()) {
        setPlayer({ id: snap.id, ...snap.data() } as BinaryGamePlayer);
      }
    });

    return () => {
      unsub1();
      unsub2();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [binaryGameId, playerId]);

  // Reset state on new round
  useEffect(() => {
    if (!game || game.currentRoundIndex === lastRoundRef.current) return;
    lastRoundRef.current = game.currentRoundIndex;
    setAnswered(false);
    setFeedback(null);
    setTextInput('');
    setSubmitting(false);

    const round = game.rounds[game.currentRoundIndex];
    if (round) {
      const bitCount = round.bits;
      setBits(new Array(bitCount).fill(0));
    }
  }, [game?.currentRoundIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // Countdown timer (handles pause + extend)
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    if (!game || game.roundState !== 'live' || !game.roundStartedAt) {
      setTimeLeft(0);
      return;
    }

    if (game.timerPaused) {
      const elapsed = (game.timerPausedAt! - game.roundStartedAt) / 1000;
      const totalTime = game.rounds[game.currentRoundIndex].timeLimitSec + (game.timerExtendedBy || 0);
      setTimeLeft(Math.max(0, totalTime - elapsed));
      return;
    }

    roundStartRef.current = game.roundStartedAt;
    const round = game.rounds[game.currentRoundIndex];
    const totalTime = round.timeLimitSec + (game.timerExtendedBy || 0);

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

  const toggleBit = useCallback((index: number) => {
    if (answered || submitting) return;
    setBits((prev) => {
      const next = [...prev];
      next[index] = next[index] === 0 ? 1 : 0;
      return next;
    });
  }, [answered, submitting]);

  const getSubmission = (): string => {
    if (!game) return '';
    const round = game.rounds[game.currentRoundIndex];
    const answerType = round.type.split('2')[1]; // bin, dec, or hex

    if (answerType === 'bin') {
      return bits.join('');
    }
    return textInput.trim().toUpperCase();
  };

  const handleSubmit = async () => {
    if (!game || !binaryGameId || !playerId || answered || submitting) return;
    const submission = getSubmission();
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
      }>(functions, 'submitBinaryAnswer');

      const result = await fn({
        binaryGameId,
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
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!game || game.roundState !== 'live' || answered || submitting) return;

      if (e.code === 'Enter') {
        e.preventDefault();
        handleSubmit();
        return;
      }

      // Number keys to toggle bits
      const round = game.rounds[game.currentRoundIndex];
      const answerType = round?.type.split('2')[1];
      if (answerType === 'bin') {
        const bitCount = round.bits;
        const num = parseInt(e.key);
        if (!isNaN(num) && num >= 1 && num <= bitCount) {
          toggleBit(num - 1);
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [game, answered, submitting, toggleBit]); // eslint-disable-line react-hooks/exhaustive-deps

  // Prevent accidental navigation
  useEffect(() => {
    if (!game || game.status === 'ended') return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [game]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white" style={MESH_BG}>
        <div className="text-center">
          <p className="text-lg text-danger mb-4">{error}</p>
          <button onClick={() => navigate('/join')} className="btn-3d-ghost">Back</button>
        </div>
      </div>
    );
  }

  if (!game || !player) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white" style={MESH_BG}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-3 border-brand/30 border-t-brand rounded-full animate-spin" />
          <p className="text-white/60 text-sm">Connecting...</p>
        </div>
      </div>
    );
  }

  const currentRound = game.currentRoundIndex >= 0 ? game.rounds[game.currentRoundIndex] : null;
  const answerType = currentRound?.type.split('2')[1]; // bin, dec, hex
  const placeValues = currentRound?.bits === 4 ? PLACE_VALUES_4 : PLACE_VALUES_8;
  const binaryDecimalValue = bits.reduce((sum, b, i) => sum + b * placeValues[i], 0);

  // ═══════════ LOBBY (waiting) ═══════════
  if (game.status === 'lobby') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-white p-4" style={MESH_BG}>
        <div className="text-center animate-fade-in">
          <div className="w-20 h-20 rounded-full bg-brand/20 flex items-center justify-center mx-auto mb-4">
            <Binary className="w-10 h-10 text-brand" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Binary Challenge</h1>
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
      <div className="min-h-screen flex flex-col items-center justify-center text-white p-4" style={MESH_BG}>
        <div className="text-center mb-8 animate-fade-in">
          <div className="w-16 h-16 rounded-full bg-warning/20 flex items-center justify-center mx-auto mb-4">
            <Trophy className="w-8 h-8 text-warning" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Game Over!</h2>
          <p className="text-white/50 text-sm">
            {player.correctCount || 0} / {player.answeredCount || 0} correct
          </p>
        </div>

        {/* Your Score */}
        <div className="bg-white/[0.07] border border-white/12 rounded-2xl p-6 mb-6 text-center w-full max-w-sm">
          <p className="text-xs font-bold text-white/40 uppercase tracking-wider mb-2">Your Score</p>
          <span className="text-4xl font-bold text-brand">{player.totalPoints || 0}</span>
          <span className="text-lg text-white/30 ml-2">pts</span>
          {myRank >= 0 && (
            <p className="mt-2 text-sm text-warning font-bold">#{myRank + 1} on leaderboard</p>
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
      <div className="min-h-screen flex flex-col items-center justify-center text-white p-4" style={MESH_BG}>
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
      <div className="min-h-screen flex flex-col items-center justify-center text-white p-4" style={MESH_BG}>
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
  return (
    <div className="min-h-screen flex flex-col text-white" style={MESH_BG}>
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 shrink-0">
        <div className="flex items-center gap-2">
          <Hash className="w-4 h-4 text-brand" />
          <span className="text-sm font-bold">Round {game.currentRoundIndex + 1}/{game.roundCount}</span>
          <span className="px-2 py-0.5 rounded-full bg-brand/10 text-brand text-[10px] font-bold">
            {CONVERSION_LABELS[currentRound.type]}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {player.streak > 1 && (
            <span className="flex items-center gap-1 text-warning text-sm font-bold">
              <Zap className="w-3.5 h-3.5" />{player.streak}
            </span>
          )}
          <span className="text-sm font-bold text-brand tabular-nums">{player.totalPoints || 0} pts</span>
        </div>
      </header>

      {/* Big Timer */}
      <div className="flex flex-col items-center py-2 shrink-0">
        <div className={`text-7xl sm:text-8xl font-bold tabular-nums leading-none ${
          game.timerPaused ? 'text-warning' :
          timeLeft <= 5 ? 'text-danger animate-pulse' :
          timeLeft <= 10 ? 'text-warning' : 'text-white'
        }`}>
          {Math.ceil(timeLeft)}
        </div>
        <span className={`text-xs font-bold uppercase tracking-widest mt-1 ${
          game.timerPaused ? 'text-warning' : 'text-white/30'
        }`}>
          {game.timerPaused ? 'Paused' : 'seconds'}
        </span>
      </div>

      {/* Timer Bar */}
      <div className="w-full h-1.5 bg-white/10 shrink-0">
        <div
          className={`h-full transition-all duration-100 ${
            game.timerPaused ? 'bg-warning' : timeLeft <= 5 ? 'bg-danger' : 'bg-brand'
          }`}
          style={{ width: `${(currentRound.timeLimitSec + (game.timerExtendedBy || 0)) > 0 ? (timeLeft / (currentRound.timeLimitSec + (game.timerExtendedBy || 0))) * 100 : 0}%` }}
        />
      </div>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-4 gap-4">
        {/* Prompt */}
        <div className="text-center">
          <p className="text-xs font-bold text-white/40 uppercase tracking-wider mb-1">
            Convert to {answerType === 'bin' ? 'Binary' : answerType === 'dec' ? 'Decimal' : 'Hexadecimal'}
          </p>
          <div className="text-4xl sm:text-5xl font-bold font-mono text-brand tracking-wider">
            {currentRound.prompt}
          </div>
        </div>

        {/* Answer Input */}
        {answerType === 'bin' ? (
          // ── BIT TOGGLE UI ──
          <div className="w-full max-w-lg">
            {/* Place values */}
            <div className={`grid gap-2 sm:gap-3 mb-2 ${currentRound.bits === 8 ? 'grid-cols-8' : 'grid-cols-4'}`}>
              {placeValues.map((v, i) => (
                <div key={i} className="text-center text-[10px] sm:text-xs font-bold text-white/30">
                  {v}
                </div>
              ))}
            </div>

            {/* Bit toggles */}
            <div className={`grid gap-2 sm:gap-3 ${currentRound.bits === 8 ? 'grid-cols-8' : 'grid-cols-4'}`}>
              {bits.map((b, i) => (
                <button
                  key={i}
                  onClick={() => toggleBit(i)}
                  disabled={answered || submitting}
                  className={`aspect-square rounded-xl sm:rounded-2xl text-xl sm:text-3xl font-bold transition-all active:scale-95 disabled:opacity-50 ${
                    b === 1
                      ? 'bg-brand text-white shadow-lg shadow-brand/30 scale-105'
                      : 'bg-white/10 text-white/30 hover:bg-white/20'
                  }`}
                >
                  {b}
                </button>
              ))}
            </div>

            {/* Current decimal value */}
            <div className="text-center mt-3">
              <span className="text-xs text-white/40">= </span>
              <span className="text-sm font-bold tabular-nums text-white/60">{binaryDecimalValue}</span>
              <span className="text-xs text-white/40"> in decimal</span>
            </div>
          </div>
        ) : (
          // ── TEXT INPUT (decimal or hex) ──
          <div className="w-full max-w-sm">
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              disabled={answered || submitting}
              placeholder={answerType === 'dec' ? 'Enter decimal...' : 'Enter hex (e.g. 2A)...'}
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
              className="w-full bg-white/10 border-2 border-white/20 rounded-2xl px-6 py-4 text-center text-3xl font-bold font-mono text-white placeholder-white/20 focus:outline-none focus:border-brand transition-colors disabled:opacity-50"
            />
          </div>
        )}

        {/* Submit Button */}
        {!answered && (
          <button
            onClick={handleSubmit}
            disabled={submitting || (!textInput.trim() && answerType !== 'bin')}
            className="btn-3d-cyan px-10 py-3 text-lg font-bold flex items-center gap-2 disabled:opacity-50"
          >
            {submitting ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <CheckCircle2 className="w-5 h-5" />
                Submit
              </>
            )}
          </button>
        )}

        {/* Already answered indicator */}
        {answered && !feedback && (
          <div className="flex items-center gap-2 text-success animate-fade-in">
            <CheckCircle2 className="w-5 h-5" />
            <span className="text-sm font-medium">Submitted! Waiting for results...</span>
          </div>
        )}

        {/* Inline feedback (while round is still live) */}
        {feedback && game.roundState === 'live' && (
          <div className={`flex items-center gap-3 px-5 py-3 rounded-2xl animate-fade-in ${
            feedback.correct ? 'bg-success/20 border border-success/30' : 'bg-danger/20 border border-danger/30'
          }`}>
            {feedback.correct
              ? <CheckCircle2 className="w-5 h-5 text-success" />
              : <XCircle className="w-5 h-5 text-danger" />}
            <span className={`font-bold ${feedback.correct ? 'text-success' : 'text-danger'}`}>
              {feedback.correct ? `+${feedback.pointsAwarded} pts` : 'Wrong!'}
            </span>
            {!feedback.correct && (
              <span className="text-white/50 text-sm">Answer: <span className="font-mono font-bold text-white">{feedback.correctAnswer}</span></span>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
