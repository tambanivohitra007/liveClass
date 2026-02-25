import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { ArrowLeft, Printer, Download, Check } from 'lucide-react';
import type { Question, Quiz } from '../../types/models';

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

const FONT_CLASSES: Record<string, string> = {
  S: 'text-xs',
  M: 'text-sm',
  L: 'text-base',
  XL: 'text-lg',
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function formatAnswer(q: Question): string {
  switch (q.type) {
    case 'mcq':
    case 'tf': {
      const idx = q.options.indexOf(q.correctAnswers[0]);
      return idx >= 0 ? `${LETTERS[idx]}) ${q.correctAnswers[0]}` : q.correctAnswers.join(', ');
    }
    case 'short':
      return q.correctAnswers.join(' or ');
    case 'fill_blank':
      return q.correctAnswers.join(', ');
    case 'matching':
      return q.options.map((left, i) => `${left} → ${q.matchOptions?.[i]}`).join('; ');
    case 'ordering':
      return q.options.map((item, i) => `${i + 1}. ${item}`).join(', ');
    default:
      return q.correctAnswers.join(', ');
  }
}

interface DisplayQuestion extends Question {
  displayOptions: string[];
  displayMatchOptions?: string[];
}

function QuestionBody({ question, showAnswer }: { question: DisplayQuestion; showAnswer: boolean }) {
  const { type, displayOptions, correctAnswers, matchOptions, text } = question;

  if (type === 'mcq' || type === 'tf') {
    return (
      <div className="grid grid-cols-2 gap-x-8 gap-y-1 mt-2">
        {displayOptions.map((opt, i) => {
          const isCorrect = correctAnswers.includes(opt);
          return (
            <div key={i} className={`flex items-start gap-2 py-0.5 ${showAnswer && isCorrect ? 'font-bold text-green-700' : ''}`}>
              <span className="w-5 shrink-0">{LETTERS[i]})</span>
              <span>{opt}</span>
              {showAnswer && isCorrect && <Check className="w-3.5 h-3.5 text-green-700 shrink-0 mt-0.5" />}
            </div>
          );
        })}
      </div>
    );
  }

  if (type === 'short') {
    return (
      <div className="mt-3">
        <div className="border-b border-gray-400 dark:border-gray-400 h-8" />
        {showAnswer && (
          <p className="text-green-700 text-xs mt-1">Answer: {correctAnswers.join(', ')}</p>
        )}
      </div>
    );
  }

  if (type === 'fill_blank') {
    const parts = text.split('___');
    return (
      <div className="mt-2">
        <p>
          {parts.map((part, i) => (
            <span key={i}>
              {part}
              {i < parts.length - 1 && (
                <span className="inline-block w-28 border-b-2 border-gray-400 dark:border-gray-400 mx-1 align-bottom">
                  {showAnswer && (
                    <span className="text-green-700 text-xs">{correctAnswers[i]}</span>
                  )}
                </span>
              )}
            </span>
          ))}
        </p>
      </div>
    );
  }

  if (type === 'matching') {
    const rightSide = question.displayMatchOptions || matchOptions || [];
    return (
      <div className="mt-2">
        <div className="grid grid-cols-2 gap-x-12">
          <div>
            {displayOptions.map((left, i) => (
              <div key={i} className="py-0.5">{i + 1}. {left}</div>
            ))}
          </div>
          <div>
            {rightSide.map((right, i) => (
              <div key={i} className="py-0.5">{LETTERS[i]}) {right}</div>
            ))}
          </div>
        </div>
        {showAnswer && matchOptions && (
          <p className="text-green-700 text-xs mt-2">
            Answers: {displayOptions.map((left, i) => {
              const origIdx = question.options.indexOf(left);
              const rightAnswer = matchOptions[origIdx];
              const rightIdx = rightSide.indexOf(rightAnswer);
              return `${i + 1}-${LETTERS[rightIdx]}`;
            }).join(', ')}
          </p>
        )}
      </div>
    );
  }

  if (type === 'ordering') {
    return (
      <div className="mt-2 space-y-1">
        {displayOptions.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-6 h-6 border border-gray-400 dark:border-gray-400 rounded flex items-center justify-center text-xs text-gray-300 dark:text-gray-300 shrink-0">
              {showAnswer ? (
                <span className="text-green-700 font-bold">{question.options.indexOf(item) + 1}</span>
              ) : null}
            </span>
            <span>{item}</span>
          </div>
        ))}
      </div>
    );
  }

  return null;
}

