import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../lib/firebase';
import { queueAnswer, syncPendingAnswers } from '../../lib/offlineQueue';
import type { Assignment, Question } from '../../types/models';

export default function PlayAssignment() {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Sync any pending answers when back online
      syncPendingAnswers(async (answer) => {
        const fn = httpsCallable(functions, 'scoreAnswer');
        await fn(answer);
      });
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!assignmentId) return;

    const load = async () => {
      const assignDoc = await getDoc(doc(db, 'assignments', assignmentId));
      if (!assignDoc.exists()) return;

      const assignData = { id: assignDoc.id, ...assignDoc.data() } as Assignment;
      setAssignment(assignData);

      const now = Date.now();
      if (now < assignData.startAt || now > assignData.endAt) return;

      const q = query(collection(db, 'questions'), where('quizId', '==', assignData.quizId));
      const snapshot = await getDocs(q);
      setQuestions(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Question[]);
    };
    load();
  }, [assignmentId]);

  const submitCurrentAnswer = async () => {
    const question = questions[currentIndex];
    if (!question || !assignmentId) return;

    setAnswers({ ...answers, [question.id]: selectedAnswer });

    if (isOnline) {
      try {
        const fn = httpsCallable(functions, 'scoreAnswer');
        await fn({
          sessionId: assignmentId,
          questionId: question.id,
          playerId: 'assignment-player',
          selection: selectedAnswer,
          timeMs: 0,
        });
      } catch {
        await queueAnswer({
          sessionId: assignmentId,
          questionId: question.id,
          playerId: 'assignment-player',
          selection: selectedAnswer,
          timeMs: 0,
        });
      }
    } else {
      await queueAnswer({
        sessionId: assignmentId,
        questionId: question.id,
        playerId: 'assignment-player',
        selection: selectedAnswer,
        timeMs: 0,
      });
    }

    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setSelectedAnswer('');
    } else {
      setSubmitted(true);
    }
  };

  if (!assignment) return <p>Loading assignment...</p>;

  const now = Date.now();
  if (now < assignment.startAt) return <p>This assignment hasn't started yet.</p>;
  if (now > assignment.endAt) return <p>This assignment has ended.</p>;

  if (submitted) {
    return (
      <div>
        <h1>Assignment Complete!</h1>
        <p>Your answers have been {isOnline ? 'submitted' : 'saved offline and will sync when you reconnect'}.</p>
      </div>
    );
  }

  if (questions.length === 0) return <p>Loading questions...</p>;

  const question = questions[currentIndex];

  return (
    <div>
      {!isOnline && (
        <div style={{ background: '#fff3cd', padding: '0.5rem', textAlign: 'center' }}>
          You're offline. Answers will be synced when you reconnect.
        </div>
      )}

      <h2>Question {currentIndex + 1} of {questions.length}</h2>
      <p>{question.text}</p>
      {question.imageUrl && (
        <img src={question.imageUrl} alt="" style={{ maxWidth: '100%', maxHeight: '200px' }} />
      )}

      {question.type !== 'short' ? (
        <div>
          {question.options.map((opt, i) => (
            <button
              key={i}
              onClick={() => setSelectedAnswer(opt)}
              style={{
                display: 'block',
                width: '100%',
                margin: '0.5rem 0',
                padding: '1rem',
                backgroundColor: selectedAnswer === opt ? '#4CAF50' : '#eee',
                color: selectedAnswer === opt ? 'white' : 'black',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
              }}
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
          style={{ width: '100%', padding: '0.75rem', fontSize: '1.1rem' }}
        />
      )}

      <button
        onClick={submitCurrentAnswer}
        disabled={!selectedAnswer}
        style={{ width: '100%', padding: '1rem', marginTop: '1rem' }}
      >
        {currentIndex < questions.length - 1 ? 'Next' : 'Finish'}
      </button>
    </div>
  );
}
