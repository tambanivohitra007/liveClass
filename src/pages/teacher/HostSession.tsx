import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { doc, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';
import { db, functions } from '../../lib/firebase';
import { useSessionStore } from '../../stores/sessionStore';
import Leaderboard from '../../components/Leaderboard';
import type { Session, SessionPlayer, Question } from '../../types/models';

export default function HostSession() {
  const { quizId } = useParams<{ quizId: string }>();
  const { session, setSession, players, setPlayers } = useSessionStore();
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [currentQuestionText, setCurrentQuestionText] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (!quizId) return;

    const loadQuestionCount = async () => {
      const q = query(collection(db, 'questions'), where('quizId', '==', quizId));
      const snapshot = await getDocs(q);
      setTotalQuestions(snapshot.size);
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
      if (snap.exists()) {
        setSession({ id: snap.id, ...snap.data() } as Session);
      }
    });

    onSnapshot(collection(db, `sessions/${sessionId}/players`), (snap) => {
      const playerList = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as SessionPlayer[];
      setPlayers(playerList);
    });
  };

  useEffect(() => {
    if (!session || !session.quizId) return;
    if (session.questionState !== 'live') return;

    const loadCurrentQuestion = async () => {
      const q = query(collection(db, 'questions'), where('quizId', '==', session.quizId));
      const snapshot = await getDocs(q);
      const questions = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Question[];
      const current = questions[session.currentQuestionIndex];
      setCurrentQuestionText(current?.text || '');
    };
    loadCurrentQuestion();
  }, [session?.currentQuestionIndex, session?.questionState]);

  const startQuestion = async () => {
    if (!session) return;
    const fn = httpsCallable(functions, 'startQuestion');
    await fn({ sessionId: session.id, qIndex: session.currentQuestionIndex });
  };

  const nextQuestion = async () => {
    if (!session) return;
    const nextIdx = session.currentQuestionIndex + 1;
    if (nextIdx >= totalQuestions) return;
    const fn = httpsCallable(functions, 'startQuestion');
    await fn({ sessionId: session.id, qIndex: nextIdx });
  };

  const endQuestion = async () => {
    if (!session) return;
    const fn = httpsCallable(functions, 'endQuestion');
    await fn({ sessionId: session.id });
  };

  const endSession = async () => {
    if (!session) return;
    navigate(`/session/${session.id}/results`);
  };

  useEffect(() => {
    createSession();
  }, [quizId]);

  if (error) return <p style={{ color: 'red' }}>{error}</p>;
  if (!session) return <p>Creating session...</p>;

  const isLastQuestion = session.currentQuestionIndex >= totalQuestions - 1;

  return (
    <div>
      <h1>Live Session</h1>
      <div style={{ fontSize: '2rem', fontWeight: 'bold', textAlign: 'center', padding: '1rem', background: '#f5f5f5', borderRadius: '8px' }}>
        PIN: {session.pinCode}
      </div>
      <p>Status: {session.status} | Question State: {session.questionState}</p>

      {session.questionState === 'live' && (
        <p>Question {session.currentQuestionIndex + 1} of {totalQuestions}: {currentQuestionText}</p>
      )}

      <h3>Players ({players.length})</h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {players.map((p) => (
          <span key={p.id} style={{ padding: '0.25rem 0.75rem', background: '#e3f2fd', borderRadius: '16px' }}>
            {p.nickname}
          </span>
        ))}
      </div>

      <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
        {session.status === 'lobby' && (
          <button onClick={startQuestion}>Start First Question</button>
        )}

        {session.questionState === 'live' && (
          <button onClick={endQuestion}>End Question</button>
        )}

        {session.questionState === 'reveal' && !isLastQuestion && (
          <button onClick={nextQuestion}>Next Question</button>
        )}

        {session.questionState === 'reveal' && isLastQuestion && (
          <button onClick={endSession}>View Results</button>
        )}
      </div>

      {session.questionState === 'reveal' && (
        <Leaderboard sessionId={session.id} top10Snapshot={session.top10Snapshot} />
      )}
    </div>
  );
}
