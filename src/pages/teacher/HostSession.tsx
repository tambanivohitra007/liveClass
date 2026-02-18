import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { doc, onSnapshot, collection, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { db, functions } from '../../lib/firebase';
import { useSessionStore } from '../../stores/sessionStore';
import Leaderboard from '../../components/Leaderboard';
import { ShieldAlert, Users, Shuffle, Music, Volume2, VolumeX, Pause, Play, SkipForward, SlidersHorizontal, Zap, Sparkles } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { startLobbyMusic, stopLobbyMusic, playJoin, isMuted, setMuted as setSoundMuted, MUSIC_TRACKS, setLobbyTrack, getLobbyTrack } from '../../lib/sounds';
import type { Session, SessionPlayer, Question, ViolationDoc } from '../../types/models';
import { TEAM_PRESETS } from '../../types/models';

const AVATAR_COLORS = [
  { bg: 'bg-blue-500/20', border: 'border-blue-500/40', text: 'text-blue-400' },
  { bg: 'bg-purple-500/20', border: 'border-purple-500/40', text: 'text-purple-400' },
  { bg: 'bg-emerald-500/20', border: 'border-emerald-500/40', text: 'text-emerald-400' },
  { bg: 'bg-amber-500/20', border: 'border-amber-500/40', text: 'text-amber-400' },
  { bg: 'bg-rose-500/20', border: 'border-rose-500/40', text: 'text-rose-400' },
  { bg: 'bg-indigo-500/20', border: 'border-indigo-500/40', text: 'text-indigo-400' },
  { bg: 'bg-teal-500/20', border: 'border-teal-500/40', text: 'text-teal-400' },
  { bg: 'bg-pink-500/20', border: 'border-pink-500/40', text: 'text-pink-400' },
];

const MESH_BG: React.CSSProperties = {
  backgroundImage: `
    radial-gradient(at 0% 0%, rgba(212, 86, 107, 0.12) 0px, transparent 50%),
    radial-gradient(at 100% 0%, rgba(43, 181, 166, 0.15) 0px, transparent 50%),
    radial-gradient(at 100% 100%, rgba(212, 86, 107, 0.08) 0px, transparent 50%),
    radial-gradient(at 0% 100%, rgba(43, 181, 166, 0.08) 0px, transparent 50%)
  `,
};

const MARQUEE_ITEMS = [
  'GET READY TO LEARN',
  'WARMING UP THE BRAINS',
  'LOADING QUESTIONS',
  'MAY THE BEST PLAYER WIN',
  'KNOWLEDGE IS POWER',
  'STAY SHARP',
];

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
  const [currentQuestionId, setCurrentQuestionId] = useState('');
  const [answeredCount, setAnsweredCount] = useState(0);
  const prevPlayerCountRef = useRef(0);
  const navigate = useNavigate();

  const [allQuestions, setAllQuestions] = useState<Question[]>([]);

  useEffect(() => {
    if (!quizId) return;
    const loadQuestions = async () => {
      const q = query(collection(db, 'questions'), where('quizId', '==', quizId));
      const snap = await getDocs(q);
      const qs = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Question[];
      setAllQuestions(qs);
      setTotalQuestions(qs.length);
    };
    loadQuestions();
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
    if (!session || session.questionState !== 'live' || allQuestions.length === 0) return;
    // Reset immediately to prevent stale subscription data from triggering auto-end
    setCurrentQuestionId('');
    setAnsweredCount(0);
    const qIdx = session.questionOrder
      ? session.questionOrder[session.currentQuestionIndex]
      : session.currentQuestionIndex;
    const current = allQuestions[qIdx];
    setCurrentQuestionText(current?.text || '');
    setCurrentQuestionId(current?.id || '');
    if (current?.timeLimitSec) {
      setCurrentTimeLimitSec(current.timeLimitSec);
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
  }, [session?.currentQuestionIndex, session?.questionState, allQuestions]);

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

  // Subscribe to answer count for the current question
  useEffect(() => {
    if (!session || session.questionState !== 'live' || !currentQuestionId) {
      setAnsweredCount(0);
      return;
    }
    const q = query(
      collection(db, `sessions/${session.id}/answers`),
      where('questionId', '==', currentQuestionId)
    );
    const unsub = onSnapshot(q, (snap) => {
      setAnsweredCount(snap.size);
    });
    return unsub;
  }, [session?.id, session?.questionState, currentQuestionId]);

  // Auto-end when all players have answered
  useEffect(() => {
    if (!session || session.questionState !== 'live') return;
    if (answeredCount > 0 && answeredCount >= players.length && !autoEndCalledRef.current) {
      autoEndCalledRef.current = true;
      httpsCallable(functions, 'endQuestion')({ sessionId: session.id });
    }
  }, [answeredCount, players.length, session?.questionState]);

  const startQuestionDirect = async (qIndex: number) => {
    if (!session) return;
    const updateData: Record<string, unknown> = {
      status: 'live',
      currentQuestionIndex: qIndex,
      questionState: 'live',
      questionStartedAt: Date.now(),
    };
    // Generate shuffle order on first question if enabled
    if (qIndex === 0 && session.shuffleQuestions && allQuestions.length > 0) {
      const indices = Array.from({ length: allQuestions.length }, (_, i) => i);
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }
      updateData.questionOrder = indices;
    }
    await updateDoc(doc(db, 'sessions', session.id), updateData);
  };

  const startQuestion = () => startQuestionDirect(session?.currentQuestionIndex ?? 0);
  const nextQuestion = () => startQuestionDirect((session?.currentQuestionIndex ?? 0) + 1);

  const endQuestion = async () => {
    if (!session || autoEndCalledRef.current) return;
    autoEndCalledRef.current = true;
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
      await startQuestionDirect(session.currentQuestionIndex + 1);
    }
  };

  useEffect(() => { createSession(); }, [quizId]);

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-surface-dark">
      <div className="text-center">
        <p className="text-danger mb-4">{error}</p>
        <button onClick={() => navigate('/dashboard')} className="text-brand underline">Back to Dashboard</button>
      </div>
    </div>
  );

  const isLastQuestion = session ? session.currentQuestionIndex >= totalQuestions - 1 : false;

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

  useEffect(() => {
    if (session?.status === 'lobby' && !muted) startLobbyMusic();
    else stopLobbyMusic();
    return () => stopLobbyMusic();
  }, [session?.status, muted]);

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
    <div className="min-h-screen bg-surface-dark text-white flex flex-col" style={MESH_BG}>

      {/* ══════════ Top Navigation Bar ══════════ */}
      <header className="flex items-center justify-between px-8 py-5 w-full max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="bg-brand p-2 rounded-lg flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">
            LiveClass <span className="text-brand">Game</span>
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5 bg-white/10 backdrop-blur-md px-5 py-2 rounded-full border border-white/5">
            <div className="w-2.5 h-2.5 bg-success rounded-full animate-pulse" />
            <span className="text-sm font-semibold">
              {players.length} Player{players.length !== 1 && 's'} Joined
            </span>
          </div>
          <button
            onClick={toggleMute}
            className="p-2.5 hover:bg-white/10 rounded-full transition-colors text-white/60 hover:text-white"
            aria-label={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* ══════════════════ LOBBY ══════════════════ */}
      {session.status === 'lobby' && (
        <>
          <main className="flex-grow flex flex-col lg:flex-row gap-8 px-8 py-4 max-w-7xl mx-auto w-full">

            {/* ── Left Column: PIN Hero + Players ── */}
            <div className="flex-grow flex flex-col gap-8">

              {/* Hero PIN + QR Section */}
              <div className="relative flex flex-col items-center py-12 px-8 bg-white/5 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-sm animate-bounce-in">
                <div className="absolute inset-0 bg-gradient-to-br from-brand/10 to-accent/10 opacity-50" />
                <h2 className="relative text-base font-medium text-white/60 mb-6 uppercase tracking-[0.2em]">
                  Join the Game
                </h2>
                <div className="relative flex flex-col sm:flex-row items-center gap-8">
                  {/* PIN */}
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-sm font-medium text-brand">Enter Game PIN</p>
                    <div
                      className="bg-white text-surface-dark px-10 py-5 rounded-2xl flex items-center gap-3"
                      style={{ boxShadow: '0 0 60px rgba(212, 86, 107, 0.3)' }}
                    >
                      <span className="text-5xl md:text-6xl font-black tracking-tight">
                        {session.pinCode.slice(0, 3)}
                      </span>
                      <div className="w-1.5 h-12 bg-gray-200 rounded-full" />
                      <span className="text-5xl md:text-6xl font-black tracking-tight">
                        {session.pinCode.slice(3)}
                      </span>
                    </div>
                  </div>

                  {/* Vertical divider (desktop) */}
                  <div className="hidden sm:flex flex-col items-center gap-2 self-stretch justify-center">
                    <div className="flex-1 w-px bg-gradient-to-b from-transparent via-white/15 to-transparent" />
                    <span className="text-[10px] uppercase tracking-widest text-white/30 font-medium">or</span>
                    <div className="flex-1 w-px bg-gradient-to-b from-transparent via-white/15 to-transparent" />
                  </div>
                  {/* Horizontal divider (mobile) */}
                  <div className="flex sm:hidden items-center gap-4 w-full">
                    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
                    <span className="text-[10px] uppercase tracking-widest text-white/30 font-medium">or</span>
                    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
                  </div>

                  {/* QR Code */}
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-sm font-medium text-brand">Scan to Join</p>
                    <div
                      className="bg-white p-3 rounded-2xl"
                      style={{ boxShadow: '0 0 40px rgba(212, 86, 107, 0.2)' }}
                    >
                      <QRCodeSVG
                        value={`${window.location.origin}/join?pin=${session.pinCode}`}
                        size={128}
                        level="M"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Players Grid */}
              <div className="flex-grow flex flex-col animate-fade-in">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-xl font-bold">Waiting Lobby</h3>
                  <span className="text-sm text-white/40">
                    {players.length > 0 ? 'Newest players appear first' : 'Waiting for players...'}
                  </span>
                </div>

                {session.teamMode && session.teams ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {session.teams.map((team, ti) => {
                      const teamPlayers = players.filter((p) => p.teamIndex === ti);
                      return (
                        <div key={ti} className="bg-white/5 rounded-2xl p-5 border border-white/5">
                          <div className="flex items-center gap-2 mb-4">
                            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: team.color }} />
                            <span className="text-sm font-bold">{team.name}</span>
                            <span className="text-xs text-white/30 ml-auto">{teamPlayers.length}</span>
                          </div>
                          <div className="space-y-2">
                            {teamPlayers.map((p, i) => {
                              const color = AVATAR_COLORS[i % AVATAR_COLORS.length];
                              const v = violations.get(p.id);
                              return (
                                <div key={p.id} className="flex items-center gap-3 bg-white/5 p-2.5 rounded-full border border-white/5 animate-fade-in">
                                  <div className={`w-8 h-8 rounded-full ${color.bg} border ${color.border} flex items-center justify-center text-xs font-bold ${color.text} shrink-0`}>
                                    {p.nickname.charAt(0).toUpperCase()}
                                  </div>
                                  <span className="font-medium truncate text-sm">{p.nickname}</span>
                                  {v && v.totalViolations > 0 && (
                                    <span className="ml-auto inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-danger/20 text-danger rounded-full text-[10px] font-bold shrink-0">
                                      <ShieldAlert className="w-2.5 h-2.5" />
                                      {v.totalViolations}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                    {players.map((p, i) => {
                      const color = AVATAR_COLORS[i % AVATAR_COLORS.length];
                      const v = violations.get(p.id);
                      return (
                        <div
                          key={p.id}
                          className="flex items-center gap-3 bg-white/5 p-3 rounded-full border border-white/5 hover:bg-white/10 transition-all animate-fade-in"
                        >
                          <div className={`w-10 h-10 rounded-full ${color.bg} border ${color.border} flex items-center justify-center text-sm font-bold ${color.text} shrink-0`}>
                            {p.nickname.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-medium truncate">{p.nickname}</span>
                          {v && v.totalViolations > 0 && (
                            <span className="ml-auto inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-danger/20 text-danger rounded-full text-xs font-bold shrink-0" title={`${v.totalViolations} violation(s)`}>
                              <ShieldAlert className="w-3 h-3" />
                              {v.totalViolations}
                            </span>
                          )}
                        </div>
                      );
                    })}
                    {players.length === 0 && (
                      <div className="col-span-full flex items-center gap-3 bg-white/5 p-3 rounded-full border border-dashed border-white/10 opacity-50">
                        <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center animate-pulse">
                          <span className="text-white/30 text-lg">+</span>
                        </div>
                        <span className="text-white/30 italic text-sm">Joining...</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ── Right Column: Host Controls Sidebar ── */}
            <aside className="w-full lg:w-80 flex flex-col gap-6 shrink-0">
              <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 flex flex-col gap-6 h-full">

                {/* Settings Header */}
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <SlidersHorizontal className="w-5 h-5 text-brand" />
                  Host Settings
                </h3>

                {/* Setting Rows */}
                <div className="space-y-3">
                  {/* Anti-Cheat */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors group">
                    <div className="flex items-center gap-3">
                      <ShieldAlert className={`w-5 h-5 ${session.antiCheatEnabled !== false ? 'text-success' : 'text-white/50 group-hover:text-brand'} transition-colors`} />
                      <span className="text-sm font-medium">Anti-Cheat</span>
                    </div>
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
                  <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors group">
                    <div className="flex items-center gap-3">
                      <Users className={`w-5 h-5 ${session.teamMode ? 'text-info' : 'text-white/50 group-hover:text-brand'} transition-colors`} />
                      <span className="text-sm font-medium">Teams</span>
                    </div>
                    <div className="flex items-center gap-2">
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
                          className="px-2 py-0.5 bg-white/10 text-white text-xs rounded-lg border border-white/20 outline-none"
                        >
                          {[2, 3, 4, 5, 6].map((n) => (
                            <option key={n} value={n} className="bg-gray-800">{n}</option>
                          ))}
                        </select>
                      )}
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
                    </div>
                  </div>

                  {/* Shuffle */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors group">
                    <div className="flex items-center gap-3">
                      <Shuffle className={`w-5 h-5 ${session.shuffleQuestions ? 'text-warning' : 'text-white/50 group-hover:text-brand'} transition-colors`} />
                      <span className="text-sm font-medium">Shuffle</span>
                    </div>
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
                  <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors group">
                    <div className="flex items-center gap-3">
                      <Music className="w-5 h-5 text-white/50 group-hover:text-brand transition-colors" />
                      <span className="text-sm font-medium">Music</span>
                    </div>
                    <select
                      value={lobbyTrack}
                      onChange={(e) => {
                        setLobbyTrackState(e.target.value);
                        setLobbyTrack(e.target.value);
                      }}
                      className="px-2 py-1 bg-white/10 text-white text-xs rounded-lg border border-white/20 outline-none max-w-[120px]"
                    >
                      {Object.entries(MUSIC_TRACKS).map(([key, track]) => (
                        <option key={key} value={key} className="bg-gray-800">{track.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Bottom: Game Info + Start */}
                <div className="mt-auto flex flex-col gap-4">
                  <div className="bg-brand/10 border border-brand/20 rounded-xl p-4 text-center">
                    <p className="text-xs text-brand font-bold uppercase mb-1">
                      {players.length > 0 ? 'Game Ready' : 'Waiting for Players'}
                    </p>
                    <p className="text-sm text-white/50">
                      {totalQuestions} Question{totalQuestions !== 1 && 's'} loaded
                    </p>
                  </div>
                  <button
                    onClick={startQuestion}
                    disabled={players.length === 0}
                    className="w-full bg-brand hover:bg-brand-dark text-white font-bold py-4 rounded-full transition-all disabled:opacity-30 flex items-center justify-center gap-2 group"
                    style={{ boxShadow: players.length > 0 ? '0 4px 25px rgba(212, 86, 107, 0.4)' : 'none' }}
                  >
                    <span>START GAME</span>
                    <Play className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
                  </button>
                </div>
              </div>
            </aside>
          </main>

          {/* Scrolling Marquee Footer */}
          <footer className="w-full bg-white/5 border-t border-white/5 py-3.5 overflow-hidden mt-auto">
            <div className="animate-marquee whitespace-nowrap flex items-center gap-12 text-white/25 font-medium text-sm">
              <div className="flex items-center gap-12">
                {MARQUEE_ITEMS.map((item, i) => (
                  <span key={i} className="flex items-center gap-2">
                    <Sparkles className="w-3 h-3" /> {item}...
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-12" aria-hidden="true">
                {MARQUEE_ITEMS.map((item, i) => (
                  <span key={`dup-${i}`} className="flex items-center gap-2">
                    <Sparkles className="w-3 h-3" /> {item}...
                  </span>
                ))}
              </div>
            </div>
          </footer>
        </>
      )}

      {/* ══════════════════ LIVE QUESTION ══════════════════ */}
      {session.questionState === 'live' && (
        <main className="flex-grow flex flex-col items-center justify-center px-8 py-8 max-w-4xl mx-auto w-full">
          {/* Question counter */}
          <div className="inline-flex items-center gap-2 px-5 py-2 bg-white/10 backdrop-blur-md rounded-full border border-white/5 mb-8 animate-fade-in">
            <span className="text-xs text-white/50 uppercase tracking-wider font-medium">Question</span>
            <span className="text-sm font-bold">
              {session.currentQuestionIndex + 1}
              <span className="text-white/30 mx-1">/</span>
              {totalQuestions}
            </span>
          </div>

          <h2 className="text-2xl md:text-5xl font-bold text-center mb-10 max-w-3xl leading-tight animate-fade-in break-words">
            {currentQuestionText}
          </h2>

          {/* Timer + Answer Progress */}
          <div className="flex items-center gap-6">
            {currentTimeLimitSec > 0 && (
              <div className={`inline-flex items-baseline gap-2 px-8 py-4 rounded-2xl border transition-colors animate-bounce-in ${
                session.timerPaused
                  ? 'bg-warning/10 border-warning/20'
                  : timeLeft <= 5
                    ? 'bg-danger/10 border-danger/20'
                    : 'bg-white/5 border-white/10'
              }`}>
                <span className={`text-6xl font-black tabular-nums ${
                  session.timerPaused ? 'text-warning' :
                  timeLeft <= 5 ? 'text-danger animate-timer-pulse' : 'text-white'
                }`}>{timeLeft}</span>
                <span className={`text-base font-medium ${
                  session.timerPaused ? 'text-warning' :
                  timeLeft <= 5 ? 'text-danger/50' : 'text-white/30'
                }`}>{session.timerPaused ? 'PAUSED' : 'sec'}</span>
              </div>
            )}
            <div className="inline-flex flex-col items-center px-6 py-3 rounded-2xl bg-white/5 border border-white/10 animate-bounce-in">
              <span className={`text-4xl font-black tabular-nums ${answeredCount >= players.length ? 'text-success' : 'text-white'}`}>
                {answeredCount}<span className="text-white/30">/{players.length}</span>
              </span>
              <span className="text-xs font-medium text-white/30">answered</span>
            </div>
          </div>

          {/* Control Toolbar */}
          <div className="flex items-center gap-3 mt-10">
            <div className="inline-flex items-center gap-1 bg-white/5 rounded-full p-1.5 border border-white/10 backdrop-blur-sm">
              <button
                onClick={togglePause}
                className="p-3 rounded-full hover:bg-white/10 transition-colors text-white/60 hover:text-white"
                title={session.timerPaused ? 'Resume timer' : 'Pause timer'}
                aria-label={session.timerPaused ? 'Resume timer' : 'Pause timer'}
              >
                {session.timerPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
              </button>
              <button
                onClick={extendTimer}
                className="px-4 py-2.5 rounded-full hover:bg-white/10 transition-colors text-white/60 hover:text-white text-sm font-bold"
                title="Add 30 seconds"
              >
                +30s
              </button>
              {!isLastQuestion && (
                <button
                  onClick={skipQuestion}
                  className="p-3 rounded-full hover:bg-white/10 transition-colors text-white/60 hover:text-white"
                  title="Skip to next question"
                  aria-label="Skip to next question"
                >
                  <SkipForward className="w-4 h-4" />
                </button>
              )}
            </div>
            <button
              onClick={endQuestion}
              className="px-8 py-3.5 bg-danger text-white font-bold rounded-full hover:brightness-110 transition-all"
              style={{ boxShadow: '0 4px 20px rgba(232, 99, 107, 0.35)' }}
            >
              End Question
            </button>
          </div>

          <p className="text-white/15 text-xs mt-10">
            Press <kbd className="px-1.5 py-0.5 bg-white/5 rounded text-white/25 text-[10px]">Space</kbd> to advance
          </p>
        </main>
      )}

      {/* ══════════════════ REVEAL ══════════════════ */}
      {session.questionState === 'reveal' && (
        <main className="flex-grow flex flex-col px-8 py-8 max-w-4xl mx-auto w-full">
          {session.teamMode && session.teamScoreSnapshot && (
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 mb-4 animate-bounce-in">
              <h3 className="text-lg font-bold mb-4">Team Standings</h3>
              <div className="space-y-3">
                {session.teamScoreSnapshot.map((team, i) => (
                  <div key={team.teamIndex} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5">
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

          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 mb-4 animate-slide-up">
            <Leaderboard sessionId={session.id} top10Snapshot={session.top10Snapshot} currentQuestion={session.currentQuestionIndex + 1} totalQuestions={totalQuestions} />
          </div>

          {violations.size > 0 && (
            <div className="bg-danger/10 backdrop-blur rounded-2xl p-4 mb-6 animate-fade-in border border-danger/10">
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

          <div className="flex justify-center gap-4 mt-6">
            {!isLastQuestion && (
              <button
                onClick={nextQuestion}
                className="px-10 py-4 bg-brand text-white font-bold text-lg rounded-full hover:bg-brand-dark transition-all flex items-center gap-2 group"
                style={{ boxShadow: '0 4px 25px rgba(212, 86, 107, 0.35)' }}
              >
                Next Question
                <Play className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
              </button>
            )}
            {isLastQuestion && (
              <button
                onClick={() => navigate(`/session/${session.id}/results`)}
                className="px-10 py-4 bg-brand text-white font-bold text-lg rounded-full hover:bg-brand-dark transition-all"
                style={{ boxShadow: '0 4px 25px rgba(212, 86, 107, 0.35)' }}
              >
                View Results
              </button>
            )}
          </div>

          <p className="text-center text-white/15 text-xs mt-8">
            Press <kbd className="px-1.5 py-0.5 bg-white/5 rounded text-white/25 text-[10px]">Space</kbd> to advance
          </p>
        </main>
      )}
    </div>
  );
}
