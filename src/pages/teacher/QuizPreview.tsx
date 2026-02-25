import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import {
  ArrowLeft, Eye, ChevronLeft, ChevronRight, Clock, Flame, Trophy,
  Triangle, Diamond, Circle, Square, Hexagon, Star, Check, X as XIcon, Zap
} from 'lucide-react';
import CodeBlock from '../../components/CodeBlock';
import type { Quiz, Question } from '../../types/models';

const answerColors = [
  'bg-answer-red',
  'bg-answer-blue',
  'bg-answer-yellow',
  'bg-answer-green',
  'bg-answer-purple',
  'bg-answer-orange',
];

const answerIcons = [
  <Triangle key="t" className="w-5 h-5 shrink-0" />,
  <Diamond key="d" className="w-5 h-5 shrink-0" />,
  <Circle key="c" className="w-5 h-5 shrink-0" />,
  <Square key="s" className="w-5 h-5 shrink-0" />,
  <Hexagon key="h" className="w-5 h-5 shrink-0" />,
  <Star key="st" className="w-5 h-5 shrink-0" />,
];

type PreviewState = 'answering' | 'revealed';

export default function QuizPreview() {
  const { quizId } = useParams<{ quizId: string }>();
  const navigate = useNavigate();

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState('');
  const [selectedAnswers, setSelectedAnswers] = useState<string[]>([]);
  const [matchingPairs, setMatchingPairs] = useState<Record<string, string>>({});
  const [fillAnswers, setFillAnswers] = useState<string[]>([]);
  const [shuffledMatchOptions, setShuffledMatchOptions] = useState<string[]>([]);
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
      setSelectedAnswers([]);
      setMatchingPairs({});
      setFillAnswers([]);
      setState('answering');
      setPointsEarned(0);
      setStreakBonus(0);
      if (q.type === 'matching' && q.matchOptions) {
        setShuffledMatchOptions([...q.matchOptions].sort(() => Math.random() - 0.5));
      }
      if (q.type === 'fill_blank') {
        const blankCount = (q.text.match(/___/g) || []).length;
        setFillAnswers(Array(blankCount).fill(''));
      }
    }
  }, [currentIndex, questions]);

  // Countdown
  useEffect(() => {
    if (state !== 'answering' || timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          // Time's up — no points, break streak
          setPointsEarned(0);
          setStreakBonus(0);
          setStreak(0);
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
    const q = questions[currentIndex];
    if (q?.type === 'mcq' && q.correctAnswers.length > 1) {
      setSelectedAnswers((prev) =>
        prev.includes(opt) ? prev.filter((a) => a !== opt) : [...prev, opt]
      );
    } else {
      setSelectedAnswer(opt);
    }
  };

  const calculatePoints = (timeRemaining: number) => {
    const q = questions[currentIndex];
    let correct = false;
    if (q.type === 'matching') {
      correct = q.options.every((left, idx) => matchingPairs[left] === q.matchOptions?.[idx]);
    } else if (q.type === 'fill_blank') {
      correct = fillAnswers.length === q.correctAnswers.length &&
        fillAnswers.every((a, idx) => a.trim().toLowerCase() === q.correctAnswers[idx].trim().toLowerCase());
    } else if (q.type === 'mcq' && q.correctAnswers.length > 1) {
      correct = selectedAnswers.length === q.correctAnswers.length &&
        selectedAnswers.every((a) => q.correctAnswers.includes(a)) &&
        q.correctAnswers.every((a) => selectedAnswers.includes(a));
    } else if (q.type === 'code_output') {
      correct = q.correctAnswers.some((a) => a.trim().toLowerCase() === selectedAnswer.trim().toLowerCase());
    } else {
      correct = q.correctAnswers.includes(selectedAnswer);
    }
    if (!correct) {
      setPointsEarned(0);
      setStreakBonus(0);
      setStreak(0);
      return;
    }
    const timeFactor = Math.max(0, timeRemaining / q.timeLimitSec);
    const basePoints = Math.round(1000 * timeFactor);
    const newStreak = streak + 1;
    const bonus = newStreak * 50;
    const total = basePoints + bonus;
    setPointsEarned(total);
    setStreakBonus(bonus);
    setStreak(newStreak);
    setTotalPoints((prev) => prev + total);
  };

  const canSubmitPreview = (): boolean => {
    const q = questions[currentIndex];
    if (!q) return false;
    if (q.type === 'mcq' && q.correctAnswers.length > 1) return selectedAnswers.length > 0;
    if (q.type === 'matching') return q.options.every((opt) => matchingPairs[opt]?.trim());
    if (q.type === 'fill_blank') return fillAnswers.every((a) => a.trim());
    return selectedAnswer !== '';
  };

  const handleSubmit = () => {
    calculatePoints(timeLeft);
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
      <div className="min-h-screen bg-surface-dark flex items-center justify-center text-gray-900 dark:text-white text-center p-6">
        <div>
          <Eye className="w-14 h-14 mx-auto mb-4 text-gray-400 dark:text-white/40" />
          <h1 className="text-2xl font-bold mb-2">No questions to preview</h1>
          <p className="text-gray-500 dark:text-white/50 mb-6">Add some questions first, then come back to preview.</p>
          <button onClick={() => navigate(`/quiz/${quizId}`)} className="px-6 py-3 bg-brand text-white font-semibold rounded-xl hover:bg-brand-dark transition-colors">
            Go to Editor
          </button>
        </div>
      </div>
    );
  }

  const question = questions[currentIndex];
  const isCorrect = (opt: string) => question.correctAnswers.includes(opt);
  const isMultiAnswer = question.type === 'mcq' && question.correctAnswers.length > 1;
  const isAnswerCorrect = (): boolean => {
    if (question.type === 'matching') {
      return question.options.every((left, idx) => matchingPairs[left] === question.matchOptions?.[idx]);
    }
    if (question.type === 'fill_blank') {
      return fillAnswers.length === question.correctAnswers.length &&
        fillAnswers.every((a, idx) => a.trim().toLowerCase() === question.correctAnswers[idx].trim().toLowerCase());
    }
    if (isMultiAnswer) {
      return selectedAnswers.length === question.correctAnswers.length &&
        selectedAnswers.every((a) => question.correctAnswers.includes(a)) &&
        question.correctAnswers.every((a) => selectedAnswers.includes(a));
    }
    if (question.type === 'code_output') {
      return question.correctAnswers.some((a) => a.trim().toLowerCase() === selectedAnswer.trim().toLowerCase());
    }
    return question.correctAnswers.includes(selectedAnswer);
  };
  const hasAnswer = (): boolean => {
    if (question.type === 'matching') return question.options.some((opt) => matchingPairs[opt]);
    if (question.type === 'fill_blank') return fillAnswers.some((a) => a.trim());
    if (isMultiAnswer) return selectedAnswers.length > 0;
    return selectedAnswer !== '';
  };

  return (
    <div className="min-h-screen bg-surface-dark flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-white/10">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-gray-500 dark:text-white/50 hover:text-gray-900 dark:hover:text-white text-sm transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Exit Preview
        </button>
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-warning" />
          <span className="text-warning text-sm font-medium">Preview Mode</span>
        </div>
        <span className="text-gray-400 dark:text-white/40 text-sm">
          {currentIndex + 1} / {questions.length}
        </span>
      </div>

      {/* Score bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 dark:border-white/5">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-white/50">
            <Trophy className="w-3.5 h-3.5 text-warning" />
            <span className="font-bold text-gray-900 dark:text-white tabular-nums">{totalPoints.toLocaleString()}</span>
            <span>pts</span>
          </span>
          {streak > 0 && (
            <span className="flex items-center gap-1 text-xs px-2 py-0.5 bg-warning/20 text-warning rounded-full font-medium">
              <Flame className="w-3 h-3" />
              {streak} streak
            </span>
          )}
        </div>
        <span className="flex items-center gap-1 text-xs text-gray-300 dark:text-white/30">
          <Zap className="w-3 h-3" />
          Max 1000 + streak bonus
        </span>
      </div>

      {/* Timer + Question type */}
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-gray-500 dark:text-white/50 text-sm flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" />
          {question.timeLimitSec}s limit
        </span>
        <div className={`text-3xl font-black tabular-nums ${
          state === 'answering' && timeLeft <= 5 ? 'text-danger animate-timer-pulse' :
          state === 'revealed' ? 'text-gray-300 dark:text-white/30' : 'text-gray-900 dark:text-white'
        }`}>
          {timeLeft}
        </div>
        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-white/50 capitalize">
          {question.type === 'mcq' ? (isMultiAnswer ? 'Multiple Answer' : 'Multiple Choice') : question.type === 'tf' ? 'True / False' : question.type === 'matching' ? 'Matching' : question.type === 'fill_blank' ? 'Fill Blank' : question.type === 'code_output' ? 'Code Output' : 'Short Answer'}
        </span>
      </div>

      {/* Progress bar */}
      <div className="px-4 mb-2">
        <div className="h-1 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-brand rounded-full transition-all duration-500"
            style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Question content */}
      <div className="flex-1 flex flex-col px-4 pb-4">
        <div className="text-center py-6 animate-fade-in">
          <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">{question.text}</h2>
          {question.imageUrl && (
            <img src={question.imageUrl} alt="" className="max-h-48 mx-auto mt-4 rounded-xl" />
          )}
        </div>

        {/* Answer options */}
        {(question.type === 'mcq' || question.type === 'tf') && (
          <>
            {isMultiAnswer && state === 'answering' && (
              <p className="text-center text-gray-500 dark:text-white/50 text-sm mb-2 animate-fade-in">Select all that apply</p>
            )}
            <div className="grid grid-cols-2 gap-3 flex-1 max-h-[400px]">
              {question.options.map((opt, i) => {
                const correct = isCorrect(opt);
                const selected = isMultiAnswer ? selectedAnswers.includes(opt) : selectedAnswer === opt;
                const revealed = state === 'revealed';

                return (
                  <button
                    key={i}
                    onClick={() => handleSelect(opt)}
                    disabled={revealed}
                    className={`rounded-2xl text-white font-bold text-lg flex items-center justify-center gap-2 transition-all relative ${
                      answerColors[i % answerColors.length]
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
                    {isMultiAnswer && selected && !revealed ? (
                      <Check className="w-5 h-5 shrink-0" />
                    ) : (
                      answerIcons[i % answerIcons.length]
                    )}
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
          </>
        )}

        {question.type === 'short' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <input
              type="text"
              value={selectedAnswer}
              onChange={(e) => state === 'answering' && setSelectedAnswer(e.target.value)}
              placeholder="Type your answer..."
              disabled={state === 'revealed'}
              className="w-full max-w-md text-center text-2xl font-bold px-6 py-5 rounded-2xl border-2 border-gray-300 dark:border-white/20 bg-gray-100 dark:bg-white/10 text-gray-900 dark:text-white placeholder:text-gray-300 dark:placeholder:text-white/30 focus:border-brand outline-none backdrop-blur"
              autoFocus
            />
            {state === 'revealed' && (
              <div className="bg-gray-100 dark:bg-white/10 backdrop-blur rounded-xl px-5 py-3 animate-fade-in">
                <p className="text-gray-500 dark:text-white/50 text-sm mb-1">Accepted answers:</p>
                <p className="text-success font-bold">{question.correctAnswers.join(', ')}</p>
              </div>
            )}
          </div>
        )}

        {/* Code Output Preview */}
        {question.type === 'code_output' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            {question.codeSnippet && (
              <CodeBlock code={question.codeSnippet} language={question.codeLanguage} className="w-full max-w-lg" />
            )}
            <input
              type="text"
              value={selectedAnswer}
              onChange={(e) => state === 'answering' && setSelectedAnswer(e.target.value)}
              placeholder="What will this code output?"
              disabled={state === 'revealed'}
              className="w-full max-w-md text-center text-2xl font-bold px-6 py-5 rounded-2xl border-2 border-gray-300 dark:border-white/20 bg-gray-100 dark:bg-white/10 text-gray-900 dark:text-white placeholder:text-gray-300 dark:placeholder:text-white/30 focus:border-brand outline-none backdrop-blur"
              autoFocus
            />
            {state === 'revealed' && (
              <div className="bg-gray-100 dark:bg-white/10 backdrop-blur rounded-xl px-5 py-3 animate-fade-in">
                <p className="text-gray-500 dark:text-white/50 text-sm mb-1">Accepted outputs:</p>
                <p className="text-success font-bold">{question.correctAnswers.join(', ')}</p>
              </div>
            )}
          </div>
        )}

        {/* Matching Preview */}
        {question.type === 'matching' && (
          <div className="flex-1 space-y-3 max-w-md mx-auto w-full">
            {question.options.map((left, i) => {
              const revealed = state === 'revealed';
              const pairCorrect = revealed && matchingPairs[left] === question.matchOptions?.[i];
              const pairWrong = revealed && matchingPairs[left] && matchingPairs[left] !== question.matchOptions?.[i];
              return (
                <div key={i} className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${
                  pairCorrect ? 'border-success bg-success/10' :
                  pairWrong ? 'border-danger bg-danger/10' :
                  matchingPairs[left] ? 'border-brand/50 bg-gray-50 dark:bg-white/5' : 'border-gray-200 dark:border-white/10'
                }`}>
                  <span className={`font-bold text-white px-3 py-1.5 rounded-lg text-sm shrink-0 ${answerColors[i % answerColors.length]}`}>
                    {left}
                  </span>
                  <span className="text-gray-300 dark:text-white/30">&rarr;</span>
                  <select
                    value={matchingPairs[left] || ''}
                    onChange={(e) => state === 'answering' && setMatchingPairs({ ...matchingPairs, [left]: e.target.value })}
                    disabled={revealed}
                    className="flex-1 px-3 py-2 rounded-lg bg-gray-100 dark:bg-white/10 text-gray-900 dark:text-white border border-gray-300 dark:border-white/20 outline-none focus:border-brand"
                  >
                    <option value="" className="bg-gray-800 dark:bg-gray-800">Select...</option>
                    {shuffledMatchOptions.map((right) => (
                      <option key={right} value={right} className="bg-gray-800 dark:bg-gray-800">{right}</option>
                    ))}
                  </select>
                  {pairCorrect && <Check className="w-5 h-5 text-success shrink-0" />}
                  {pairWrong && <XIcon className="w-5 h-5 text-danger shrink-0" />}
                </div>
              );
            })}
            {state === 'revealed' && (
              <div className="bg-gray-100 dark:bg-white/10 backdrop-blur rounded-xl px-5 py-3 animate-fade-in mt-4">
                <p className="text-gray-500 dark:text-white/50 text-sm mb-2">Correct pairs:</p>
                {question.options.map((left, i) => (
                  <p key={i} className="text-success font-medium text-sm">{left} &rarr; {question.matchOptions?.[i]}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Fill in the Blank Preview */}
        {question.type === 'fill_blank' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <div className="text-lg text-gray-900 dark:text-white leading-relaxed text-center max-w-lg">
              {question.text.split('___').map((part, i, arr) => (
                <span key={i}>
                  {part}
                  {i < arr.length - 1 && (
                    <span className="inline-block mx-1">
                      <input
                        type="text"
                        value={fillAnswers[i] || ''}
                        onChange={(e) => {
                          if (state !== 'answering') return;
                          const newAnswers = [...fillAnswers];
                          newAnswers[i] = e.target.value;
                          setFillAnswers(newAnswers);
                        }}
                        disabled={state === 'revealed'}
                        placeholder={`Blank ${i + 1}`}
                        className={`inline-block w-32 px-2 py-1 text-center font-bold rounded-lg border-2 bg-gray-100 dark:bg-white/10 text-gray-900 dark:text-white placeholder:text-gray-300 dark:placeholder:text-white/30 outline-none ${
                          state === 'revealed'
                            ? fillAnswers[i]?.trim().toLowerCase() === question.correctAnswers[i]?.trim().toLowerCase()
                              ? 'border-success'
                              : 'border-danger'
                            : 'border-brand/50 focus:border-brand'
                        }`}
                      />
                    </span>
                  )}
                </span>
              ))}
            </div>
            {state === 'revealed' && (
              <div className="bg-gray-100 dark:bg-white/10 backdrop-blur rounded-xl px-5 py-3 animate-fade-in">
                <p className="text-gray-500 dark:text-white/50 text-sm mb-1">Correct answers:</p>
                <p className="text-success font-bold">{question.correctAnswers.join(', ')}</p>
              </div>
            )}
          </div>
        )}

        {/* Submit / Reveal button */}
        {state === 'answering' && canSubmitPreview() && (
          <button
            onClick={handleSubmit}
            className="mt-4 py-4 bg-white dark:bg-white text-surface-dark dark:text-surface-dark font-black text-lg rounded-2xl hover:bg-gray-100 dark:hover:bg-gray-100 transition-all shadow-lg animate-slide-up"
          >
            Submit Answer
          </button>
        )}

        {/* Reveal info with scoring */}
        {state === 'revealed' && (
          <div className="mt-4 animate-fade-in">
            {/* Result text */}
            <div className="text-center mb-3">
              {hasAnswer() && isAnswerCorrect() ? (
                <p className="text-success font-bold text-lg">Correct!</p>
              ) : hasAnswer() ? (
                <p className="text-danger font-bold text-lg">
                  Wrong{question.type !== 'matching' ? ` — correct: ${question.correctAnswers.join(', ')}` : ''}
                </p>
              ) : (
                <p className="text-gray-500 dark:text-white/50 font-medium">
                  Time's up!{question.type !== 'matching' ? ` Correct: ${question.correctAnswers.join(', ')}` : ''}
                </p>
              )}
            </div>

            {/* Points breakdown */}
            <div className="bg-gray-50 dark:bg-white/5 backdrop-blur rounded-xl p-4 max-w-sm mx-auto">
              <div className="text-center mb-3">
                <span className="text-3xl font-black text-gray-900 dark:text-white animate-bounce-in inline-block">
                  +{pointsEarned}
                </span>
                <span className="text-gray-400 dark:text-white/40 text-sm ml-1">pts</span>
              </div>
              {pointsEarned > 0 && (
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between text-gray-500 dark:text-white/50">
                    <span className="flex items-center gap-1.5">
                      <Zap className="w-3 h-3 text-brand-light" />
                      Base (speed)
                    </span>
                    <span className="text-gray-900 dark:text-white font-medium tabular-nums">{pointsEarned - streakBonus}</span>
                  </div>
                  {streakBonus > 0 && (
                    <div className="flex justify-between text-gray-500 dark:text-white/50">
                      <span className="flex items-center gap-1.5">
                        <Flame className="w-3 h-3 text-warning" />
                        Streak x{streak}
                      </span>
                      <span className="text-warning font-medium tabular-nums">+{streakBonus}</span>
                    </div>
                  )}
                  <div className="border-t border-gray-200 dark:border-white/10 pt-1.5 flex justify-between text-gray-600 dark:text-white/70 font-medium">
                    <span>Time remaining</span>
                    <span className="tabular-nums">{timeLeft}s / {question.timeLimitSec}s</span>
                  </div>
                </div>
              )}
              {pointsEarned === 0 && hasAnswer() && (
                <p className="text-center text-gray-300 dark:text-white/30 text-xs">Wrong answer = 0 points, streak reset</p>
              )}
              {pointsEarned === 0 && !hasAnswer() && (
                <p className="text-center text-gray-300 dark:text-white/30 text-xs">No answer = 0 points, streak reset</p>
              )}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200 dark:border-white/10">
          <button
            onClick={goPrev}
            disabled={currentIndex === 0}
            className="flex items-center gap-1 px-4 py-2.5 rounded-xl text-sm font-medium text-gray-500 dark:text-white/60 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
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
                  i === currentIndex ? 'bg-brand scale-125' : 'bg-gray-200 dark:bg-white/20 hover:bg-gray-400 dark:hover:bg-white/40'
                }`}
              />
            ))}
          </div>
          <button
            onClick={goNext}
            disabled={currentIndex === questions.length - 1}
            className="flex items-center gap-1 px-4 py-2.5 rounded-xl text-sm font-medium text-gray-500 dark:text-white/60 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
