import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, functions } from '../../lib/firebase';
import { useSessionStore } from '../../stores/sessionStore';
import type { Session } from '../../types/models';

export default function HostSession() {
  const { quizId } = useParams<{ quizId: string }>();
  const { session, setSession, players } = useSessionStore();

  const createSession = async () => {
    if (!quizId) return;
    const fn = httpsCallable<{ quizId: string }, { sessionId: string }>(functions, 'createSession');
    const result = await fn({ quizId });
    subscribeToSession(result.data.sessionId);
  };

  const subscribeToSession = (sessionId: string) => {
    onSnapshot(doc(db, 'sessions', sessionId), (snap) => {
      if (snap.exists()) {
        setSession({ id: snap.id, ...snap.data() } as Session);
      }
    });
  };

  const startQuestion = async () => {
    if (!session) return;
    const fn = httpsCallable(functions, 'startQuestion');
    await fn({ sessionId: session.id, qIndex: session.currentQuestionIndex });
  };

  const endQuestion = async () => {
    if (!session) return;
    const fn = httpsCallable(functions, 'endQuestion');
    await fn({ sessionId: session.id });
  };

  useEffect(() => {
    createSession();
  }, [quizId]);

  if (!session) return <p>Creating session...</p>;

  return (
    <div>
      <h1>Live Session</h1>
      <h2>PIN: {session.pinCode}</h2>
      <p>Status: {session.status}</p>
      <p>Players: {players.length}</p>

      {session.status === 'lobby' && (
        <button onClick={startQuestion}>Start First Question</button>
      )}

      {session.questionState === 'live' && (
        <button onClick={endQuestion}>End Question</button>
      )}

      {session.questionState === 'reveal' && (
        <button onClick={startQuestion}>Next Question</button>
      )}
    </div>
  );
}
