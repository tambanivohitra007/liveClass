import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { doc, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../lib/firebase';
import { useSessionStore } from '../../stores/sessionStore';
import type { Session, Question } from '../../types/models';

export default function PlayGame() {
  const { sessionId, playerId } = useParams<{ sessionId: string; playerId: string }>();
  const { session, setSession } = useSessionStore();
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string>('');
  const [submitted, setSubmitted] = useState(false);
  const [feedback, setFeedback] = useState<{ correct: boolean; points: number } | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    if (!sessionId) return;
    const unsubscribe = onSnapshot(doc(db, 'sessions', sessionId), (snap) => {
      if (snap.exists()) {
        setSession({ id: snap.id, ...snap.data() } as Session);
      }
    });
    return unsubscribe;
  }, [sessionId, setSession]);

  useEffect(() => {
    if (!session || session.questionState !== 'live') return;
    setSubmitted(false);
    setSelectedAnswer('');
    setFeedback(null);

    const loadQuestion = async () => {
      const q = query(
        collection(db, 'questions'),
        where('quizId', '==', session.quizId)
      );
      const snapshot = await getDocs(q);
      const questions = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Question[];
      const current = questions[session.currentQuestionIndex];
      if (current) {
        setCurrentQuestion(current);
        setTimeLeft(current.timeLimitSec);
      }
    };
    loadQuestion();
  }, [session?.currentQuestionIndex, session?.questionState]);

  useEffect(() => {
    if (timeLeft <= 0 || submitted) return;
    const timer = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft, submitted]);

  const submitAnswer = async () => {
    if (!sessionId || !playerId || !currentQuestion || submitted) return;
    setSubmitted(true);

    const startTime = (currentQuestion.timeLimitSec - timeLeft) * 1000;
    const fn = httpsCallable<
      { sessionId: string; questionId: string; playerId: string; selection: string; timeMs: number },
      { correct: boolean; pointsAwarded: number }
    >(functions, 'scoreAnswer');

    try {
      const result = await fn({
        sessionId,
        questionId: currentQuestion.id,
        playerId,
        selection: selectedAnswer,
        timeMs: startTime,
      });
      setFeedback({ correct: result.data.correct, points: result.data.pointsAwarded });
    } catch (err) {
      console.error('Failed to submit answer:', err);
    }
  };

  if (!session) return <p>Connecting to session...</p>;

  if (session.status === 'lobby') {
    return (
      <div>
        <h1>Waiting for host to start...</h1>
        <p>You're in! Hang tight.</p>
      </div>
    );
  }

  if (session.status === 'ended') {
    return (
      <div>
        <h1>Game Over!</h1>
        <p>Thanks for playing!</p>
      </div>
    );
  }

  if (session.questionState === 'reveal') {
    return (
      <div>
        <h2>Results</h2>
        {feedback && (
          <div>
            <p>{feedback.correct ? 'Correct!' : 'Wrong!'}</p>
            <p>+{feedback.points} points</p>
          </div>
        )}
        <p>Waiting for next question...</p>
      </div>
    );
  }

  if (!currentQuestion) return <p>Loading question...</p>;

  return (
    <div>
      <h2>Question {(session.currentQuestionIndex || 0) + 1}</h2>
      <p>Time left: {timeLeft}s</p>
      <p>{currentQuestion.text}</p>

      {currentQuestion.type !== 'short' ? (
        <div>
          {currentQuestion.options.map((opt, i) => (
            <button
              key={i}
              onClick={() => !submitted && setSelectedAnswer(opt)}
              style={{
                display: 'block',
                margin: '0.5rem 0',
                padding: '0.5rem 1rem',
                backgroundColor: selectedAnswer === opt ? '#4CAF50' : '#eee',
                color: selectedAnswer === opt ? 'white' : 'black',
              }}
              disabled={submitted}
            >
              {opt}
            </button>
          ))}
        </div>
      ) : (
        <input
          type="text"
          value={selectedAnswer}
          onChange={(e) => setSelectedAnswer(e.target.value)}
          placeholder="Your answer"
          disabled={submitted}
        />
      )}

      {!submitted && (
        <button onClick={submitAnswer} disabled={!selectedAnswer}>
          Submit
        </button>
      )}

      {submitted && !feedback && <p>Submitting...</p>}
    </div>
  );
}
