import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { ArrowLeft, ArrowRight, RotateCcw, BookOpen, Check, X as XIcon } from 'lucide-react';
import type { Question, Quiz } from '../types/models';

export default function Flashcards() {
  const { quizId } = useParams<{ quizId: string }>();
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [current, setCurrent] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!quizId) return;
    const load = async () => {
      const quizDoc = await getDoc(doc(db, 'quizzes', quizId));
      if (quizDoc.exists()) setQuiz({ id: quizDoc.id, ...quizDoc.data() } as Quiz);

      const q = query(collection(db, 'questions'), where('quizId', '==', quizId));
      const snapshot = await getDocs(q);
      const qs = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() })) as Question[];
      // Filter out slides and polls (no answer to study)
      setQuestions(qs.filter((q) => q.type !== 'slide' && q.type !== 'poll'));
      setLoading(false);
    };
    load();
  }, [quizId]);

  const handleNext = () => {
    setFlipped(false);
    setCurrent((c) => Math.min(c + 1, questions.length - 1));
  };

  const handlePrev = () => {
    setFlipped(false);
    setCurrent((c) => Math.max(c - 1, 0));
  };

  const markKnown = () => {
    setKnown((prev) => new Set(prev).add(current));
    handleNext();
  };

  const resetProgress = () => {
    setKnown(new Set());
    setCurrent(0);
    setFlipped(false);
  };

  const getAnswerText = (q: Question): string => {
    if (q.type === 'matching' && q.matchOptions) {
      return q.options.map((left, i) => `${left} → ${q.matchOptions![i]}`).join('\n');
    }
    if (q.type === 'fill_blank') {
      return q.correctAnswers.join(', ');
    }
    if (q.type === 'ordering') {
      return q.options.map((item, i) => `${i + 1}. ${item}`).join('\n');
    }
    return q.correctAnswers.join(', ');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-brand/30 border-t-brand rounded-full animate-spin" />
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface dark:bg-surface-dark">
        <div className="text-center">
          <BookOpen className="w-12 h-12 text-gray-300 dark:text-white/30 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-white/50">No flashcards available for this quiz.</p>
          <button onClick={() => navigate(-1)} className="mt-4 text-brand underline">Go back</button>
        </div>
      </div>
    );
  }

  const q = questions[current];
  const progress = known.size / questions.length;

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col px-4 py-8 max-w-2xl mx-auto text-gray-900 dark:text-white">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-500 dark:text-white/60 hover:text-gray-700 dark:hover:text-white text-sm">
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <div className="text-center">
          <h1 className="font-bold text-gray-900 dark:text-white">{quiz?.title}</h1>
          <p className="text-xs text-gray-400 dark:text-white/40 mt-0.5">{current + 1} of {questions.length}</p>
        </div>
        <button onClick={resetProgress} className="flex items-center gap-1 text-sm text-gray-400 dark:text-white/40 hover:text-gray-600 dark:hover:text-white/70">
          <RotateCcw className="w-3.5 h-3.5" />
          Reset
        </button>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-2 bg-gray-200 dark:bg-white/15 rounded-full mb-8 overflow-hidden">
        <div
          className="h-full bg-success rounded-full transition-all duration-500"
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      {/* Flashcard */}
      <div className="flex-1 flex items-center justify-center">
        <div
          onClick={() => setFlipped(!flipped)}
          className="w-full max-w-lg aspect-[3/2] cursor-pointer perspective-1000"
        >
          <div className={`relative w-full h-full transition-transform duration-500 transform-style-preserve-3d ${flipped ? '[transform:rotateY(180deg)]' : ''}`}>
            {/* Front (Question) */}
            <div className="absolute inset-0 bg-white dark:bg-white/5 rounded-3xl shadow-lg border border-gray-100 dark:border-white/10 p-8 flex flex-col items-center justify-center backface-hidden">
              <span className="text-xs font-medium text-gray-400 dark:text-white/40 uppercase tracking-wider mb-4">
                {q.type === 'ordering' ? 'Put in order' : q.type === 'matching' ? 'Match pairs' : 'Question'}
              </span>
              <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white text-center leading-relaxed">
                {q.text}
              </h2>
              {q.imageUrl && (
                <img src={q.imageUrl} alt="Question image" className="max-h-32 rounded-xl mt-4" />
              )}
              <p className="text-gray-300 dark:text-white/30 text-sm mt-6">Tap to reveal answer</p>
            </div>
            {/* Back (Answer) */}
            <div className="absolute inset-0 bg-brand text-white rounded-3xl shadow-lg p-8 flex flex-col items-center justify-center backface-hidden [transform:rotateY(180deg)]">
              <span className="text-xs font-medium text-white/50 uppercase tracking-wider mb-4">Answer</span>
              <p className="text-xl md:text-2xl font-bold text-center whitespace-pre-line leading-relaxed">
                {getAnswerText(q)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-4 mt-8">
        <button
          onClick={handlePrev}
          disabled={current === 0}
          className="p-3 rounded-full bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-white/70 hover:bg-gray-200 dark:hover:bg-white/20 disabled:opacity-30 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <button
          onClick={() => { setFlipped(false); handleNext(); }}
          className="px-4 py-2.5 rounded-xl bg-danger/10 text-danger font-medium hover:bg-danger/20 transition-colors flex items-center gap-1.5"
        >
          <XIcon className="w-4 h-4" />
          Still learning
        </button>
        <button
          onClick={markKnown}
          className={`px-4 py-2.5 rounded-xl font-medium flex items-center gap-1.5 transition-colors ${
            known.has(current) ? 'bg-success/20 text-success' : 'bg-success/10 text-success hover:bg-success/20'
          }`}
        >
          <Check className="w-4 h-4" />
          {known.has(current) ? 'Known' : 'Got it'}
        </button>
        <button
          onClick={handleNext}
          disabled={current === questions.length - 1}
          className="p-3 rounded-full bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-white/70 hover:bg-gray-200 dark:hover:bg-white/20 disabled:opacity-30 transition-colors"
        >
          <ArrowRight className="w-5 h-5" />
        </button>
      </div>

      {/* Known count */}
      <p className="text-center text-sm text-gray-400 dark:text-white/40 mt-4">
        {known.size} of {questions.length} marked as known
      </p>
    </div>
  );
}
