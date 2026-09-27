import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import type { ArcadeAnswerResult, ArcadeQuestion } from '../../types/arcade';
import { arcadeApi, errorMessage, type PlayerAuth } from './api';

const TILE_COLORS = ['bg-rose-500', 'bg-blue-500', 'bg-amber-500', 'bg-emerald-500', 'bg-purple-500', 'bg-cyan-500'];
const LABELS = ['A', 'B', 'C', 'D', 'E', 'F'];

interface Props {
  auth: PlayerAuth;
  /** Called after the feedback has been shown. */
  onResult: (r: ArcadeAnswerResult) => void;
  onError?: (message: string) => void;
  compact?: boolean;
}

/** Fetches the player's next question, collects an answer, and shows right/wrong feedback. */
export default function QuestionPanel({ auth, onResult, onError, compact }: Props) {
  const [question, setQuestion] = useState<ArcadeQuestion | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ArcadeAnswerResult | null>(null);
  const [error, setError] = useState('');
  const done = useRef(false);

  useEffect(() => {
    let cancelled = false;
    arcadeApi.next(auth).then(
      (r) => !cancelled && setQuestion(r.question),
      (e) => {
        if (cancelled) return;
        setError(errorMessage(e));
        onError?.(errorMessage(e));
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (answer: string | string[]) => {
    if (submitting || result) return;
    setSubmitting(true);
    try {
      const r = await arcadeApi.answer({ ...auth, answer });
      setResult(r);
      setTimeout(() => {
        if (done.current) return;
        done.current = true;
        onResult(r);
      }, r.correct ? 900 : 2200);
    } catch (e) {
      setError(errorMessage(e));
      onError?.(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  if (error && !question) {
    return <div className="h-full flex items-center justify-center p-6 text-center text-white/70 font-bold">{error}</div>;
  }
  if (!question) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-white/60 animate-spin" />
      </div>
    );
  }

  const isChoice = question.type === 'mcq' || question.type === 'tf';
  const toggle = (opt: string) => {
    if (result) return;
    if (!question.multi) return void submit(opt);
    setSelected((s) => (s.includes(opt) ? s.filter((x) => x !== opt) : [...s, opt]));
  };

  return (
    <div className="relative h-full flex flex-col gap-3 p-3 sm:p-4">
      <div className={`rounded-2xl bg-white text-gray-900 px-4 ${compact ? 'py-3' : 'py-5'} text-center shadow-lg shrink-0`}>
        <p className={`${compact ? 'text-lg' : 'text-xl sm:text-2xl'} font-bold leading-snug break-words`}>{question.text}</p>
        {question.imageUrl && (
          <img src={question.imageUrl} alt="" className="mx-auto mt-3 max-h-32 sm:max-h-44 rounded-xl object-contain" />
        )}
        {question.codeSnippet && (
          <pre className="mt-3 text-left text-sm bg-gray-900 text-emerald-300 rounded-xl p-3 overflow-auto max-h-40">
            <code>{question.codeSnippet}</code>
          </pre>
        )}
        {question.multi && <p className="mt-2 text-sm font-semibold text-gray-500">Select all that apply</p>}
      </div>

      {isChoice ? (
        <div className={`grid gap-2 sm:gap-3 flex-1 min-h-0 ${question.options.length > 2 ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2'}`}>
          {question.options.map((opt, i) => {
            const isRight = !!result && result.correctAnswers.includes(opt);
            const picked = selected.includes(opt);
            const dim = result && !isRight;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => toggle(opt)}
                disabled={submitting || !!result}
                aria-label={`Answer ${LABELS[i % LABELS.length]}: ${opt}`}
                aria-pressed={picked}
                className={`${TILE_COLORS[i % TILE_COLORS.length]} relative rounded-2xl text-white font-bold text-base sm:text-lg p-3 min-h-16 flex items-center justify-center gap-2 transition-all active:scale-95 touch-manipulation ${
                  dim ? 'opacity-30' : ''
                } ${picked ? 'ring-4 ring-white' : ''} ${isRight ? 'ring-4 ring-white scale-[1.02]' : ''}`}
              >
                <span className="shrink-0 w-7 h-7 rounded-lg bg-white/25 text-sm flex items-center justify-center">{LABELS[i % LABELS.length]}</span>
                <span className="break-words text-center">{opt}</span>
                {isRight && <Check className="absolute top-2 right-2 w-5 h-5" />}
              </button>
            );
          })}
        </div>
      ) : (
        <form
          className="flex flex-col gap-3 flex-1 justify-center"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) void submit(text.trim());
          }}
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={submitting || !!result}
            autoFocus
            placeholder="Type your answer"
            className="w-full text-center text-2xl font-bold px-4 py-4 rounded-2xl bg-white/10 border border-white/20 text-white placeholder:text-white/30 outline-none focus:border-brand focus:ring-4 focus:ring-brand/20"
          />
          {result && !result.correct && (
            <p className="text-center text-white/80 font-semibold">
              Answer: <span className="text-emerald-300">{result.correctAnswers[0]}</span>
            </p>
          )}
        </form>
      )}

      {(question.multi || !isChoice) && !result && (
        <button
          type="button"
          onClick={() => (isChoice ? submit(selected) : text.trim() && submit(text.trim()))}
          disabled={submitting || (isChoice ? selected.length === 0 : !text.trim())}
          className="btn-3d-blue w-full py-3 text-lg font-bold disabled:opacity-40 shrink-0"
        >
          {submitting ? 'Checking…' : 'Submit'}
        </button>
      )}

      {result && (
        <div className="pointer-events-none absolute inset-x-0 top-1/3 flex justify-center animate-bounce-in">
          <div className={`flex items-center gap-2 px-6 py-3 rounded-full text-white text-2xl font-black shadow-2xl ${result.correct ? 'bg-emerald-500' : 'bg-rose-500'}`}>
            {result.correct ? <Check className="w-7 h-7" /> : <X className="w-7 h-7" />}
            {result.correct ? 'Correct!' : 'Not quite'}
          </div>
        </div>
      )}
      {error && question && <p className="text-center text-rose-300 text-sm font-semibold">{error}</p>}
    </div>
  );
}
