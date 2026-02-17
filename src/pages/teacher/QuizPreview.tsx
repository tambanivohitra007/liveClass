import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import {
  ArrowLeft, Eye, ChevronLeft, ChevronRight, Clock, Flame, Trophy,
  Triangle, Diamond, Circle, Square, Check, X as XIcon, Zap
} from 'lucide-react';
import type { Quiz, Question } from '../../types/models';

const answerColors = [
  'bg-answer-red',
  'bg-answer-blue',
  'bg-answer-yellow',
  'bg-answer-green',
];

const answerIcons = [
  <Triangle key="t" className="w-5 h-5 shrink-0" />,
  <Diamond key="d" className="w-5 h-5 shrink-0" />,
  <Circle key="c" className="w-5 h-5 shrink-0" />,
  <Square key="s" className="w-5 h-5 shrink-0" />,
];

type PreviewState = 'answering' | 'revealed';

export default function QuizPreview() {
  const { quizId } = useParams<{ quizId: string }>();
  const navigate = useNavigate();

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState('');
  const [state, setState] = useState<PreviewState>('answering');
  const [timeLeft, setTimeLeft] = useState(0);
  const [loading, setLoading] = useState(true);

  // Scoring
  const [pointsEarned, setPointsEarned] = useState(0);
  const [totalPoints, setTotalPoints] = useState(0);
  const [streak, setStreak] = useState(0);
  const [streakBonus, setStreakBonus] = useState(0);

  useEffect(() => {
    if (!quizId) return;
    const load = async () => {
      const quizDoc = await getDoc(doc(db, 'quizzes', quizId));
      if (quizDoc.exists()) {
        setQuiz({ id: quizDoc.id, ...quizDoc.data() } as Quiz);
      }
      const q = query(collection(db, 'questions'), where('quizId', '==', quizId));
      const snap = await getDocs(q);
      setQuestions(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Question[]);
      setLoading(false);
    };
    load();
  }, [quizId]);

  // Start timer when question changes
  useEffect(() => {
    if (questions.length === 0) return;
    const q = questions[currentIndex];
    if (q) {
      setTimeLeft(q.timeLimitSec);
      setSelectedAnswer('');
      setState('answering');
      setPointsEarned(0);
      setStreakBonus(0);
    }
  }, [currentIndex, questions]);

  // Countdown
  useEffect(() => {
    if (state !== 'answering' || timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          setState('revealed');
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [state, timeLeft]);

  const handleSelect = (opt: string) => {
    if (state !== 'answering') return;
    setSelectedAnswer(opt);
  };

  const calculatePoints = (answer: string, timeRemaining: number) => {
    const correct = question.correctAnswers.includes(answer);
    if (!correct) {
      setPointsEarned(0);
      setStreakBonus(0);
      setStreak(0);
      return;
    }
    const timeFactor = Math.max(0, timeRemaining / question.timeLimitSec);
    const basePoints = Math.round(1000 * timeFactor);
    const newStreak = streak + 1;
    const bonus = newStreak * 50;
    const total = basePoints + bonus;
    setPointsEarned(total);
    setStreakBonus(bonus);
    setStreak(newStreak);
    setTotalPoints((prev) => prev + total);
  };

  const handleSubmit = () => {
    calculatePoints(selectedAnswer, timeLeft);
    setState('revealed');
  };

  const goNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const goPrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-dark flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-brand/30 border-t-brand rounded-full animate-spin" />
      </div>
    );
  }

  if (!quiz || questions.length === 0) {
    return (
      <div className="min-h-screen bg-surface-dark flex items-center justify-center text-white text-center p-6">
        <div>
          <Eye className="w-14 h-14 mx-auto mb-4 text-white/40" />
          <h1 className="text-2xl font-bold mb-2">No questions to preview</h1>
          <p className="text-white/50 mb-6">Add some questions first, then come back to preview.</p>
          <button onClick={() => navigate(`/quiz/${quizId}`)} className="px-6 py-3 bg-brand text-white font-semibold rounded-xl hover:bg-brand-dark transition-colors">
            Go to Editor
          </button>
        </div>
      </div>
    );
  }

  const question = questions[currentIndex];
  const isCorrect = (opt: string) => question.correctAnswers.includes(opt);

  return (
    <div className="min-h-screen bg-surface-dark flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-white/50 hover:text-white text-sm transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Exit Preview
        </button>
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-warning" />
          <span className="text-warning text-sm font-medium">Preview Mode</span>
        </div>
        <span className="text-white/40 text-sm">
          {currentIndex + 1} / {questions.length}
        </span>
      </div>

      {/* Timer + Question number */}
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-white/50 text-sm flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" />
          {question.timeLimitSec}s limit
        </span>
        <div className={`text-3xl font-black tabular-nums ${
          state === 'answering' && timeLeft <= 5 ? 'text-danger animate-timer-pulse' :
          state === 'revealed' ? 'text-white/30' : 'text-white'
        }`}>
          {timeLeft}
        </div>
        <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-white/50 capitalize">
          {question.type === 'mcq' ? 'Multiple Choice' : question.type === 'tf' ? 'True / False' : 'Short Answer'}
        </span>
      </div>

      {/* Progress bar */}
      <div className="px-4 mb-2">
        <div className="h-1 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-brand rounded-full transition-all duration-500"
            style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Question content */}
      <div className="flex-1 flex flex-col px-4 pb-4">
        <div className="text-center py-6 animate-fade-in">
          <h2 className="text-xl md:text-2xl font-bold text-white">{question.text}</h2>
          {question.imageUrl && (
            <img src={question.imageUrl} alt="" className="max-h-48 mx-auto mt-4 rounded-xl" />
          )}
        </div>

        {/* Answer options */}
        {question.type !== 'short' ? (
          <div className="grid grid-cols-2 gap-3 flex-1 max-h-[400px]">
            {question.options.map((opt, i) => {
              const correct = isCorrect(opt);
              const selected = selectedAnswer === opt;
              const revealed = state === 'revealed';

              return (
                <button
                  key={i}
                  onClick={() => handleSelect(opt)}
                  disabled={revealed}
                  className={`rounded-2xl text-white font-bold text-lg flex items-center justify-center gap-2 transition-all relative ${
                    answerColors[i % 4]
                  } ${
                    selected && !revealed ? 'ring-4 ring-white scale-95' : ''
                  } ${
                    revealed && correct ? 'ring-4 ring-success scale-95 brightness-110' : ''
                  } ${
                    revealed && selected && !correct ? 'ring-4 ring-danger scale-95 opacity-60' : ''
                  } ${
                    revealed && !correct && !selected ? 'opacity-40' : ''
                  } ${
                    !revealed ? 'active:scale-95' : ''
                  }`}
                >
                  {answerIcons[i % 4]}
                  <span className="truncate px-2">{opt}</span>
                  {revealed && correct && (
                    <div className="absolute top-2 right-2 w-6 h-6 bg-success rounded-full flex items-center justify-center">
                      <Check className="w-3.5 h-3.5" />
                    </div>
                  )}
                  {revealed && selected && !correct && (
                    <div className="absolute top-2 right-2 w-6 h-6 bg-danger rounded-full flex items-center justify-center">
                      <XIcon className="w-3.5 h-3.5" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <input
              type="text"
              value={selectedAnswer}
              onChange={(e) => state === 'answering' && setSelectedAnswer(e.target.value)}
              placeholder="Type your answer..."
              disabled={state === 'revealed'}
              className="w-full max-w-md text-center text-2xl font-bold px-6 py-5 rounded-2xl border-2 border-white/20 bg-white/10 text-white placeholder:text-white/30 focus:border-brand outline-none backdrop-blur"
              autoFocus
            />
            {state === 'revealed' && (
              <div className="bg-white/10 backdrop-blur rounded-xl px-5 py-3 animate-fade-in">
                <p className="text-white/50 text-sm mb-1">Accepted answers:</p>
                <p className="text-success font-bold">{question.correctAnswers.join(', ')}</p>
              </div>
            )}
          </div>
        )}

        {/* Submit / Reveal button */}
        {state === 'answering' && selectedAnswer && (
          <button
            onClick={handleSubmit}
            className="mt-4 py-4 bg-white text-surface-dark font-black text-lg rounded-2xl hover:bg-gray-100 transition-all shadow-lg animate-slide-up"
          >
            Submit Answer
          </button>
        )}

        {/* Reveal info */}
        {state === 'revealed' && question.type !== 'short' && (
          <div className="mt-4 text-center animate-fade-in">
            {selectedAnswer && isCorrect(selectedAnswer) ? (
              <p className="text-success font-bold text-lg">Correct!</p>
            ) : selectedAnswer ? (
              <p className="text-danger font-bold text-lg">
                Wrong — correct: {question.correctAnswers.join(', ')}
              </p>
            ) : (
              <p className="text-white/50 font-medium">
                Time's up! Correct: {question.correctAnswers.join(', ')}
              </p>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-white/10">
          <button
            onClick={goPrev}
            disabled={currentIndex === 0}
            className="flex items-center gap-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white/60 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </button>
          <div className="flex gap-1.5">
            {questions.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentIndex(i)}
                className={`w-2.5 h-2.5 rounded-full transition-all ${
                  i === currentIndex ? 'bg-brand scale-125' : 'bg-white/20 hover:bg-white/40'
                }`}
              />
            ))}
          </div>
          <button
            onClick={goNext}
            disabled={currentIndex === questions.length - 1}
            className="flex items-center gap-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white/60 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
