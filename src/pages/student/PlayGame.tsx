import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { doc, onSnapshot, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../lib/firebase';
import { useSessionStore } from '../../stores/sessionStore';
import { useToastStore } from '../../stores/toastStore';
import Leaderboard from '../../components/Leaderboard';
import { Trophy, PartyPopper, Frown, Triangle, Diamond, Circle, Square, Hexagon, Star, Volume2, VolumeX, ChevronUp, ChevronDown, BookOpen } from 'lucide-react';
import Confetti from '../../components/Confetti';
import CircularTimer from '../../components/CircularTimer';
import { useAntiCheat } from '../../hooks/useAntiCheat';
import ViolationWarning from '../../components/ViolationWarning';
import { playCorrect, playWrong, playTick, playUrgentTick, playSubmit, playPodium, isMuted, setMuted as setSoundMuted } from '../../lib/sounds';
import type { Session, Question } from '../../types/models';

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function getYouTubeId(url: string): string | null {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|shorts\/))([^?&/]+)/);
  return match?.[1] || null;
}

const answerColors = [
  'bg-answer-red hover:brightness-110',
  'bg-answer-blue hover:brightness-110',
  'bg-answer-yellow hover:brightness-110',
  'bg-answer-green hover:brightness-110',
  'bg-answer-purple hover:brightness-110',
  'bg-answer-orange hover:brightness-110',
];

const answerIcons = [
  <Triangle key="t" className="w-5 h-5 shrink-0" />,
  <Diamond key="d" className="w-5 h-5 shrink-0" />,
  <Circle key="c" className="w-5 h-5 shrink-0" />,
  <Square key="s" className="w-5 h-5 shrink-0" />,
  <Hexagon key="h" className="w-5 h-5 shrink-0" />,
  <Star key="st" className="w-5 h-5 shrink-0" />,
];

