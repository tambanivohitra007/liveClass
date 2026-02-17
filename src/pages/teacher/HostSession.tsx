import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { doc, onSnapshot, collection, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { db, functions } from '../../lib/firebase';
import { confirmAction } from '../../lib/swal';
import { useSessionStore } from '../../stores/sessionStore';
import Leaderboard from '../../components/Leaderboard';
import { ShieldAlert } from 'lucide-react';
import type { Session, SessionPlayer, Question, ViolationDoc } from '../../types/models';

export default function HostSession() {
  const { quizId } = useParams<{ quizId: string }>();
  const { session, setSession, players, setPlayers } = useSessionStore();
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [currentQuestionText, setCurrentQuestionText] = useState('');
  const [error, setError] = useState('');
  const [violations, setViolations] = useState<Map<string, ViolationDoc>>(new Map());
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
      setCurrentQuestionText(questions[session.currentQuestionIndex]?.text || '');
    };
    loadCurrentQuestion();
  }, [session?.currentQuestionIndex, session?.questionState]);

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
    const { isConfirmed } = await confirmAction(
      'End this question?',
      'Students will no longer be able to submit answers.',
      'Yes, end it'
    );
    if (!isConfirmed) return;
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
          </div>
        )}

        {/* Anti-Cheat Toggle */}
        {session.status === 'lobby' && (
          <div className="flex items-center justify-center gap-3 mb-8 animate-fade-in">
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
        )}

        {/* Players Grid */}
        {session.status === 'lobby' && (
          <div className="mb-8">
            <h3 className="text-sm text-white/40 uppercase tracking-wider mb-4">Players Joined</h3>
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
              {players.length === 0 && <p className="text-white/30">Waiting for players to join...</p>}
            </div>
          </div>
        )}

        {/* Leaderboard (on reveal) */}
        {session.questionState === 'reveal' && (
          <>
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
              className="px-8 py-4 bg-success text-white font-bold text-lg rounded-xl hover:brightness-110 transition-all disabled:opacity-40 shadow-lg"
            >
              Start Game
            </button>
          )}
          {session.questionState === 'live' && (
            <button
              onClick={endQuestion}
              className="px-8 py-4 bg-danger text-white font-bold text-lg rounded-xl hover:brightness-110 transition-all shadow-lg"
            >
              End Question
            </button>
          )}
          {session.questionState === 'reveal' && !isLastQuestion && (
            <button
              onClick={nextQuestion}
              className="px-8 py-4 bg-brand text-white font-bold text-lg rounded-xl hover:bg-brand-dark transition-all shadow-lg"
            >
              Next Question
            </button>
          )}
          {session.questionState === 'reveal' && isLastQuestion && (
            <button
              onClick={() => navigate(`/session/${session.id}/results`)}
              className="px-8 py-4 bg-brand text-white font-bold text-lg rounded-xl hover:bg-brand-dark transition-all shadow-lg"
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
