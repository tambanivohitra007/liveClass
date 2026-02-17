import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { doc, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../lib/firebase';
import { useSessionStore } from '../../stores/sessionStore';
import { useToastStore } from '../../stores/toastStore';
import Leaderboard from '../../components/Leaderboard';
import { Trophy, PartyPopper, Frown, Triangle, Diamond, Circle, Square } from 'lucide-react';
import Confetti from '../../components/Confetti';
import CircularTimer from '../../components/CircularTimer';
import { useAntiCheat } from '../../hooks/useAntiCheat';
import ViolationWarning from '../../components/ViolationWarning';
import type { Session, Question } from '../../types/models';

const answerColors = [
  'bg-answer-red hover:brightness-110',
  'bg-answer-blue hover:brightness-110',
  'bg-answer-yellow hover:brightness-110',
  'bg-answer-green hover:brightness-110',
];

const answerIcons = [
  <Triangle key="t" className="w-5 h-5 shrink-0" />,
  <Diamond key="d" className="w-5 h-5 shrink-0" />,
  <Circle key="c" className="w-5 h-5 shrink-0" />,
  <Square key="s" className="w-5 h-5 shrink-0" />,
];

export default function PlayGame() {
  const { sessionId, playerId } = useParams<{ sessionId: string; playerId: string }>();
  const { session, setSession } = useSessionStore();
  const { addToast } = useToastStore();
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string>('');
  const [matchingPairs, setMatchingPairs] = useState<Record<string, string>>({});
  const [fillAnswers, setFillAnswers] = useState<string[]>([]);
  const [shuffledMatchOptions, setShuffledMatchOptions] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [feedback, setFeedback] = useState<{ correct: boolean; points: number } | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);

  const { showWarning, dismissWarning } = useAntiCheat({
    sessionId,
    playerId,
    enabled: session?.questionState === 'live' && session?.antiCheatEnabled !== false,
  });

  useEffect(() => {
    if (!sessionId) return;
    const unsubscribe = onSnapshot(doc(db, 'sessions', sessionId), (snap) => {
      if (snap.exists()) setSession({ id: snap.id, ...snap.data() } as Session);
    });
    return unsubscribe;
  }, [sessionId, setSession]);

  useEffect(() => {
    if (!session || session.questionState !== 'live') return;
    setSubmitted(false);
    setSelectedAnswer('');
    setMatchingPairs({});
    setFillAnswers([]);
    setFeedback(null);

    const loadQuestion = async () => {
      const q = query(collection(db, 'questions'), where('quizId', '==', session.quizId));
      const snapshot = await getDocs(q);
      const questions = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Question[];
      const current = questions[session.currentQuestionIndex];
      if (current) {
        setCurrentQuestion(current);
        setTimeLeft(current.timeLimitSec);
        if (current.type === 'matching' && current.matchOptions) {
          setShuffledMatchOptions([...current.matchOptions].sort(() => Math.random() - 0.5));
        }
        if (current.type === 'fill_blank') {
          const blankCount = (current.text.match(/___/g) || []).length;
          setFillAnswers(Array(blankCount).fill(''));
        }
      }
    };
    loadQuestion();
  }, [session?.currentQuestionIndex, session?.questionState]);

  useEffect(() => {
    if (timeLeft <= 0 || submitted) return;
    const timer = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft, submitted]);

  // Keyboard shortcuts: 1-4 for MCQ, Enter to submit
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!currentQuestion || submitted) return;
      if (e.key === 'Enter' && canSubmit()) {
        e.preventDefault();
        submitAnswer();
        return;
      }
      if ((currentQuestion.type === 'mcq' || currentQuestion.type === 'tf') && /^[1-4]$/.test(e.key)) {
        const idx = parseInt(e.key) - 1;
        if (idx < currentQuestion.options.length) {
          setSelectedAnswer(currentQuestion.options[idx]);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  const getSelection = (): string => {
    if (!currentQuestion) return selectedAnswer;
    if (currentQuestion.type === 'matching') return JSON.stringify(matchingPairs);
    if (currentQuestion.type === 'fill_blank') return JSON.stringify(fillAnswers);
    return selectedAnswer;
  };

  const canSubmit = (): boolean => {
    if (!currentQuestion) return false;
    if (currentQuestion.type === 'matching') {
      return currentQuestion.options.every((opt) => matchingPairs[opt]?.trim());
    }
    if (currentQuestion.type === 'fill_blank') {
      return fillAnswers.every((a) => a.trim());
    }
    return selectedAnswer !== '';
  };

  const submitAnswer = async () => {
    if (!sessionId || !playerId || !currentQuestion || submitted) return;
    setSubmitted(true);
    const elapsedMs = (currentQuestion.timeLimitSec - timeLeft) * 1000;
    const selection = getSelection();
    try {
      const activeToken = sessionStorage.getItem(`activeToken_${sessionId}`) || undefined;
      const fn = httpsCallable<
        { sessionId: string; questionId: string; playerId: string; selection: string; timeMs: number; activeToken?: string },
        { correct: boolean; pointsAwarded: number }
      >(functions, 'scoreAnswer');
      const result = await fn({
        sessionId, questionId: currentQuestion.id, playerId, selection, timeMs: elapsedMs, activeToken,
      });
      setFeedback({ correct: result.data.correct, points: result.data.pointsAwarded });
    } catch {
      addToast('error', 'Failed to submit answer. Please try again.');
    }
  };

  if (!session) {
    return (
      <div className="min-h-screen bg-surface-dark flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-brand/30 border-t-brand rounded-full animate-spin" />
      </div>
    );
  }

  // Lobby
  if (session.status === 'lobby') {
    return (
      <div className="min-h-screen bg-surface-dark flex items-center justify-center text-white">
        <div className="text-center animate-fade-in">
          <div className="w-16 h-16 border-4 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-6" />
          <h1 className="text-2xl font-bold mb-2">You're in!</h1>
          <p className="text-white/50">Waiting for the host to start...</p>
        </div>
      </div>
    );
  }

  // Ended
  if (session.status === 'ended') {
    return (
      <div className="min-h-screen bg-surface-dark text-white p-6">
        <div className="max-w-md mx-auto text-center py-12 animate-bounce-in">
          <Trophy className="w-16 h-16 mx-auto mb-4 text-warning" />
          <h1 className="text-3xl font-black mb-2">Game Over!</h1>
          <p className="text-white/50 mb-8">Thanks for playing!</p>
          {sessionId && (
            <div className="bg-white/5 backdrop-blur rounded-2xl p-6">
              <Leaderboard sessionId={sessionId} />
            </div>
          )}
        </div>
      </div>
    );
  }

  // Reveal
  if (session.questionState === 'reveal') {
    return (
      <div className="min-h-screen bg-surface-dark text-white p-6">
        <Confetti active={feedback?.correct === true} />
        <ViolationWarning visible={showWarning} onDismiss={dismissWarning} />
        <div className="max-w-md mx-auto text-center py-12">
          {feedback && (
            <div className="animate-bounce-in">
              <div className="flex justify-center mb-4">
                {feedback.correct
                  ? <PartyPopper className="w-16 h-16 text-success" />
                  : <Frown className="w-16 h-16 text-danger" />}
              </div>
              <h2 className={`text-3xl font-black mb-2 ${feedback.correct ? 'text-success' : 'text-danger'}`}>
                {feedback.correct ? 'Correct!' : 'Wrong!'}
              </h2>
              <p className="text-4xl font-black text-white mb-8">+{feedback.points}</p>
            </div>
          )}
          {sessionId && (
            <div className="bg-white/5 backdrop-blur rounded-2xl p-6 animate-slide-up">
              <Leaderboard sessionId={sessionId} compact />
            </div>
          )}
          <p className="text-white/30 mt-6 text-sm">Next question coming up...</p>
        </div>
      </div>
    );
  }

  // Loading question
  if (!currentQuestion) {
    return (
      <div className="min-h-screen bg-surface-dark flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-brand/30 border-t-brand rounded-full animate-spin" />
      </div>
    );
  }

  // Live question
  return (
    <div className="min-h-screen bg-surface-dark flex flex-col">
      <ViolationWarning visible={showWarning} onDismiss={dismissWarning} />
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-white/50 text-sm font-medium">Q{(session.currentQuestionIndex || 0) + 1}</span>
        <CircularTimer timeLeft={timeLeft} totalTime={currentQuestion.timeLimitSec} />
        <div className="w-20" />
      </div>

      {/* Question */}
      <div className="flex-1 flex flex-col px-4 pb-4">
        <div className="text-center py-6 animate-fade-in">
          <h2 className="text-xl md:text-2xl font-bold text-white">{currentQuestion.text}</h2>
          {currentQuestion.imageUrl && (
            <img src={currentQuestion.imageUrl} alt="" className="max-h-40 mx-auto mt-4 rounded-xl" />
          )}
        </div>

        {/* Answer buttons */}
        {(currentQuestion.type === 'mcq' || currentQuestion.type === 'tf') && (
          <div className="grid grid-cols-2 gap-3 flex-1 max-h-[400px]">
            {currentQuestion.options.map((opt, i) => (
              <button
                key={i}
                onClick={() => {
                  if (!submitted) {
                    setSelectedAnswer(opt);
                  }
                }}
                disabled={submitted}
                className={`rounded-2xl text-white font-bold text-lg flex items-center justify-center gap-2 transition-all ${
                  answerColors[i % 4]
                } ${
                  selectedAnswer === opt ? 'ring-4 ring-white scale-95' : ''
                } ${
                  submitted ? 'opacity-60' : 'active:scale-95'
                }`}
              >
                {answerIcons[i % 4]}
                <span className="truncate px-2">{opt}</span>
              </button>
            ))}
          </div>
        )}

        {currentQuestion.type === 'short' && (
          <div className="flex-1 flex items-center">
            <div className="w-full max-w-md mx-auto">
              <input
                type="text"
                value={selectedAnswer}
                onChange={(e) => setSelectedAnswer(e.target.value)}
                placeholder="Type your answer..."
                disabled={submitted}
                className="w-full text-center text-2xl font-bold px-6 py-5 rounded-2xl border-2 border-white/20 bg-white/10 text-white placeholder:text-white/30 focus:border-brand focus:ring-4 focus:ring-brand/20 outline-none backdrop-blur"
                autoFocus
              />
            </div>
          </div>
        )}

        {/* Matching UI */}
        {currentQuestion.type === 'matching' && (
          <div className="flex-1 space-y-3 max-w-md mx-auto w-full">
            {currentQuestion.options.map((left, i) => (
              <div key={i} className={`flex items-center gap-3 p-3 rounded-xl border-2 ${
                matchingPairs[left] ? 'border-brand/50 bg-white/5' : 'border-white/10'
              }`}>
                <span className={`font-bold text-white px-3 py-1.5 rounded-lg text-sm shrink-0 ${answerColors[i % 4].split(' ')[0]}`}>
                  {left}
                </span>
                <span className="text-white/30">&rarr;</span>
                <select
                  value={matchingPairs[left] || ''}
                  onChange={(e) => setMatchingPairs({ ...matchingPairs, [left]: e.target.value })}
                  disabled={submitted}
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
        {currentQuestion.type === 'fill_blank' && (
          <div className="flex-1 flex items-center">
            <div className="w-full max-w-lg mx-auto space-y-4">
              <div className="text-lg text-white leading-relaxed text-center">
                {currentQuestion.text.split('___').map((part, i, arr) => (
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
                        disabled={submitted}
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

        {/* Submit button */}
        {!submitted && canSubmit() && (
          <button
            onClick={submitAnswer}
            className="mt-4 py-4 bg-white text-surface-dark font-black text-lg rounded-2xl hover:bg-gray-100 transition-all shadow-lg animate-slide-up"
          >
            Submit Answer
          </button>
        )}

        {submitted && !feedback && (
          <div className="mt-4 py-4 text-center text-white/50 animate-fade-in">
            <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-2" />
            Waiting for results...
          </div>
        )}
      </div>
    </div>
  );
}