export default function Worksheet() {
  const { quizId } = useParams<{ quizId: string }>();
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAnswerKey, setShowAnswerKey] = useState(false);
  const [shuffleQuestions, setShuffleQuestions] = useState(false);
  const [shuffleOptions, setShuffleOptions] = useState(false);
  const [fontSize, setFontSize] = useState<string>('L');
  const [shuffleSeed, setShuffleSeed] = useState(0);

  useEffect(() => {
    if (!quizId) return;
    const load = async () => {
      const quizDoc = await getDoc(doc(db, 'quizzes', quizId));
      if (quizDoc.exists()) setQuiz({ id: quizDoc.id, ...quizDoc.data() } as Quiz);

      const q = query(collection(db, 'questions'), where('quizId', '==', quizId));
      const snapshot = await getDocs(q);
      const qs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Question[];
      setQuestions(qs.filter((q) => q.type !== 'slide' && q.type !== 'poll'));
      setLoading(false);
    };
    load();
  }, [quizId]);

  const displayQuestions: DisplayQuestion[] = useMemo(() => {
    let qs = [...questions];
    if (shuffleQuestions) qs = shuffle(qs);

    return qs.map((q) => {
      let displayOptions = [...q.options];
      let displayMatchOptions = q.matchOptions ? [...q.matchOptions] : undefined;

      if (shuffleOptions) {
        if (q.type === 'mcq' || q.type === 'tf') {
          displayOptions = shuffle(displayOptions);
        }
        if (q.type === 'matching' && displayMatchOptions) {
          displayMatchOptions = shuffle(displayMatchOptions);
        }
        if (q.type === 'ordering') {
          displayOptions = shuffle(displayOptions);
        }
      }

      return { ...q, displayOptions, displayMatchOptions };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions, shuffleQuestions, shuffleOptions, shuffleSeed]);

  const estimatedTime = useMemo(() => {
    const total = displayQuestions.reduce((acc, q) => {
      if (q.type === 'mcq' || q.type === 'tf') return acc + 30;
      if (q.type === 'short' || q.type === 'fill_blank') return acc + 60;
      return acc + 90;
    }, 0);
    return Math.ceil(total / 60);
  }, [displayQuestions]);

  const handleToggleShuffle = useCallback((setter: (v: boolean) => void, current: boolean) => {
    setter(!current);
    setShuffleSeed((s) => s + 1);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-brand/30 border-t-brand rounded-full animate-spin" />
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-surface-dark">
        <div className="text-center">
          <Printer className="w-12 h-12 text-gray-300 dark:text-white/30 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-white/50">No questions available for this quiz.</p>
          <button onClick={() => navigate(-1)} className="mt-4 text-brand underline">Go back</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-surface-dark print:bg-white">
      {/* ── Toolbar (screen only) ── */}
      <div className="sticky top-0 z-10 bg-white dark:bg-white/5 border-b border-gray-200 dark:border-white/10 shadow-sm print:hidden">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-1.5 text-gray-500 dark:text-white/60 hover:text-gray-700 dark:hover:text-white text-sm font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          <div className="flex items-center gap-4 flex-wrap">
            {/* Shuffle answers toggle */}
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-white/70 cursor-pointer select-none">
              <span>Shuffle answers</span>
              <button
                role="switch"
                aria-checked={shuffleOptions}
                onClick={() => handleToggleShuffle(setShuffleOptions, shuffleOptions)}
                className={`relative w-10 h-5 rounded-full transition-colors ${shuffleOptions ? 'bg-brand' : 'bg-gray-300'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${shuffleOptions ? 'translate-x-5' : ''}`} />
              </button>
            </label>

            {/* Shuffle questions toggle */}
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-white/70 cursor-pointer select-none">
              <span>Shuffle questions</span>
              <button
                role="switch"
                aria-checked={shuffleQuestions}
                onClick={() => handleToggleShuffle(setShuffleQuestions, shuffleQuestions)}
                className={`relative w-10 h-5 rounded-full transition-colors ${shuffleQuestions ? 'bg-brand' : 'bg-gray-300'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${shuffleQuestions ? 'translate-x-5' : ''}`} />
              </button>
            </label>

            {/* Answer key toggle */}
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-white/70 cursor-pointer select-none">
              <span>Answer keys</span>
              <button
                role="switch"
                aria-checked={showAnswerKey}
                onClick={() => setShowAnswerKey(!showAnswerKey)}
                className={`relative w-10 h-5 rounded-full transition-colors ${showAnswerKey ? 'bg-brand' : 'bg-gray-300'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${showAnswerKey ? 'translate-x-5' : ''}`} />
              </button>
            </label>

            {/* Separator */}
            <div className="h-6 w-px bg-gray-200 dark:bg-white/10" />

            {/* Font size */}
            <div className="flex items-center gap-1 text-sm text-gray-500 dark:text-white/60">
              <span className="mr-1">Font size</span>
              {['S', 'M', 'L', 'XL'].map((size) => (
                <button
                  key={size}
                  onClick={() => setFontSize(size)}
                  className={`w-8 h-8 rounded-full font-semibold text-xs transition-colors ${
                    fontSize === size
                      ? 'bg-gray-800 dark:bg-white/20 text-white'
                      : 'bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-white/70 hover:bg-gray-200 dark:hover:bg-white/20'
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>

            {/* Separator */}
            <div className="h-6 w-px bg-gray-200 dark:bg-white/10" />

            {/* Print button */}
            <button
              onClick={() => window.print()}
              className="px-5 py-2 bg-brand text-white font-semibold rounded-xl hover:bg-brand-dark transition-colors flex items-center gap-2 text-sm"
            >
              <Download className="w-4 h-4" />
              Print / Download
            </button>
          </div>
        </div>
      </div>

      {/* ── Worksheet Body ── */}
      <div className={`worksheet-body max-w-3xl mx-auto bg-white dark:bg-white/5 print:max-w-none print:shadow-none shadow-sm my-6 print:my-0 px-12 py-10 ${FONT_CLASSES[fontSize]} text-gray-900 dark:text-white`}>
        {/* Header */}
        <div className="border-b-2 border-gray-800 dark:border-white/20 pb-4 mb-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold text-gray-400 dark:text-white/40 uppercase tracking-wider mb-1">Worksheets</p>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">{quiz?.title || 'Untitled Quiz'}</h1>
            </div>
            <div className="text-right space-y-2 shrink-0">
              <div className="flex items-center gap-2 justify-end">
                <span className="text-sm text-gray-500 dark:text-white/60">Name</span>
                <span className="inline-block w-40 border-b border-gray-400 dark:border-white/30" />
              </div>
              <div className="flex items-center gap-2 justify-end">
                <span className="text-sm text-gray-500 dark:text-white/60">Class</span>
                <span className="inline-block w-40 border-b border-gray-400 dark:border-white/30" />
              </div>
              <div className="flex items-center gap-2 justify-end">
                <span className="text-sm text-gray-500 dark:text-white/60">Date</span>
                <span className="inline-block w-40 border-b border-gray-400 dark:border-white/30" />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 mt-3 text-xs text-gray-500 dark:text-white/60">
            <span>Total questions: {displayQuestions.length}</span>
            <span>Worksheet time: {estimatedTime}mins</span>
          </div>
        </div>

        {/* Questions */}
        {displayQuestions.map((q, index) => (
          <div key={q.id} className="mb-6 break-inside-avoid">
            <div className="flex gap-3 items-start">
              <span className="font-bold text-gray-900 dark:text-white shrink-0 w-6 text-right">{index + 1}.</span>
              <div className="flex-1">
                {q.type !== 'fill_blank' && (
                  <p className="font-medium text-gray-900 dark:text-white">
                    {q.text}
                    {(q.type === 'mcq' && q.correctAnswers.length > 1) && (
                      <span className="text-gray-400 dark:text-white/40 text-xs ml-2">(Choose {q.correctAnswers.length}.)</span>
                    )}
                  </p>
                )}
                {q.imageUrl && (
                  <img src={q.imageUrl} alt="" className="max-h-36 mt-2 mb-1 rounded print:max-h-28" />
                )}
                <QuestionBody question={q} showAnswer={showAnswerKey} />
              </div>
            </div>
          </div>
        ))}

        {/* Answer Key section */}
        {showAnswerKey && (
          <div className="mt-10 pt-6 border-t-2 border-gray-300 dark:border-white/20 break-before-page">
            <h2 className="font-bold text-base mb-4">Answer Key</h2>
            <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
              {displayQuestions.map((q, i) => (
                <div key={q.id} className="flex gap-2">
                  <span className="font-medium text-gray-500 dark:text-white/60 w-6 text-right shrink-0">{i + 1}.</span>
                  <span className="text-gray-800 dark:text-white/80">{formatAnswer(q)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
