import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../lib/firebase';
import { queueAnswer, syncPendingAnswers } from '../../lib/offlineQueue';
import type { Assignment, Question } from '../../types/models';

const answerColors = [
  'bg-answer-red hover:brightness-110',
  'bg-answer-blue hover:brightness-110',
  'bg-answer-yellow hover:brightness-110',
  'bg-answer-green hover:brightness-110',
];

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
      syncPendingAnswers(async (answer) => {
        await httpsCallable(functions, 'scoreAnswer')(answer);
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
      if (Date.now() < assignData.startAt || Date.now() > assignData.endAt) return;
      const q = query(collection(db, 'questions'), where('quizId', '==', assignData.quizId));
      setQuestions((await getDocs(q)).docs.map((d) => ({ id: d.id, ...d.data() })) as Question[]);
    };
    load();
  }, [assignmentId]);

  const submitCurrentAnswer = async () => {
    const question = questions[currentIndex];
    if (!question || !assignmentId) return;
    setAnswers({ ...answers, [question.id]: selectedAnswer });

    const answerData = {
      sessionId: assignmentId, questionId: question.id,
      playerId: 'assignment-player', selection: selectedAnswer, timeMs: 0,
    };

    if (isOnline) {
      try { await httpsCallable(functions, 'scoreAnswer')(answerData); }
      catch { await queueAnswer(answerData); }
    } else {
      await queueAnswer(answerData);
    }

    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setSelectedAnswer('');
    } else {
      setSubmitted(true);
    }
  };

  if (!assignment) {
    return (
      <div className="min-h-screen bg-surface-dark flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-brand/30 border-t-brand rounded-full animate-spin" />
      </div>
    );
  }

  const now = Date.now();
  if (now < assignment.startAt) {
    return (
      <div className="min-h-screen bg-surface-dark flex items-center justify-center text-white text-center p-6">
        <div>
          <span className="text-5xl mb-4 block">&#9200;</span>
          <h1 className="text-2xl font-bold mb-2">Not yet available</h1>
          <p className="text-white/50">This assignment hasn't started yet.</p>
        </div>
      </div>
    );
  }
  if (now > assignment.endAt) {
    return (
      <div className="min-h-screen bg-surface-dark flex items-center justify-center text-white text-center p-6">
        <div>
          <span className="text-5xl mb-4 block">&#128683;</span>
          <h1 className="text-2xl font-bold mb-2">Assignment Closed</h1>
          <p className="text-white/50">This assignment has ended.</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-surface-dark flex items-center justify-center text-white text-center p-6">
        <div className="animate-bounce-in">
          <span className="text-6xl mb-4 block">&#10004;&#65039;</span>
          <h1 className="text-3xl font-black mb-2">All Done!</h1>
          <p className="text-white/50">
            {isOnline ? 'Your answers have been submitted.' : 'Answers saved offline — they\'ll sync when you reconnect.'}
          </p>
        </div>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="min-h-screen bg-surface-dark flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-brand/30 border-t-brand rounded-full animate-spin" />
      </div>
    );
  }

  const question = questions[currentIndex];

  return (
    <div className="min-h-screen bg-surface-dark flex flex-col">
      {/* Offline banner */}
      {!isOnline && (
        <div className="bg-warning/20 text-warning text-center text-sm py-2 font-medium">
          You're offline — answers will sync when you reconnect
        </div>
      )}

      {/* Progress */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center justify-between text-sm text-white/50 mb-2">
          <span>Question {currentIndex + 1} of {questions.length}</span>
          <span>Assignment</span>
        </div>
        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-brand rounded-full transition-all duration-500"
            style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Question */}
      <div className="flex-1 flex flex-col px-4 pb-4">
        <div className="text-center py-8 animate-fade-in">
          <h2 className="text-xl md:text-2xl font-bold text-white">{question.text}</h2>
          {question.imageUrl && (
            <img src={question.imageUrl} alt="" className="max-h-40 mx-auto mt-4 rounded-xl" />
          )}
        </div>

        {question.type !== 'short' ? (
          <div className="grid grid-cols-2 gap-3 flex-1 max-h-[400px]">
            {question.options.map((opt, i) => (
              <button
                key={i}
                onClick={() => setSelectedAnswer(opt)}
                className={`rounded-2xl text-white font-bold text-lg flex items-center justify-center transition-all ${
                  answerColors[i % 4]
                } ${selectedAnswer === opt ? 'ring-4 ring-white scale-95' : 'active:scale-95'}`}
              >
                {opt}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex-1 flex items-center">
            <input
              type="text"
              value={selectedAnswer}
              onChange={(e) => setSelectedAnswer(e.target.value)}
              placeholder="Type your answer..."
              className="w-full max-w-md mx-auto text-center text-2xl font-bold px-6 py-5 rounded-2xl border-2 border-white/20 bg-white/10 text-white placeholder:text-white/30 focus:border-brand outline-none backdrop-blur"
              autoFocus
            />
          </div>
        )}

        {selectedAnswer && (
          <button
            onClick={submitCurrentAnswer}
            className="mt-4 py-4 bg-white text-surface-dark font-black text-lg rounded-2xl hover:bg-gray-100 transition-all shadow-lg animate-slide-up"
          >
            {currentIndex < questions.length - 1 ? 'Next' : 'Finish'}
          </button>
        )}
      </div>
    </div>
  );
}
