import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../lib/firebase';
import { queueAnswer, syncPendingAnswers } from '../../lib/offlineQueue';
import { Clock, Ban, CircleCheckBig, Check } from 'lucide-react';
import CodeBlock from '../../components/CodeBlock';
import type { Assignment, Question } from '../../types/models';

const answerColors = [
  'bg-answer-red hover:brightness-110',
  'bg-answer-blue hover:brightness-110',
  'bg-answer-yellow hover:brightness-110',
  'bg-answer-green hover:brightness-110',
  'bg-answer-purple hover:brightness-110',
  'bg-answer-orange hover:brightness-110',
];

export default function PlayAssignment() {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);

  // Force dark mode for immersive game experience
  useEffect(() => {
    const wasDark = document.documentElement.classList.contains('dark');
    document.documentElement.classList.add('dark');
    return () => { if (!wasDark) document.documentElement.classList.remove('dark'); };
  }, []);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState('');
  const [selectedAnswers, setSelectedAnswers] = useState<string[]>([]);
  const [matchingPairs, setMatchingPairs] = useState<Record<string, string>>({});
  const [fillAnswers, setFillAnswers] = useState<string[]>([]);
  const [shuffledMatchOptions, setShuffledMatchOptions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const doSync = () => syncPendingAnswers(async (answer) => {
      await httpsCallable(functions, 'scoreAnswer')(answer);
    });
    // Sync any pending answers from previous sessions on mount
    if (navigator.onLine) doSync();

    const handleOnline = () => { setIsOnline(true); doSync(); };
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
      try {
        const assignDoc = await getDoc(doc(db, 'assignments', assignmentId));
        if (!assignDoc.exists()) { setLoadError('Assignment not found.'); return; }
        const assignData = { id: assignDoc.id, ...assignDoc.data() } as Assignment;
        setAssignment(assignData);
        if (Date.now() < assignData.startAt || Date.now() > assignData.endAt) return;
        const q = query(collection(db, 'questions'), where('quizId', '==', assignData.quizId));
        setQuestions((await getDocs(q)).docs.map((d) => ({ id: d.id, ...d.data() })) as Question[]);
      } catch {
        setLoadError('Failed to load assignment. Check your connection.');
      }
    };
    load();
  }, [assignmentId]);

  // Reset state when navigating to a new question
  useEffect(() => {
    const q = questions[currentIndex];
    setSelectedAnswer('');
    setSelectedAnswers([]);
    setMatchingPairs({});
    setFillAnswers([]);
    if (q?.type === 'matching' && q.matchOptions) {
      setShuffledMatchOptions([...q.matchOptions].sort(() => Math.random() - 0.5));
    }
    if (q?.type === 'fill_blank') {
      const blankCount = (q.text.match(/___/g) || []).length;
      setFillAnswers(Array(blankCount).fill(''));
    }
  }, [currentIndex, questions]);

  const currentQ = questions[currentIndex];
  const isMultiAnswer = currentQ?.type === 'mcq' && currentQ.correctAnswers.length > 1;

  const getSelection = (): string => {
    const q = questions[currentIndex];
    if (!q) return selectedAnswer;
    if (q.type === 'mcq' && q.correctAnswers.length > 1) return JSON.stringify(selectedAnswers);
    if (q.type === 'matching') return JSON.stringify(matchingPairs);
    if (q.type === 'fill_blank') return JSON.stringify(fillAnswers);
    return selectedAnswer;
  };

  const canSubmit = (): boolean => {
    const q = questions[currentIndex];
    if (!q) return false;
    if (q.type === 'mcq' && q.correctAnswers.length > 1) return selectedAnswers.length > 0;
    if (q.type === 'matching') return q.options.every((opt) => matchingPairs[opt]?.trim());
    if (q.type === 'fill_blank') return fillAnswers.every((a) => a.trim());
    return selectedAnswer !== '';
  };

  const submitCurrentAnswer = async () => {
    const question = questions[currentIndex];
    if (!question || !assignmentId) return;
    const selection = getSelection();
    setAnswers({ ...answers, [question.id]: selection });

    const answerData = {
      sessionId: assignmentId, questionId: question.id,
      playerId: 'assignment-player', selection, timeMs: 0,
    };

    if (isOnline) {
      try { await httpsCallable(functions, 'scoreAnswer')(answerData); }
      catch { await queueAnswer(answerData); }
    } else {
      await queueAnswer(answerData);
    }

    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      setSubmitted(true);
    }
  };

  if (loadError) {
    return (
      <div className="min-h-screen bg-surface-dark flex items-center justify-center text-white text-center p-6">
        <div>
          <Ban className="w-14 h-14 mx-auto mb-4 text-danger" />
          <h1 className="text-2xl font-bold mb-2">Oops!</h1>
          <p className="text-white/50">{loadError}</p>
        </div>
      </div>
    );
  }

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
          <Clock className="w-14 h-14 mx-auto mb-4 text-white/60" />
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
          <Ban className="w-14 h-14 mx-auto mb-4 text-danger" />
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
          <CircleCheckBig className="w-16 h-16 mx-auto mb-4 text-success" />
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

        {(question.type === 'mcq' || question.type === 'tf') && (
          <>
            {isMultiAnswer && (
              <p className="text-center text-white/50 text-sm mb-2 animate-fade-in">Select all that apply</p>
            )}
            <div className="grid grid-cols-2 gap-3 flex-1 max-h-[400px]">
              {question.options.map((opt, i) => {
                const isSelected = isMultiAnswer
                  ? selectedAnswers.includes(opt)
                  : selectedAnswer === opt;
                return (
                  <button
                    key={i}
                    onClick={() => {
                      if (isMultiAnswer) {
                        setSelectedAnswers((prev) =>
                          prev.includes(opt) ? prev.filter((a) => a !== opt) : [...prev, opt]
                        );
                      } else {
                        setSelectedAnswer(opt);
                      }
                    }}
                    className={`rounded-2xl text-white font-bold text-lg flex items-center justify-center transition-all ${
                      answerColors[i % answerColors.length]
                    } ${isSelected ? 'ring-4 ring-white scale-95' : 'active:scale-95'}`}
                  >
                    {isMultiAnswer && isSelected && <Check className="w-5 h-5 shrink-0" />}
                    {opt}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {question.type === 'short' && (
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

        {question.type === 'code_output' && (
          <div className="flex-1 flex flex-col items-center gap-4">
            {question.codeSnippet && (
              <CodeBlock code={question.codeSnippet} language={question.codeLanguage} className="w-full max-w-lg" />
            )}
            <input
              type="text"
              value={selectedAnswer}
              onChange={(e) => setSelectedAnswer(e.target.value)}
              placeholder="What will this code output?"
              className="w-full max-w-md mx-auto text-center text-2xl font-bold px-6 py-5 rounded-2xl border-2 border-white/20 bg-white/10 text-white placeholder:text-white/30 focus:border-brand outline-none backdrop-blur"
              autoFocus
            />
          </div>
        )}

        {/* Matching UI */}
        {question.type === 'matching' && (
          <div className="flex-1 space-y-3 max-w-md mx-auto w-full">
            {question.options.map((left, i) => (
              <div key={i} className={`flex items-center gap-3 p-3 rounded-xl border-2 ${
                matchingPairs[left] ? 'border-brand/50 bg-white/5' : 'border-white/10'
              }`}>
                <span className={`font-bold text-white px-3 py-1.5 rounded-lg text-sm shrink-0 ${answerColors[i % answerColors.length].split(' ')[0]}`}>
                  {left}
                </span>
                <span className="text-white/30">&rarr;</span>
                <select
                  value={matchingPairs[left] || ''}
                  onChange={(e) => setMatchingPairs({ ...matchingPairs, [left]: e.target.value })}
                  className="flex-1 px-3 py-2 rounded-lg bg-white/10 text-white border border-white/20 outline-none focus:border-brand"
                >
                  <option value="" className="bg-gray-800">Select...</option>
                  {shuffledMatchOptions.map((right) => (
                    <option key={right} value={right} className="bg-gray-800">{right}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}

        {/* Fill in the Blank UI */}
        {question.type === 'fill_blank' && (
          <div className="flex-1 flex items-center">
            <div className="w-full max-w-lg mx-auto space-y-4">
              <div className="text-lg text-white leading-relaxed text-center">
                {question.text.split('___').map((part, i, arr) => (
                  <span key={i}>
                    {part}
                    {i < arr.length - 1 && (
                      <input
                        type="text"
                        value={fillAnswers[i] || ''}
                        onChange={(e) => {
                          const newAnswers = [...fillAnswers];
                          newAnswers[i] = e.target.value;
                          setFillAnswers(newAnswers);
                        }}
                        placeholder={`Blank ${i + 1}`}
                        className="inline-block w-32 mx-1 px-2 py-1 text-center font-bold rounded-lg border-2 border-brand/50 bg-white/10 text-white placeholder:text-white/30 outline-none focus:border-brand"
                      />
                    )}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {canSubmit() && (
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
