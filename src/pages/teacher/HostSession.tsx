import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { doc, onSnapshot, collection, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { db, functions } from '../../lib/firebase';
import { useSessionStore } from '../../stores/sessionStore';
import Leaderboard from '../../components/Leaderboard';
import { ShieldAlert, Users, Shuffle, Music, Volume2, VolumeX } from 'lucide-react';
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
          const elapsed = Math.floor((Date.now() - startMs) / 1000);
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
    if (timeLeft <= 0) return;
    const timer = setInterval(() => setTimeLeft((t) => Math.max(0, t - 1)), 1000);
    return () => clearInterval(timer);
  }, [session?.questionState, timeLeft]);

  useEffect(() => {
    if (!session || session.questionState !== 'live') return;
    if (timeLeft <= 0 && currentTimeLimitSec > 0 && !autoEndCalledRef.current) {
      autoEndCalledRef.current = true;
      httpsCallable(functions, 'endQuestion')({ sessionId: session.id });
    }
  }, [timeLeft, session?.questionState, currentTimeLimitSec]);

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
    <div className="min-h-screen bg-surface-dark text-white">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <span className="font-bold text-lg">LiveClass</span>
        <div className="flex items-center gap-3 text-sm text-white/60">
          <span>{players.length} player{players.length !== 1 && 's'}</span>
          <span className="px-2 py-0.5 rounded-full bg-white/10 text-xs capitalize">{session.questionState}</span>
          <button onClick={toggleMute} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* PIN Display */}
        {session.status === 'lobby' && (
          <div className="text-center mb-12 animate-bounce-in">
            <p className="text-white/50 text-sm uppercase tracking-widest mb-3">Game PIN</p>
            <div className="inline-block bg-white text-surface-dark rounded-2xl px-12 py-6 shadow-2xl animate-pulse-glow">
              <span className="text-5xl md:text-7xl font-black tracking-[0.3em]">{session.pinCode}</span>
            </div>
            <p className="text-white/40 mt-4 text-sm">Share this PIN with your students</p>
          </div>
        )}

        {/* Current Question (when live) */}
        {session.questionState === 'live' && (
          <div className="text-center mb-8 animate-fade-in">
            <span className="text-sm text-white/40 uppercase tracking-wider">Question {session.currentQuestionIndex + 1} of {totalQuestions}</span>
            <h2 className="text-2xl md:text-3xl font-bold mt-2">{currentQuestionText}</h2>
            {currentTimeLimitSec > 0 && (
              <div className={`mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full ${timeLeft <= 5 ? 'bg-danger/20 text-danger' : 'bg-white/10 text-white/70'}`}>
                <span className={`text-2xl font-black tabular-nums ${timeLeft <= 5 ? 'animate-timer-pulse' : ''}`}>{timeLeft}</span>
                <span className="text-sm">sec</span>
              </div>
            )}
          </div>
        )}

        {/* Lobby Settings */}
        {session.status === 'lobby' && (
          <div className="flex flex-wrap items-center justify-center gap-6 mb-8 animate-fade-in">
            {/* Anti-Cheat Toggle */}
            <div className="flex items-center gap-2">
              <ShieldAlert className={`w-4 h-4 ${session.antiCheatEnabled !== false ? 'text-success' : 'text-white/30'}`} />
              <span className="text-sm text-white/60">Anti-Cheat</span>
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

            {/* Team Mode Toggle */}
            <div className="flex items-center gap-2">
              <Users className={`w-4 h-4 ${session.teamMode ? 'text-info' : 'text-white/30'}`} />
              <span className="text-sm text-white/60">Teams</span>
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

            {/* Shuffle Toggle */}
            <div className="flex items-center gap-2">
              <Shuffle className={`w-4 h-4 ${session.shuffleQuestions ? 'text-warning' : 'text-white/30'}`} />
              <span className="text-sm text-white/60">Shuffle</span>
              <button
                onClick={async () => {
                  await updateDoc(doc(db, 'sessions', session.id), { shuffleQuestions: !session.shuffleQuestions });
                }}
                className={`relative w-11 h-6 rounded-full transition-colors ${session.shuffleQuestions ? 'bg-warning' : 'bg-white/20'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${session.shuffleQuestions ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>

            {/* Music Track Selector */}
            <div className="flex items-center gap-2">
              <Music className="w-4 h-4 text-white/30" />
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
        )}

        {/* Players Grid */}
        {session.status === 'lobby' && (
          <div className="mb-8">
            <h3 className="text-sm text-white/40 uppercase tracking-wider mb-4">Players Joined</h3>
            {session.teamMode && session.teams ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {session.teams.map((team, ti) => {
                  const teamPlayers = players.filter((p) => p.teamIndex === ti);
                  return (
                    <div key={ti} className="bg-white/5 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: team.color }} />
                        <span className="text-sm font-bold">{team.name}</span>
                        <span className="text-xs text-white/40">({teamPlayers.length})</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {teamPlayers.map((p) => {
                          const v = violations.get(p.id);
                          return (
                            <span key={p.id} className="px-3 py-1.5 rounded-lg text-sm font-medium animate-fade-in inline-flex items-center gap-1.5" style={{ backgroundColor: team.color + '20' }}>
                              {p.nickname}
                              {v && v.totalViolations > 0 && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-danger/20 text-danger rounded-full text-xs font-bold">
                                  <ShieldAlert className="w-3 h-3" />
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
                    <span key={p.id} className="px-4 py-2 bg-white/10 backdrop-blur rounded-xl text-sm font-medium animate-fade-in inline-flex items-center gap-1.5">
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
            {players.length === 0 && <p className="text-white/30">Waiting for players to join...</p>}
          </div>
        )}

        {/* Leaderboard (on reveal) */}
        {session.questionState === 'reveal' && (
          <>
            {/* Team Scores */}
            {session.teamMode && session.teamScoreSnapshot && (
              <div className="bg-white/5 backdrop-blur rounded-2xl p-6 mb-4 animate-bounce-in">
                <h3 className="text-lg font-bold mb-4">Team Standings</h3>
                <div className="space-y-3">
                  {session.teamScoreSnapshot.map((team, i) => (
                    <div key={team.teamIndex} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5">
                      <span className="text-2xl font-black text-white/40 w-8">{i + 1}</span>
                      <span className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: team.color }} />
                      <span className="flex-1 font-bold">{team.name}</span>
                      <span className="font-black text-lg tabular-nums">{team.avgPoints.toLocaleString()}</span>
                      <span className="text-xs text-white/40">avg pts</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="bg-white/5 backdrop-blur rounded-2xl p-6 mb-4 animate-slide-up">
              <Leaderboard sessionId={session.id} top10Snapshot={session.top10Snapshot} />
            </div>
            {violations.size > 0 && (
              <div className="bg-danger/10 backdrop-blur rounded-2xl p-4 mb-8 animate-fade-in">
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
          </>
        )}

        {/* Controls */}
        <div className="flex justify-center gap-4 mt-8">
          {session.status === 'lobby' && (
            <button
              onClick={startQuestion}
              disabled={players.length === 0}
              className="px-8 py-3.5 bg-success text-white font-bold text-lg rounded-2xl hover:brightness-110 transition-all disabled:opacity-40 shadow-lg"
            >
              Start Game
            </button>
          )}
          {session.questionState === 'live' && (
            <button
              onClick={endQuestion}
              className="px-8 py-3.5 bg-danger text-white font-bold text-lg rounded-2xl hover:brightness-110 transition-all shadow-lg"
            >
              End Question
            </button>
          )}
          {session.questionState === 'reveal' && !isLastQuestion && (
            <button
              onClick={nextQuestion}
              className="px-8 py-3.5 bg-brand text-white font-bold text-lg rounded-2xl hover:bg-brand-dark transition-all shadow-lg"
            >
              Next Question
            </button>
          )}
          {session.questionState === 'reveal' && isLastQuestion && (
            <button
              onClick={() => navigate(`/session/${session.id}/results`)}
              className="px-8 py-3.5 bg-brand text-white font-bold text-lg rounded-2xl hover:bg-brand-dark transition-all shadow-lg"
            >
              View Results
            </button>
          )}
        </div>
        <p className="text-center text-white/20 text-xs mt-4">Press <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-white/40">Space</kbd> to advance</p>
      </div>
    </div>
  );
}