export default function PlayGame() {
  const { sessionId, playerId } = useParams<{ sessionId: string; playerId: string }>();
  const { session, setSession } = useSessionStore();
  const { addToast } = useToastStore();
  const [allQuestions, setAllQuestions] = useState<Question[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string>('');
  const [matchingPairs, setMatchingPairs] = useState<Record<string, string>>({});
  const [fillAnswers, setFillAnswers] = useState<string[]>([]);
  const [orderingItems, setOrderingItems] = useState<string[]>([]);
  const [shuffledMatchOptions, setShuffledMatchOptions] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [submitFailed, setSubmitFailed] = useState(false);
  const [feedback, setFeedback] = useState<{ correct: boolean; points: number; rank: number; behindBy: number } | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [myTeam, setMyTeam] = useState<{ name: string; color: string } | null>(null);
  const [muted, setMutedState] = useState(isMuted());
  const toggleMute = () => { const next = !muted; setSoundMuted(next); setMutedState(next); };
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

  // Load player's team info
  useEffect(() => {
    if (!sessionId || !playerId || !session?.teamMode || !session.teams) return;
    getDoc(doc(db, `sessions/${sessionId}/players`, playerId)).then((snap) => {
      if (snap.exists()) {
        const ti = snap.data().teamIndex;
        if (ti !== undefined && session.teams?.[ti]) {
          setMyTeam(session.teams[ti]);
        }
      }
    });
  }, [sessionId, playerId, session?.teamMode]);

  // Pre-fetch all questions once when we know the quizId
  useEffect(() => {
    if (!session?.quizId) return;
    let cancelled = false;
    const fetchQuestions = async () => {
      try {
        const q = query(collection(db, 'questions'), where('quizId', '==', session.quizId));
        const snapshot = await getDocs(q);
        if (cancelled) return;
        const qs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Question[];
        setAllQuestions(qs);
        setTotalQuestions(qs.length);
      } catch {
        if (!cancelled) addToast('error', 'Failed to load questions. Please refresh.');
      }
    };
    fetchQuestions();
    return () => { cancelled = true; };
  }, [session?.quizId]);

  // Pick current question from cache when question state changes
  useEffect(() => {
    if (!session || session.questionState !== 'live' || allQuestions.length === 0) return;
    setSubmitted(false);
    setSubmitFailed(false);
    setSelectedAnswer('');
    setMatchingPairs({});
    setFillAnswers([]);
    setOrderingItems([]);
    setFeedback(null);

    const qIdx = session.questionOrder
      ? session.questionOrder[session.currentQuestionIndex]
      : session.currentQuestionIndex;
    const current = allQuestions[qIdx];
    if (current) {
      setCurrentQuestion(current);
      // Calculate remaining time from server timestamp to survive refreshes
      const startedAt = session.questionStartedAt as any;
      const startMs = startedAt?.toMillis ? startedAt.toMillis() : (typeof startedAt === 'number' ? startedAt : 0);
      if (startMs > 0) {
        const now = session.timerPaused && session.timerPausedAt
          ? (typeof session.timerPausedAt === 'number' ? session.timerPausedAt : Date.now())
          : Date.now();
        const elapsed = Math.floor((now - startMs) / 1000);
        setTimeLeft(Math.max(0, current.timeLimitSec - elapsed));
      } else {
        setTimeLeft(current.timeLimitSec);
      }
      if (current.type === 'ordering') {
        setOrderingItems([...current.options].sort(() => Math.random() - 0.5));
      }
      if (current.type === 'matching' && current.matchOptions) {
        setShuffledMatchOptions([...current.matchOptions].sort(() => Math.random() - 0.5));
      }
      if (current.type === 'fill_blank') {
        const blankCount = (current.text.match(/___/g) || []).length;
        setFillAnswers(Array(blankCount).fill(''));
      }
    }
  }, [session?.currentQuestionIndex, session?.questionState, allQuestions]);

  useEffect(() => {
    if (timeLeft <= 0 || submitted || session?.timerPaused) return;
    const timer = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft, submitted, session?.timerPaused]);

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

  // Sound effects
  useEffect(() => {
    if (timeLeft <= 0 || timeLeft > 5 || submitted) return;
    if (timeLeft <= 3) playUrgentTick();
    else playTick();
  }, [timeLeft, submitted]);

  useEffect(() => {
    if (!feedback) return;
    if (feedback.correct) playCorrect();
    else playWrong();
  }, [feedback]);

  useEffect(() => {
    if (session?.status === 'ended') playPodium();
  }, [session?.status]);

  const getSelection = (): string => {
    if (!currentQuestion) return selectedAnswer;
    if (currentQuestion.type === 'matching') return JSON.stringify(matchingPairs);
    if (currentQuestion.type === 'fill_blank') return JSON.stringify(fillAnswers);
    if (currentQuestion.type === 'ordering') return JSON.stringify(orderingItems);
    return selectedAnswer;
  };

  const canSubmit = (): boolean => {
    if (!currentQuestion) return false;
    if (currentQuestion.type === 'slide') return false;
    if (currentQuestion.type === 'matching') {
      return currentQuestion.options.every((opt) => matchingPairs[opt]?.trim());
    }
    if (currentQuestion.type === 'fill_blank') {
      return fillAnswers.every((a) => a.trim());
    }
    if (currentQuestion.type === 'ordering') {
      return orderingItems.length > 0;
    }
    if (currentQuestion.type === 'poll') {
      return selectedAnswer !== '';
    }
    return selectedAnswer !== '';
  };

  const submitAnswer = async () => {
    if (!sessionId || !playerId || !currentQuestion) return;
    setSubmitted(true);
    setSubmitFailed(false);
    playSubmit();
    const elapsedMs = (currentQuestion.timeLimitSec - timeLeft) * 1000;
    const selection = getSelection();
    try {
      const activeToken = sessionStorage.getItem(`activeToken_${sessionId}`) || undefined;
      const fn = httpsCallable<
        { sessionId: string; questionId: string; playerId: string; selection: string; timeMs: number; activeToken?: string },
        { correct: boolean; pointsAwarded: number; rank: number; behindBy: number }
      >(functions, 'scoreAnswer');
      const result = await fn({
        sessionId, questionId: currentQuestion.id, playerId, selection, timeMs: elapsedMs, activeToken,
      });
      const { correct: c, pointsAwarded, rank, behindBy } = result.data;
      setFeedback({ correct: c, points: pointsAwarded, rank, behindBy });
    } catch {
      setSubmitFailed(true);
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
          {myTeam && (
            <span className="inline-block px-4 py-1.5 rounded-full text-sm font-bold text-white mb-3" style={{ backgroundColor: myTeam.color }}>
              {myTeam.name}
            </span>
          )}
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
              <Leaderboard sessionId={sessionId} currentQuestion={totalQuestions} totalQuestions={totalQuestions} />
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
              <p className="text-4xl font-black text-white mb-2">+{feedback.points}</p>
              {feedback.rank > 0 && (
                <p className="text-white/50 text-sm mb-6">
                  You're in <span className="text-white font-bold">{ordinal(feedback.rank)} place</span>
                  {feedback.behindBy > 0 && <> — <span className="text-warning font-bold">{feedback.behindBy} pts</span> behind</>}
                  {feedback.rank === 1 && <span className="text-warning font-bold"> — You're leading!</span>}
                </p>
              )}
            </div>
          )}
          {sessionId && (
            <div className="bg-white/5 backdrop-blur rounded-2xl p-6 animate-slide-up">
              <Leaderboard sessionId={sessionId} compact currentQuestion={(session.currentQuestionIndex || 0) + 1} totalQuestions={totalQuestions} />
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
        <div className="flex items-center gap-2 w-20">
          <span className="text-white/50 text-sm font-medium">Q{(session.currentQuestionIndex || 0) + 1}</span>
          {myTeam && (
            <span className="px-2 py-0.5 rounded-full text-xs font-bold text-white" style={{ backgroundColor: myTeam.color }}>
              {myTeam.name.split(' ')[0]}
            </span>
          )}
        </div>
        <div className="flex flex-col items-center">
          {submitted ? (
            <div className="w-20 h-20 flex items-center justify-center">
              <div className="w-12 h-12 rounded-full bg-success/20 border-2 border-success flex items-center justify-center animate-bounce-in">
                <svg className="w-6 h-6 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
          ) : (
            <>
              <CircularTimer timeLeft={timeLeft} totalTime={currentQuestion.timeLimitSec} />
              {session?.timerPaused && <span className="text-warning font-bold text-xs uppercase tracking-wider animate-pulse">Paused</span>}
            </>
          )}
        </div>
        <button onClick={toggleMute} className="w-20 flex justify-end" aria-label={muted ? 'Unmute' : 'Mute'}>
          {muted ? <VolumeX className="w-5 h-5 text-white/30" /> : <Volume2 className="w-5 h-5 text-white/50" />}
        </button>
      </div>

      {/* Question */}
      <div className="flex-1 flex flex-col px-4 pb-4">
        <div className="text-center py-6 animate-fade-in">
          <h2 className="text-xl md:text-2xl font-bold text-white break-words">{currentQuestion.text}</h2>
          {currentQuestion.imageUrl && (
            <img src={currentQuestion.imageUrl} alt="" className="max-h-40 mx-auto mt-4 rounded-xl" />
          )}
          {currentQuestion.videoUrl && getYouTubeId(currentQuestion.videoUrl) && (
            <div className="mt-4 mx-auto max-w-md aspect-video rounded-xl overflow-hidden">
              <iframe
                src={`https://www.youtube.com/embed/${getYouTubeId(currentQuestion.videoUrl)}?autoplay=0&rel=0`}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
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
                className={`rounded-2xl text-white font-bold text-base md:text-lg flex items-center justify-center gap-2 p-3 transition-all ${
                  answerColors[i % answerColors.length]
                } ${
                  selectedAnswer === opt ? 'ring-4 ring-white scale-95' : ''
                } ${
                  submitted ? 'opacity-60' : 'active:scale-95'
                }`}
              >
                {answerIcons[i % answerIcons.length]}
                <span className="break-words text-center min-w-0">{opt}</span>
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
                <span className={`font-bold text-white px-3 py-1.5 rounded-lg text-sm shrink-0 max-w-[40%] break-words ${answerColors[i % answerColors.length].split(' ')[0]}`}>
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

        {/* Ordering UI */}
        {currentQuestion.type === 'ordering' && (
          <div className="flex-1 space-y-2 max-w-md mx-auto w-full">
            <p className="text-center text-white/40 text-sm mb-3">Drag or use arrows to reorder</p>
            {orderingItems.map((item, i) => (
              <div key={item} className={`flex items-center gap-2 p-3 rounded-xl border-2 border-white/10 bg-white/5 ${submitted ? 'opacity-60' : ''}`}>
                <span className="text-white/30 text-sm font-bold w-6 text-center">{i + 1}</span>
                <span className="flex-1 font-medium text-white">{item}</span>
                {!submitted && (
                  <div className="flex flex-col">
                    <button
                      onClick={() => {
                        if (i === 0) return;
                        const newItems = [...orderingItems];
                        [newItems[i - 1], newItems[i]] = [newItems[i], newItems[i - 1]];
                        setOrderingItems(newItems);
                      }}
                      disabled={i === 0}
                      className="p-0.5 text-white/40 hover:text-white disabled:opacity-20"
                      aria-label="Move up"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (i === orderingItems.length - 1) return;
                        const newItems = [...orderingItems];
                        [newItems[i], newItems[i + 1]] = [newItems[i + 1], newItems[i]];
                        setOrderingItems(newItems);
                      }}
                      disabled={i === orderingItems.length - 1}
                      className="p-0.5 text-white/40 hover:text-white disabled:opacity-20"
                      aria-label="Move down"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Poll UI */}
        {currentQuestion.type === 'poll' && (
          <div className="grid grid-cols-2 gap-3 flex-1 max-h-[400px]">
            {currentQuestion.options.map((opt, i) => (
              <button
                key={i}
                onClick={() => { if (!submitted) setSelectedAnswer(opt); }}
                disabled={submitted}
                className={`rounded-2xl text-white font-bold text-base md:text-lg flex items-center justify-center gap-2 p-3 transition-all ${
                  answerColors[i % answerColors.length]
                } ${
                  selectedAnswer === opt ? 'ring-4 ring-white scale-95' : ''
                } ${
                  submitted ? 'opacity-60' : 'active:scale-95'
                }`}
              >
                {answerIcons[i % answerIcons.length]}
                <span className="break-words text-center min-w-0">{opt}</span>
              </button>
            ))}
          </div>
        )}

        {/* Slide UI */}
        {currentQuestion.type === 'slide' && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <BookOpen className="w-12 h-12 text-white/20 mx-auto mb-4" />
              <p className="text-white/40 text-sm">This is an informational slide — no answer needed.</p>
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

        {submitted && !feedback && !submitFailed && (
          <div className="mt-4 py-4 text-center text-white/50 animate-fade-in">
            <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-2" />
            Waiting for results...
          </div>
        )}

        {submitFailed && (
          <div className="mt-4 text-center animate-fade-in">
            <p className="text-danger font-bold mb-2">Failed to submit answer</p>
            <button
              onClick={submitAnswer}
              className="py-3 px-8 bg-white text-surface-dark font-black text-base rounded-2xl hover:bg-gray-100 transition-all shadow-lg"
            >
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
