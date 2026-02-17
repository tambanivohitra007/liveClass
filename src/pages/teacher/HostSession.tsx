import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { doc, onSnapshot, collection, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { db, functions } from '../../lib/firebase';
import { useSessionStore } from '../../stores/sessionStore';
import Leaderboard from '../../components/Leaderboard';
import { ShieldAlert, Users, Shuffle, Music, Volume2, VolumeX, Pause, Play, SkipForward } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { startLobbyMusic, stopLobbyMusic, playJoin, isMuted, setMuted as setSoundMuted, MUSIC_TRACKS, setLobbyTrack, getLobbyTrack } from '../../lib/sounds';
import type { Session, SessionPlayer, Question, ViolationDoc } from '../../types/models';
import { TEAM_PRESETS } from '../../types/models';

export default function HostSession() {
  const { quizId } = useParams<{ quizId: string }>();
  const { session, setSession, players, setPlayers } = useSessionStore();
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [currentQuestionText, setCurrentQuestionText] = useState('');
  const [currentTimeLimitSec, setCurrentTimeLimitSec] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [error, setError] = useState('');
  const [violations, setViolations] = useState<Map<string, ViolationDoc>>(new Map());
  const [muted, setMutedState] = useState(isMuted());
  const [lobbyTrack, setLobbyTrackState] = useState(getLobbyTrack());
  const prevPlayerCountRef = useRef(0);
  const navigate = useNavigate();

  useEffect(() => {
    if (!quizId) return;
    const loadQuestionCount = async () => {
      const q = query(collection(db, 'questions'), where('quizId', '==', quizId));
      setTotalQuestions((await getDocs(q)).size);
    };
    loadQuestionCount();
  }, [quizId]);

  const createSession = async () => {
    if (!quizId) return;
    try {
      const fn = httpsCallable<{ quizId: string }, { sessionId: string }>(functions, 'createSession');
      const result = await fn({ quizId });
      subscribeToSession(result.data.sessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session');
    }
  };

  const subscribeToSession = (sessionId: string) => {
    onSnapshot(doc(db, 'sessions', sessionId), (snap) => {
      if (snap.exists()) setSession({ id: snap.id, ...snap.data() } as Session);
    });
    onSnapshot(collection(db, `sessions/${sessionId}/players`), (snap) => {
      setPlayers(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as SessionPlayer[]);
    });
    onSnapshot(collection(db, `sessions/${sessionId}/violations`), (snap) => {
      const map = new Map<string, ViolationDoc>();
      snap.docs.forEach((d) => map.set(d.id, d.data() as ViolationDoc));
      setViolations(map);
    });
  };

  useEffect(() => {
    if (!session || session.questionState !== 'live') return;
    const loadCurrentQuestion = async () => {
      const q = query(collection(db, 'questions'), where('quizId', '==', session.quizId));
      const snapshot = await getDocs(q);
      const questions = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Question[];
      const qIdx = session.questionOrder
        ? session.questionOrder[session.currentQuestionIndex]
        : session.currentQuestionIndex;
      const current = questions[qIdx];
      setCurrentQuestionText(current?.text || '');
      if (current?.timeLimitSec) {
        setCurrentTimeLimitSec(current.timeLimitSec);
        // Calculate remaining time from server timestamp to survive refreshes
        const startedAt = session.questionStartedAt as any;
        const startMs = startedAt?.toMillis ? startedAt.toMillis() : (typeof startedAt === 'number' ? startedAt : 0);
        if (startMs > 0) {
          const now = session.timerPaused && session.timerPausedAt
            ? (typeof session.timerPausedAt === 'number' ? session.timerPausedAt : Date.now())
            : Date.now();
          const elapsed = Math.floor((now - startMs) / 1000);
          setTimeLeft(Math.max(0, current.timeLimitSec - elapsed));
        } else {
          setTimeLeft(current.timeLimitSec);
        }
      }
    };
    loadCurrentQuestion();
  }, [session?.currentQuestionIndex, session?.questionState]);

  // Countdown timer — auto-ends question when time runs out
  const autoEndCalledRef = useRef(false);
  useEffect(() => {
    if (!session || session.questionState !== 'live') {
      autoEndCalledRef.current = false;
      return;
    }
    if (timeLeft <= 0 || session.timerPaused) return;
    const timer = setInterval(() => setTimeLeft((t) => Math.max(0, t - 1)), 1000);
    return () => clearInterval(timer);
  }, [session?.questionState, timeLeft, session?.timerPaused]);

  useEffect(() => {
    if (!session || session.questionState !== 'live' || session.timerPaused) return;
    if (timeLeft <= 0 && currentTimeLimitSec > 0 && !autoEndCalledRef.current) {
      autoEndCalledRef.current = true;
      httpsCallable(functions, 'endQuestion')({ sessionId: session.id });
    }
  }, [timeLeft, session?.questionState, currentTimeLimitSec, session?.timerPaused]);

  const startQuestion = async () => {
    if (!session) return;
    await httpsCallable(functions, 'startQuestion')({ sessionId: session.id, qIndex: session.currentQuestionIndex });
  };

  const nextQuestion = async () => {
    if (!session) return;
    await httpsCallable(functions, 'startQuestion')({ sessionId: session.id, qIndex: session.currentQuestionIndex + 1 });
  };

  const endQuestion = async () => {
    if (!session) return;
    await httpsCallable(functions, 'endQuestion')({ sessionId: session.id });
  };

  const togglePause = async () => {
    if (!session) return;
    if (session.timerPaused) {
      const newStartedAt = Date.now() - (currentTimeLimitSec - timeLeft) * 1000;
      await updateDoc(doc(db, 'sessions', session.id), {
        timerPaused: false,
        timerPausedAt: null,
        questionStartedAt: newStartedAt,
      });
    } else {
      await updateDoc(doc(db, 'sessions', session.id), {
        timerPaused: true,
        timerPausedAt: Date.now(),
      });
    }
  };

  const extendTimer = async () => {
    if (!session) return;
    const startedAt = session.questionStartedAt as any;
    const startMs = startedAt?.toMillis ? startedAt.toMillis() : (typeof startedAt === 'number' ? startedAt : 0);
    if (startMs > 0) {
      await updateDoc(doc(db, 'sessions', session.id), { questionStartedAt: startMs + 30000 });
      setTimeLeft((t) => t + 30);
    }
  };

  const skipQuestion = async () => {
    if (!session) return;
    await httpsCallable(functions, 'endQuestion')({ sessionId: session.id });
    if (session.currentQuestionIndex < totalQuestions - 1) {
      await httpsCallable(functions, 'startQuestion')({ sessionId: session.id, qIndex: session.currentQuestionIndex + 1 });
    }
  };

  useEffect(() => { createSession(); }, [quizId]);

  if (error) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <p className="text-danger mb-4">{error}</p>
        <button onClick={() => navigate('/dashboard')} className="text-brand underline">Back to Dashboard</button>
      </div>
    </div>
  );

  const isLastQuestion = session ? session.currentQuestionIndex >= totalQuestions - 1 : false;

  // Keyboard shortcuts: Space to advance
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || !session) return;
      e.preventDefault();
      if (session.status === 'lobby' && players.length > 0) startQuestion();
      else if (session.questionState === 'live') endQuestion();
      else if (session.questionState === 'reveal' && session.currentQuestionIndex < totalQuestions - 1) nextQuestion();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  // Lobby music
  useEffect(() => {
    if (session?.status === 'lobby' && !muted) startLobbyMusic();
    else stopLobbyMusic();
    return () => stopLobbyMusic();
  }, [session?.status, muted]);

  // Join chime
  useEffect(() => {
    if (players.length > prevPlayerCountRef.current && prevPlayerCountRef.current > 0) playJoin();
    prevPlayerCountRef.current = players.length;
  }, [players.length]);

  const toggleMute = () => {
    const next = !muted;
    setSoundMuted(next);
    setMutedState(next);
  };

  if (!session) return (
    <div className="min-h-screen bg-surface-dark flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-brand/30 border-t-brand rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-surface-dark text-white relative overflow-hidden">
      {/* Geometric background — lobby only */}
      {session.status === 'lobby' && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
          <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full border border-white/[0.04] animate-float" />
          <div className="absolute -top-16 -right-16 w-72 h-72 rounded-full border border-brand/10" style={{ animationDelay: '1s', animation: 'float 6s ease-in-out infinite 1s' }} />
          <div className="absolute top-1/3 -left-8 w-40 h-40 border border-accent/10 rotate-45" style={{ animation: 'float 5s ease-in-out infinite 0.5s' }} />
          <div className="absolute top-[15%] left-[20%] w-6 h-6 border border-white/[0.06] rotate-12" style={{ animation: 'float 4s ease-in-out infinite 0.2s' }} />
          <div className="absolute top-[70%] left-[15%] w-10 h-10 border border-brand/[0.08] rotate-45" style={{ animation: 'float 7s ease-in-out infinite 2s' }} />
          <div className="absolute top-[25%] right-[10%] w-8 h-8 border border-accent/[0.08] -rotate-12" style={{ animation: 'float 5.5s ease-in-out infinite 1.5s' }} />
          <div className="absolute bottom-[10%] right-[18%] w-0 h-0" style={{ borderLeft: '30px solid transparent', borderRight: '30px solid transparent', borderBottom: '52px solid rgba(212,86,107,0.06)', animation: 'float 6s ease-in-out infinite 0.8s' }} />
          <div className="absolute -bottom-20 -left-20 w-80 h-80 rounded-full border-2 border-white/[0.03]" style={{ animation: 'float 8s ease-in-out infinite 3s' }} />
          <svg className="absolute top-[45%] right-[5%] w-32 h-32 opacity-[0.04]">
            {Array.from({ length: 25 }).map((_, i) => (
              <circle key={i} cx={(i % 5) * 30 + 10} cy={Math.floor(i / 5) * 30 + 10} r="2" fill="white" />
            ))}
          </svg>
          <svg className="absolute top-[8%] left-[8%] w-20 h-20 opacity-[0.06]" viewBox="0 0 100 100" style={{ animation: 'float 7s ease-in-out infinite 2.5s' }}>
            <polygon points="50,2 93,25 93,75 50,98 7,75 7,25" fill="none" stroke="white" strokeWidth="2" />
          </svg>
          <svg className="absolute bottom-[25%] left-[35%] w-10 h-10 opacity-[0.05]" viewBox="0 0 40 40" style={{ animation: 'float 5s ease-in-out infinite 1.2s' }}>
            <line x1="20" y1="5" x2="20" y2="35" stroke="white" strokeWidth="2" />
            <line x1="5" y1="20" x2="35" y2="20" stroke="white" strokeWidth="2" />
          </svg>
        </div>
      )}

      {/* Top Bar */}
      <div className="flex items-center justify-between px-6 py-3.5 bg-white/[0.03] border-b border-white/[0.06] backdrop-blur-sm">
        <span className="font-bold text-lg tracking-tight">LiveClass</span>
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-white/[0.06] rounded-full text-sm">
            <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            <span className="text-white/60 font-medium">{players.length} player{players.length !== 1 && 's'}</span>
          </div>
          <span className="px-2.5 py-1 rounded-full bg-white/[0.06] text-white/40 text-xs capitalize font-medium">{session.questionState}</span>
          <button onClick={toggleMute} className="p-2 rounded-xl hover:bg-white/10 transition-colors text-white/40 hover:text-white/70">
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">

        {/* ═══════════════ LOBBY ═══════════════ */}
        {session.status === 'lobby' && (
          <>
            {/* Hero Card: PIN + QR side-by-side */}
            <div className="flex justify-center mb-10 animate-bounce-in">
              <div className="inline-flex flex-col md:flex-row items-center gap-8 bg-white/[0.05] backdrop-blur-sm rounded-3xl p-8 md:p-10 border border-white/[0.08] shadow-2xl">
                {/* PIN */}
                <div className="text-center">
                  <p className="text-white/40 text-[11px] uppercase tracking-[0.2em] font-medium mb-3">Game PIN</p>
                  <div className="bg-white text-surface-dark rounded-2xl px-10 py-5 shadow-xl animate-pulse-glow">
                    <span className="text-5xl md:text-6xl font-black tracking-[0.3em]">{session.pinCode}</span>
                  </div>
                  <p className="text-white/20 text-xs mt-3">Share this PIN with your students</p>
                </div>

                {/* Divider — vertical on desktop, horizontal on mobile */}
                <div className="hidden md:flex flex-col items-center gap-3 self-stretch justify-center py-2">
                  <div className="flex-1 w-px bg-gradient-to-b from-transparent via-white/15 to-transparent" />
                  <span className="text-[10px] uppercase tracking-[0.15em] text-white/25 font-medium">or</span>
                  <div className="flex-1 w-px bg-gradient-to-b from-transparent via-white/15 to-transparent" />
                </div>
                <div className="flex md:hidden items-center gap-4 w-full">
                  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
                  <span className="text-[10px] uppercase tracking-[0.15em] text-white/25 font-medium">or</span>
                  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
                </div>

                {/* QR Code */}
                <div className="text-center">
                  <p className="text-white/40 text-[11px] uppercase tracking-[0.2em] font-medium mb-3">Scan to Join</p>
                  <div className="bg-white rounded-2xl p-3.5 shadow-xl">
                    <QRCodeSVG
                      value={`${window.location.origin}/join?pin=${session.pinCode}`}
                      size={140}
                      level="M"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Settings Row */}
            <div className="flex flex-wrap items-center justify-center gap-2 mb-8 animate-fade-in">
              {/* Anti-Cheat */}
              <div className="flex items-center gap-2 px-3.5 py-2 bg-white/[0.04] rounded-xl border border-white/[0.06]">
                <ShieldAlert className={`w-3.5 h-3.5 ${session.antiCheatEnabled !== false ? 'text-success' : 'text-white/25'}`} />
                <span className="text-xs text-white/50">Anti-Cheat</span>
                <button
                  onClick={async () => {
                    const newVal = session.antiCheatEnabled === false;
                    await updateDoc(doc(db, 'sessions', session.id), { antiCheatEnabled: newVal });
                  }}
                  className={`relative w-11 h-6 rounded-full transition-colors ${session.antiCheatEnabled !== false ? 'bg-success' : 'bg-white/20'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${session.antiCheatEnabled !== false ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>

              {/* Teams */}
              <div className="flex items-center gap-2 px-3.5 py-2 bg-white/[0.04] rounded-xl border border-white/[0.06]">
                <Users className={`w-3.5 h-3.5 ${session.teamMode ? 'text-info' : 'text-white/25'}`} />
                <span className="text-xs text-white/50">Teams</span>
                <button
                  onClick={async () => {
                    const newVal = !session.teamMode;
                    const teamCount = session.teamCount || 2;
                    await updateDoc(doc(db, 'sessions', session.id), {
                      teamMode: newVal,
                      teamCount,
                      teams: TEAM_PRESETS.slice(0, teamCount),
                    });
                  }}
                  className={`relative w-11 h-6 rounded-full transition-colors ${session.teamMode ? 'bg-info' : 'bg-white/20'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${session.teamMode ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
                {session.teamMode && (
                  <select
                    value={session.teamCount || 2}
                    onChange={async (e) => {
                      const count = parseInt(e.target.value);
                      await updateDoc(doc(db, 'sessions', session.id), {
                        teamCount: count,
                        teams: TEAM_PRESETS.slice(0, count),
                      });
                    }}
                    className="ml-1 px-2 py-1 bg-white/10 text-white text-sm rounded-lg border border-white/20 outline-none"
                  >
                    {[2, 3, 4, 5, 6].map((n) => (
                      <option key={n} value={n} className="bg-gray-800">{n} teams</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Shuffle */}
              <div className="flex items-center gap-2 px-3.5 py-2 bg-white/[0.04] rounded-xl border border-white/[0.06]">
                <Shuffle className={`w-3.5 h-3.5 ${session.shuffleQuestions ? 'text-warning' : 'text-white/25'}`} />
                <span className="text-xs text-white/50">Shuffle</span>
                <button
                  onClick={async () => {
                    await updateDoc(doc(db, 'sessions', session.id), { shuffleQuestions: !session.shuffleQuestions });
                  }}
                  className={`relative w-11 h-6 rounded-full transition-colors ${session.shuffleQuestions ? 'bg-warning' : 'bg-white/20'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${session.shuffleQuestions ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>

              {/* Music */}
              <div className="flex items-center gap-2 px-3.5 py-2 bg-white/[0.04] rounded-xl border border-white/[0.06]">
                <Music className="w-3.5 h-3.5 text-white/25" />
                <select
                  value={lobbyTrack}
                  onChange={(e) => {
                    setLobbyTrackState(e.target.value);
                    setLobbyTrack(e.target.value);
                  }}
                  className="px-2 py-1 bg-white/10 text-white text-sm rounded-lg border border-white/20 outline-none"
                >
                  {Object.entries(MUSIC_TRACKS).map(([key, track]) => (
                    <option key={key} value={key} className="bg-gray-800">{track.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Players Panel */}
            <div className="bg-white/[0.03] rounded-2xl border border-white/[0.06] p-6 mb-8 animate-fade-in">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs text-white/40 uppercase tracking-[0.15em] font-medium">Players</h3>
                <span className="text-xs text-white/30 bg-white/[0.06] px-2.5 py-1 rounded-full font-medium tabular-nums">
                  {players.length} joined
                </span>
              </div>

              {session.teamMode && session.teams ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {session.teams.map((team, ti) => {
                    const teamPlayers = players.filter((p) => p.teamIndex === ti);
                    return (
                      <div key={ti} className="bg-white/[0.04] rounded-xl p-4 border border-white/[0.05]">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: team.color }} />
                          <span className="text-sm font-bold">{team.name}</span>
                          <span className="text-xs text-white/30">({teamPlayers.length})</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {teamPlayers.map((p) => {
                            const v = violations.get(p.id);
                            return (
                              <span key={p.id} className="px-2.5 py-1 rounded-lg text-xs font-medium animate-fade-in inline-flex items-center gap-1" style={{ backgroundColor: team.color + '20' }}>
                                {p.nickname}
                                {v && v.totalViolations > 0 && (
                                  <span className="inline-flex items-center gap-0.5 px-1 py-0.5 bg-danger/20 text-danger rounded-full text-[10px] font-bold">
                                    <ShieldAlert className="w-2.5 h-2.5" />
                                    {v.totalViolations}
                                  </span>
                                )}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {players.map((p) => {
                    const v = violations.get(p.id);
                    return (
                      <span key={p.id} className="px-3 py-1.5 bg-white/[0.06] backdrop-blur rounded-lg text-sm font-medium animate-fade-in inline-flex items-center gap-1.5 border border-white/[0.05]">
                        {p.nickname}
                        {v && v.totalViolations > 0 && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-danger/20 text-danger rounded-full text-xs font-bold" title={`${v.totalViolations} violation(s)`}>
                            <ShieldAlert className="w-3 h-3" />
                            {v.totalViolations}
                          </span>
                        )}
                      </span>
                    );
                  })}
                </div>
              )}

              {players.length === 0 && (
                <div className="text-center py-8">
                  <div className="w-8 h-8 border-[3px] border-white/10 border-t-white/30 rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-white/25 text-sm">Waiting for players to join...</p>
                </div>
              )}
            </div>

            {/* Start Button */}
            <div className="flex justify-center">
              <button
                onClick={startQuestion}
                disabled={players.length === 0}
                className="px-10 py-4 bg-success text-white font-bold text-lg rounded-2xl hover:brightness-110 transition-all disabled:opacity-30 shadow-lg shadow-success/20"
              >
                Start Game
              </button>
            </div>
          </>
        )}

        {/* ═══════════════ LIVE QUESTION ═══════════════ */}
        {session.questionState === 'live' && (
          <>
            <div className="text-center mb-10 animate-fade-in">
              {/* Question counter pill */}
              <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-white/[0.06] rounded-full mb-6">
                <span className="text-xs text-white/40 uppercase tracking-wider">Question</span>
                <span className="text-sm font-bold text-white/70">
                  {session.currentQuestionIndex + 1}
                  <span className="text-white/30 font-normal mx-1">/</span>
                  {totalQuestions}
                </span>
              </div>

              <h2 className="text-2xl md:text-4xl font-bold mb-8 max-w-3xl mx-auto leading-tight">{currentQuestionText}</h2>

              {/* Timer */}
              {currentTimeLimitSec > 0 && (
                <div className={`inline-flex items-baseline gap-1.5 px-6 py-3 rounded-2xl transition-colors ${
                  session.timerPaused ? 'bg-warning/15 ring-1 ring-warning/20' :
                  timeLeft <= 5 ? 'bg-danger/15 ring-1 ring-danger/20' : 'bg-white/[0.05]'
                }`}>
                  <span className={`text-5xl font-black tabular-nums ${
                    session.timerPaused ? 'text-warning' :
                    timeLeft <= 5 ? 'text-danger animate-timer-pulse' : 'text-white'
                  }`}>{timeLeft}</span>
                  <span className={`text-sm font-medium ${
                    session.timerPaused ? 'text-warning/70' :
                    timeLeft <= 5 ? 'text-danger/60' : 'text-white/30'
                  }`}>{session.timerPaused ? 'PAUSED' : 'sec'}</span>
                </div>
              )}
            </div>

            {/* Control Toolbar */}
            <div className="flex items-center justify-center gap-3">
              <div className="inline-flex items-center gap-1 bg-white/[0.05] rounded-2xl p-1.5 border border-white/[0.08]">
                <button
                  onClick={togglePause}
                  className="p-3 rounded-xl hover:bg-white/10 transition-colors text-white/60 hover:text-white"
                  title={session.timerPaused ? 'Resume timer' : 'Pause timer'}
                >
                  {session.timerPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                </button>
                <button
                  onClick={extendTimer}
                  className="px-3.5 py-2.5 rounded-xl hover:bg-white/10 transition-colors text-white/60 hover:text-white text-sm font-bold"
                  title="Add 30 seconds"
                >
                  +30s
                </button>
                {!isLastQuestion && (
                  <button
                    onClick={skipQuestion}
                    className="p-3 rounded-xl hover:bg-white/10 transition-colors text-white/60 hover:text-white"
                    title="Skip to next question"
                  >
                    <SkipForward className="w-4 h-4" />
                  </button>
                )}
              </div>
              <button
                onClick={endQuestion}
                className="px-8 py-3.5 bg-danger text-white font-bold text-lg rounded-2xl hover:brightness-110 transition-all shadow-lg shadow-danger/20"
              >
                End Question
              </button>
            </div>
          </>
        )}

        {/* ═══════════════ REVEAL ═══════════════ */}
        {session.questionState === 'reveal' && (
          <>
            {session.teamMode && session.teamScoreSnapshot && (
              <div className="bg-white/[0.05] backdrop-blur rounded-2xl p-6 mb-4 animate-bounce-in border border-white/[0.06]">
                <h3 className="text-lg font-bold mb-4">Team Standings</h3>
                <div className="space-y-3">
                  {session.teamScoreSnapshot.map((team, i) => (
                    <div key={team.teamIndex} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.04]">
                      <span className="text-2xl font-black text-white/30 w-8">{i + 1}</span>
                      <span className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: team.color }} />
                      <span className="flex-1 font-bold">{team.name}</span>
                      <span className="font-black text-lg tabular-nums">{team.avgPoints.toLocaleString()}</span>
                      <span className="text-xs text-white/40">avg pts</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="bg-white/[0.05] backdrop-blur rounded-2xl p-6 mb-4 animate-slide-up border border-white/[0.06]">
              <Leaderboard sessionId={session.id} top10Snapshot={session.top10Snapshot} />
            </div>
            {violations.size > 0 && (
              <div className="bg-danger/10 backdrop-blur rounded-2xl p-4 mb-8 animate-fade-in border border-danger/10">
                <div className="flex items-center gap-2 mb-3">
                  <ShieldAlert className="w-4 h-4 text-danger" />
                  <h3 className="text-sm font-bold text-danger">Flagged Activity</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {Array.from(violations.entries()).map(([pid, v]) => (
                    <span key={pid} className="px-3 py-1.5 bg-white/10 rounded-lg text-xs text-white/80">
                      {v.nickname}: {v.totalViolations} violation{v.totalViolations !== 1 ? 's' : ''}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-center gap-4 mt-8">
              {!isLastQuestion && (
                <button
                  onClick={nextQuestion}
                  className="px-8 py-3.5 bg-brand text-white font-bold text-lg rounded-2xl hover:bg-brand-dark transition-all shadow-lg shadow-brand/20"
                >
                  Next Question
                </button>
              )}
              {isLastQuestion && (
                <button
                  onClick={() => navigate(`/session/${session.id}/results`)}
                  className="px-8 py-3.5 bg-brand text-white font-bold text-lg rounded-2xl hover:bg-brand-dark transition-all shadow-lg shadow-brand/20"
                >
                  View Results
                </button>
              )}
            </div>
          </>
        )}

        <p className="text-center text-white/15 text-xs mt-8">
          Press <kbd className="px-1.5 py-0.5 bg-white/[0.06] rounded text-white/25 text-[10px]">Space</kbd> to advance
        </p>
      </div>
    </div>
  );
}
