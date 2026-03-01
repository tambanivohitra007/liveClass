import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, onSnapshot, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { ref, set, serverTimestamp, onValue, off } from 'firebase/database';
import { db, rtdb, functions } from '../../lib/firebase';
import { useSessionStore } from '../../stores/sessionStore';
import { useToastStore } from '../../stores/toastStore';
import Leaderboard from '../../components/Leaderboard';
import { AVATARS } from '../../lib/avatars';
import { Trophy, PartyPopper, Frown, Volume2, VolumeX, ChevronUp, ChevronDown, BookOpen, Play, Check, Pencil, Dices, Shuffle } from 'lucide-react';
import Confetti from '../../components/Confetti';
import CircularTimer from '../../components/CircularTimer';
import CodeBlock from '../../components/CodeBlock';
import { useAntiCheat } from '../../hooks/useAntiCheat';
import ViolationWarning from '../../components/ViolationWarning';
import { playCorrect, playWrong, playTick, playUrgentTick, playSubmit, playPodium, isMuted, setMuted as setSoundMuted } from '../../lib/sounds';
import { hapticLight, hapticMedium, hapticSuccess, hapticError } from '../../lib/haptics';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import OfflineBanner from '../../components/OfflineBanner';
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

const GAME_BG: React.CSSProperties = {
  background: `
    radial-gradient(ellipse at 20% 0%, rgba(0,158,226,0.12) 0%, transparent 50%),
    radial-gradient(ellipse at 80% 0%, rgba(112,30,168,0.08) 0%, transparent 50%),
    radial-gradient(ellipse at 50% 100%, rgba(244,207,93,0.06) 0%, transparent 50%),
    linear-gradient(160deg, #080F1E 0%, #0F1729 40%, #080F1E 100%)
  `,
};

const answerColors = [
  'bg-answer-red hover:brightness-110',
  'bg-answer-blue hover:brightness-110',
  'bg-answer-yellow hover:brightness-110',
  'bg-answer-green hover:brightness-110',
  'bg-answer-purple hover:brightness-110',
  'bg-answer-orange hover:brightness-110',
];

const answerLabels = ['A', 'B', 'C', 'D', 'E', 'F'];

export default function PlayGame() {
  const { sessionId, playerId } = useParams<{ sessionId: string; playerId: string }>();
  const navigate = useNavigate();
  const { session, setSession } = useSessionStore();
  const { addToast } = useToastStore();
  const [allQuestions, setAllQuestions] = useState<Question[]>([]);

  // Force dark mode for immersive game experience
  useEffect(() => {
    const wasDark = document.documentElement.classList.contains('dark');
    document.documentElement.classList.add('dark');
    return () => { if (!wasDark) document.documentElement.classList.remove('dark'); };
  }, []);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string>('');
  const [selectedAnswers, setSelectedAnswers] = useState<string[]>([]);
  const [matchingPairs, setMatchingPairs] = useState<Record<string, string>>({});
  const [fillAnswers, setFillAnswers] = useState<string[]>([]);
  const [orderingItems, setOrderingItems] = useState<string[]>([]);
  const [shuffledMatchOptions, setShuffledMatchOptions] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [submitFailed, setSubmitFailed] = useState(false);
  const [feedback, setFeedback] = useState<{ correct: boolean; points: number; rank: number; behindBy: number } | null>(null);
  const sawPreRevealRef = useRef(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [myTeam, setMyTeam] = useState<{ name: string; color: string } | null>(null);
  const [muted, setMutedState] = useState(isMuted());
  const [redirectCountdown, setRedirectCountdown] = useState(15);
  const toggleMute = () => { const next = !muted; setSoundMuted(next); setMutedState(next); };
  const resultUnsubRef = useRef<(() => void) | null>(null);

  // Player profile state
  const [playerNickname, setPlayerNickname] = useState('');
  const [playerAvatar, setPlayerAvatar] = useState('');
  const [editingProfile, setEditingProfile] = useState(false);
  const [editNickname, setEditNickname] = useState('');
  const [editAvatar, setEditAvatar] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // Student-paced mode state
  const [localQIndex, setLocalQIndex] = useState(0);
  const [spFinished, setSpFinished] = useState(false);
  const [questionSubset, setQuestionSubset] = useState<number[] | null>(null);
  const spQuestionStartRef = useRef(0);
  const isStudentPaced = session?.paceMode === 'student' && session?.questionState === 'student_paced';
  const spTotalQuestions = questionSubset ? questionSubset.length : totalQuestions;
  const isOnline = useNetworkStatus();
  const { showWarning, dismissWarning } = useAntiCheat({
    sessionId,
    playerId,
    enabled: session?.questionState === 'live' && session?.antiCheatEnabled !== false,
  });

  // Load player profile from localStorage
  useEffect(() => {
    if (!sessionId) return;
    try {
      const stored = localStorage.getItem(`liveclass_session_${sessionId}`);
      if (stored) {
        const parsed = JSON.parse(stored) as { nickname?: string; avatar?: string };
        if (parsed.nickname) setPlayerNickname(parsed.nickname);
        if (parsed.avatar) setPlayerAvatar(parsed.avatar);
      }
    } catch { /* ignore */ }
  }, [sessionId]);

  // Save profile via Cloud Function
  const saveProfile = async () => {
    if (!sessionId || !playerId || !editNickname.trim()) return;
    setSavingProfile(true);
    try {
      const updateFn = httpsCallable<
        { sessionId: string; playerId: string; nickname: string; avatar?: string },
        { nickname: string; avatar?: string }
      >(functions, 'updatePlayerProfile');
      const result = await updateFn({ sessionId, playerId, nickname: editNickname.trim(), avatar: editAvatar || undefined });

      const finalNickname = result.data.nickname;
      const finalAvatar = result.data.avatar || editAvatar;
      setPlayerNickname(finalNickname);
      setPlayerAvatar(finalAvatar);

      // Update localStorage
      try {
        const stored = localStorage.getItem(`liveclass_session_${sessionId}`);
        const parsed = stored ? JSON.parse(stored) : {};
        localStorage.setItem(`liveclass_session_${sessionId}`, JSON.stringify({
          ...parsed,
          nickname: finalNickname,
          avatar: finalAvatar,
        }));
      } catch { /* ignore */ }

      setEditingProfile(false);
      addToast('success', 'Profile updated!');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update profile';
      addToast('error', msg);
    } finally {
      setSavingProfile(false);
    }
  };

  useEffect(() => {
    if (!sessionId) return;
    const unsubscribe = onSnapshot(doc(db, 'sessions', sessionId), (snap) => {
      if (snap.exists()) setSession({ id: snap.id, ...snap.data() } as Session);
    });
    return unsubscribe;
  }, [sessionId, setSession]);

  // Fetch player's questionSubset for rotating sets
  useEffect(() => {
    if (!isStudentPaced || !sessionId || !playerId) return;
    getDoc(doc(db, `sessions/${sessionId}/players`, playerId)).then((snap) => {
      if (snap.exists() && snap.data().questionSubset) {
        setQuestionSubset(snap.data().questionSubset);
      }
    });
  }, [isStudentPaced, sessionId, playerId]);

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

  // Pick current question from cache when question state changes (teacher-led only)
  useEffect(() => {
    if (!session || session.questionState !== 'live' || allQuestions.length === 0) return;
    if (session.paceMode === 'student') return;
    // Clean up previous result listener
    if (resultUnsubRef.current) {
      resultUnsubRef.current();
      resultUnsubRef.current = null;
    }
    setSubmitted(false);
    setSubmitFailed(false);
    setSelectedAnswer('');
    setSelectedAnswers([]);
    setMatchingPairs({});
    setFillAnswers([]);
    setOrderingItems([]);
    setFeedback(null);
    sawPreRevealRef.current = false;

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

  // Student-paced: pick question from local index
  useEffect(() => {
    if (!isStudentPaced || allQuestions.length === 0 || spFinished) return;
    if (resultUnsubRef.current) {
      resultUnsubRef.current();
      resultUnsubRef.current = null;
    }
    setSubmitted(false);
    setSubmitFailed(false);
    setSelectedAnswer('');
    setSelectedAnswers([]);
    setMatchingPairs({});
    setFillAnswers([]);
    setOrderingItems([]);
    setFeedback(null);

    const qIdx = questionSubset
      ? questionSubset[localQIndex]
      : session?.questionOrder
        ? session.questionOrder[localQIndex]
        : localQIndex;
    const current = allQuestions[qIdx];
    if (current) {
      setCurrentQuestion(current);
      spQuestionStartRef.current = Date.now();
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
  }, [localQIndex, isStudentPaced, allQuestions, spFinished]);

  // Cleanup result listener on unmount
  useEffect(() => {
    return () => {
      if (resultUnsubRef.current) {
        resultUnsubRef.current();
        resultUnsubRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (isStudentPaced || timeLeft <= 0 || submitted || session?.timerPaused) return;
    const timer = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft, submitted, session?.timerPaused, isStudentPaced]);

  // Sync timer when host extends time (+30s) — questionStartedAt shifts back
  useEffect(() => {
    if (!session || session.questionState !== 'live' || !currentQuestion?.timeLimitSec) return;
    if (session.paceMode === 'student') return;
    const startedAt = session.questionStartedAt as any;
    const startMs = startedAt?.toMillis ? startedAt.toMillis() : (typeof startedAt === 'number' ? startedAt : 0);
    if (startMs <= 0) return;
    const now = session.timerPaused && session.timerPausedAt
      ? (typeof session.timerPausedAt === 'number' ? session.timerPausedAt : Date.now())
      : Date.now();
    const elapsed = Math.floor((now - startMs) / 1000);
    setTimeLeft(Math.max(0, currentQuestion.timeLimitSec - elapsed));
  }, [session?.questionStartedAt]);

  // Keyboard shortcuts: 1-4 for MCQ, Enter to submit
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!currentQuestion || submitted) return;
      if (e.key === 'Enter' && canSubmit()) {
        e.preventDefault();
        submitAnswer();
        return;
      }
      if ((currentQuestion.type === 'mcq' || currentQuestion.type === 'tf') && /^[1-6]$/.test(e.key)) {
        const idx = parseInt(e.key) - 1;
        if (idx < currentQuestion.options.length) {
          const opt = currentQuestion.options[idx];
          if (currentQuestion.type === 'mcq' && currentQuestion.correctAnswers.length > 1) {
            setSelectedAnswers((prev) =>
              prev.includes(opt) ? prev.filter((a) => a !== opt) : [...prev, opt]
            );
          } else {
            setSelectedAnswer(opt);
          }
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  // Sound effects
  useEffect(() => {
    if (isStudentPaced || timeLeft <= 0 || timeLeft > 5 || submitted) return;
    if (timeLeft <= 3) playUrgentTick();
    else playTick();
  }, [timeLeft, submitted, isStudentPaced]);

  useEffect(() => {
    if (!feedback) return;
    if (feedback.correct) { playCorrect(); hapticSuccess(); }
    else { playWrong(); hapticError(); }
  }, [feedback]);

  useEffect(() => {
    if (session?.status === 'ended') playPodium();
  }, [session?.status]);

  // Auto-redirect countdown when game ends
  useEffect(() => {
    if (session?.status !== 'ended') return;
    setRedirectCountdown(15);
    const timer = setInterval(() => {
      setRedirectCountdown((t) => {
        if (t <= 1) {
          clearInterval(timer);
          navigate('/');
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [session?.status, navigate]);

  const isMultiAnswer = currentQuestion?.type === 'mcq' && currentQuestion.correctAnswers.length > 1;

  const getSelection = (): string => {
    if (!currentQuestion) return selectedAnswer;
    if (isMultiAnswer) return JSON.stringify(selectedAnswers);
    if (currentQuestion.type === 'matching') return JSON.stringify(matchingPairs);
    if (currentQuestion.type === 'fill_blank') return JSON.stringify(fillAnswers);
    if (currentQuestion.type === 'ordering') return JSON.stringify(orderingItems);
    return selectedAnswer;
  };

  const canSubmit = (): boolean => {
    if (!currentQuestion) return false;
    if (currentQuestion.type === 'slide') return false;
    if (isMultiAnswer) return selectedAnswers.length > 0;
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
    hapticMedium();
    const elapsedMs = isStudentPaced
      ? Date.now() - spQuestionStartRef.current
      : (currentQuestion.timeLimitSec - timeLeft) * 1000;
    const selection = getSelection();
    const activeToken = sessionStorage.getItem(`activeToken_${sessionId}`) || '';

    try {
      // Write answer to RTDB — instant (~50ms)
      const answerRef = ref(rtdb, `liveAnswers/${sessionId}/${currentQuestion.id}/${playerId}`);
      await set(answerRef, {
        selection,
        timeMs: elapsedMs,
        activeToken,
        ts: serverTimestamp(),
      });

      // Listen for result from the background Cloud Function
      const resultRef = ref(rtdb, `results/${sessionId}/${currentQuestion.id}/${playerId}`);
      let feedbackReceived = false;

      const unsub = () => off(resultRef, 'value', handler);
      const handler = (snap: import('firebase/database').DataSnapshot) => {
        const val = snap.val();
        if (!val || feedbackReceived) return;
        feedbackReceived = true;
        unsub();
        resultUnsubRef.current = null;
        if (val.error) {
          setSubmitFailed(true);
        } else {
          setFeedback({
            correct: val.correct,
            points: val.pointsAwarded,
            rank: val.rank,
            behindBy: val.behindBy,
          });
          // Student-paced: write progress after each answer
          if (isStudentPaced) {
            writeProgress(localQIndex + 1, localQIndex + 1 >= spTotalQuestions);
          }
        }
      };

      onValue(resultRef, handler);
      resultUnsubRef.current = unsub;

      // 8-second timeout fallback
      setTimeout(() => {
        if (!feedbackReceived) {
          feedbackReceived = true;
          unsub();
          resultUnsubRef.current = null;
          // Don't show error — answer was submitted, just no feedback yet
          setFeedback({ correct: false, points: 0, rank: 0, behindBy: 0 });
        }
      }, 8000);
    } catch (err: unknown) {
      // PERMISSION_DENIED = duplicate answer (RTDB rules reject if data.exists())
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('PERMISSION_DENIED')) {
        addToast('warning', 'You already answered this question');
        setSubmitted(true);
      } else {
        setSubmitFailed(true);
      }
    }
  };

  // Student-paced: write progress to RTDB after answer + advance to next question
  const writeProgress = async (answered: number, finished: boolean) => {
    if (!sessionId || !playerId) return;
    const progressRef = ref(rtdb, `studentProgress/${sessionId}/${playerId}`);
    await set(progressRef, { answered, finished });
  };

  const spNextQuestion = async () => {
    const nextIdx = localQIndex + 1;
    await writeProgress(nextIdx, nextIdx >= spTotalQuestions);
    if (nextIdx >= spTotalQuestions) {
      setSpFinished(true);
    } else {
      setLocalQIndex(nextIdx);
    }
  };

  if (!session) {
    return (
      <div className="min-h-dvh flex items-center justify-center" style={GAME_BG}>
        <div className="w-10 h-10 border-4 border-brand/30 border-t-brand rounded-full animate-spin" role="status" aria-label="Loading session" />
      </div>
    );
  }

  // Lobby
  if (session.status === 'lobby') {
    return (
      <div className="min-h-dvh flex items-center justify-center text-white" style={GAME_BG}>
        <div className="text-center animate-fade-in max-w-sm mx-auto px-4">
          {!editingProfile ? (
            <>
              {/* Profile Display */}
              <div className="mb-6">
                <div className="w-24 h-24 rounded-full bg-white/10 border-2 border-white/20 flex items-center justify-center mx-auto mb-4">
                  {playerAvatar ? (
                    <span className="text-5xl leading-none">{playerAvatar}</span>
                  ) : (
                    <span className="text-3xl font-bold">{playerNickname?.charAt(0)?.toUpperCase() || '?'}</span>
                  )}
                </div>
                <h1 className="text-2xl font-bold mb-1">{playerNickname || 'Player'}</h1>
                {myTeam && (
                  <span className="inline-block px-4 py-1.5 rounded-full text-sm font-bold text-white mt-2" style={{ backgroundColor: myTeam.color }}>
                    {myTeam.name}
                  </span>
                )}
              </div>

              <button
                onClick={() => {
                  setEditNickname(playerNickname);
                  setEditAvatar(playerAvatar);
                  setEditingProfile(true);
                }}
                className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-sm font-medium transition-all mb-8 inline-flex items-center gap-1.5"
              >
                <Pencil className="w-3.5 h-3.5" /> Edit Profile
              </button>

              <div role="status">
                <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-4" aria-hidden="true" />
                <p className="text-white/50">Waiting for the host to start...</p>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-xl font-bold mb-5">Edit Your Profile</h2>

              {/* Selected avatar preview */}
              <div className="w-20 h-20 rounded-full bg-white/10 border-2 border-brand flex items-center justify-center mx-auto mb-4">
                <span className="text-4xl leading-none">{editAvatar || '😀'}</span>
              </div>

              {/* Emoji grid */}
              <div className="grid grid-cols-6 gap-1.5 mb-2">
                {AVATARS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setEditAvatar(emoji)}
                    className={`text-xl p-2 rounded-lg select-none touch-manipulation transition-all duration-200 ${
                      editAvatar === emoji
                        ? 'bg-brand/30 ring-2 ring-brand scale-110'
                        : 'bg-white/5 hover:bg-white/10'
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setEditAvatar(AVATARS[Math.floor(Math.random() * AVATARS.length)])}
                className="text-xs text-white/40 hover:text-white/60 inline-flex items-center gap-1 mb-5"
              >
                <Dices className="w-3 h-3" /> Shuffle
              </button>

              {/* Nickname input */}
              <div className="relative mb-5">
                <input
                  type="text"
                  value={editNickname}
                  onChange={(e) => setEditNickname(e.target.value)}
                  maxLength={20}
                  placeholder="Your nickname"
                  className="w-full text-center text-xl font-bold px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-white/30 focus:border-brand outline-none transition-all pr-12"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => {
                    const adj = ['Swift','Brave','Clever','Mighty','Cosmic','Lucky','Epic','Jolly','Sneaky','Funky','Turbo','Mega'];
                    const noun = ['Panda','Fox','Eagle','Tiger','Dolphin','Phoenix','Dragon','Wolf','Falcon','Ninja','Pirate','Wizard'];
                    setEditNickname(adj[Math.floor(Math.random() * adj.length)] + noun[Math.floor(Math.random() * noun.length)]);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white/50 hover:text-white/80 transition-all"
                  title="Random nickname"
                >
                  <Shuffle className="w-4 h-4" />
                </button>
              </div>

              {/* Action buttons */}
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => setEditingProfile(false)}
                  className="px-5 py-2.5 rounded-full text-sm font-medium text-white/50 hover:text-white/80 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={saveProfile}
                  disabled={savingProfile || !editNickname.trim()}
                  className="px-6 py-2.5 rounded-full bg-brand hover:bg-brand-dark text-white font-bold text-sm transition-all disabled:opacity-40"
                >
                  {savingProfile ? 'Saving...' : 'Save'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // Student-paced: All done screen
  if (isStudentPaced && spFinished) {
    return (
      <div className="min-h-dvh text-white p-4 sm:p-6" style={GAME_BG}>
        <div className="max-w-md mx-auto text-center py-8 sm:py-12 animate-bounce-in">
          <PartyPopper className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-4 text-success" />
          <h1 className="text-2xl sm:text-3xl mb-2">All Done!</h1>
          <p className="text-white/50 mb-6 sm:mb-8 text-sm sm:text-base">You've completed all {spTotalQuestions} questions. Wait for the host to end the session.</p>
          {sessionId && (
            <div className="card-night p-4 sm:p-6">
              <Leaderboard sessionId={sessionId} currentQuestion={spTotalQuestions} totalQuestions={spTotalQuestions} />
            </div>
          )}
        </div>
      </div>
    );
  }

  // Student-paced: Feedback + Next question
  if (isStudentPaced && feedback && submitted) {
    return (
      <div className="min-h-dvh text-white p-4 sm:p-6" style={GAME_BG}>
        <Confetti active={feedback.correct} />
        <ViolationWarning visible={showWarning} onDismiss={dismissWarning} />
        <div className="max-w-md mx-auto text-center py-8 sm:py-12" aria-live="polite">
          <div className="animate-bounce-in">
            <div className="flex justify-center mb-4" aria-hidden="true">
              {feedback.correct
                ? <PartyPopper className="w-12 h-12 sm:w-16 sm:h-16 text-success" />
                : <Frown className="w-12 h-12 sm:w-16 sm:h-16 text-danger" />}
            </div>
            <h2 className={`text-2xl sm:text-3xl mb-2 ${feedback.correct ? 'text-success' : 'text-danger'}`}>
              {feedback.correct ? 'Correct!' : 'Wrong!'}
            </h2>
            <p className="text-3xl sm:text-4xl font-bold text-white mb-2">+{feedback.points}</p>
            {feedback.rank > 0 && (
              <p className="text-white/50 text-sm mb-6">
                You're in <span className="text-white font-bold">{ordinal(feedback.rank)} place</span>
                {feedback.behindBy > 0 && <> — <span className="text-warning font-bold">{feedback.behindBy} pts</span> behind</>}
                {feedback.rank === 1 && <span className="text-warning font-bold"> — You're leading!</span>}
              </p>
            )}
          </div>
          <button
            onClick={spNextQuestion}
            className="mt-6 px-10 py-4 bg-brand hover:bg-brand-dark text-white font-bold text-lg rounded-full transition-all flex items-center justify-center gap-2 mx-auto"
            style={{ boxShadow: '0 4px 25px rgba(0, 158, 226, 0.35)' }}
          >
            {localQIndex + 1 >= spTotalQuestions ? 'See Results' : 'Next Question'}
            <Play className="w-5 h-5" />
          </button>
          <p className="text-white/30 text-sm mt-4">
            Question {localQIndex + 1} of {spTotalQuestions}
          </p>
        </div>
      </div>
    );
  }

  // Ended
  if (session.status === 'ended') {
    return (
      <div className="min-h-dvh text-white p-4 sm:p-6" style={GAME_BG}>
        <div className="max-w-md mx-auto text-center py-8 sm:py-12 animate-bounce-in">
          <Trophy className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-4 text-warning" />
          <h1 className="text-2xl sm:text-3xl mb-2">Game Over!</h1>
          <p className="text-white/50 mb-6 sm:mb-8">Thanks for playing!</p>
          {sessionId && (
            <div className="card-night p-4 sm:p-6">
              <Leaderboard sessionId={sessionId} currentQuestion={totalQuestions} totalQuestions={totalQuestions} />
            </div>
          )}
          <button
            onClick={() => navigate('/')}
            className="mt-6 px-8 py-3 bg-brand hover:bg-brand-dark text-white font-bold rounded-full transition-all"
          >
            Back to Home
          </button>
          <p className="text-white/30 text-sm mt-3">
            Redirecting in {redirectCountdown}s...
          </p>
        </div>
      </div>
    );
  }

  // Reveal
  if (session.questionState === 'reveal') {
    const alreadySawFeedback = sawPreRevealRef.current;
    return (
      <div className="min-h-dvh text-white p-4 sm:p-6" style={GAME_BG}>
        {!alreadySawFeedback && <Confetti active={feedback?.correct === true} />}
        <ViolationWarning visible={showWarning} onDismiss={dismissWarning} />
        <div className="max-w-md mx-auto text-center py-8 sm:py-12" aria-live="polite">
          {feedback && (
            <div className={alreadySawFeedback ? '' : 'animate-bounce-in'}>
              <div className="flex justify-center mb-4" aria-hidden="true">
                {feedback.correct
                  ? <PartyPopper className="w-12 h-12 sm:w-16 sm:h-16 text-success" />
                  : <Frown className="w-12 h-12 sm:w-16 sm:h-16 text-danger" />}
              </div>
              <h2 className={`text-2xl sm:text-3xl mb-2 ${feedback.correct ? 'text-success' : 'text-danger'}`}>
                {feedback.correct ? 'Correct!' : 'Wrong!'}
              </h2>
              <p className="text-3xl sm:text-4xl font-bold text-white mb-2">+{feedback.points}</p>
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
            <div className={`card-night p-4 sm:p-6 ${alreadySawFeedback ? '' : 'animate-slide-up'}`}>
              <Leaderboard sessionId={sessionId} compact currentQuestion={(session.currentQuestionIndex || 0) + 1} totalQuestions={totalQuestions} />
            </div>
          )}
          <p className="text-white/30 mt-6 text-sm">Next question coming up...</p>
        </div>
      </div>
    );
  }

  // Submitted with feedback during live — show result + provisional leaderboard instantly
  if (session.questionState === 'live' && submitted && feedback && !isStudentPaced) {
    sawPreRevealRef.current = true;
    return (
      <div className="min-h-dvh text-white p-4 sm:p-6" style={GAME_BG}>
        <Confetti active={feedback.correct} />
        <ViolationWarning visible={showWarning} onDismiss={dismissWarning} />
        <div className="max-w-md mx-auto text-center py-8 sm:py-12" aria-live="polite">
          <div className="animate-bounce-in">
            <div className="flex justify-center mb-4" aria-hidden="true">
              {feedback.correct
                ? <PartyPopper className="w-12 h-12 sm:w-16 sm:h-16 text-success" />
                : <Frown className="w-12 h-12 sm:w-16 sm:h-16 text-danger" />}
            </div>
            <h2 className={`text-2xl sm:text-3xl mb-2 ${feedback.correct ? 'text-success' : 'text-danger'}`}>
              {feedback.correct ? 'Correct!' : 'Wrong!'}
            </h2>
            <p className="text-3xl sm:text-4xl font-bold text-white mb-2">+{feedback.points}</p>
            {feedback.rank > 0 && (
              <p className="text-white/50 text-sm mb-6">
                You're in <span className="text-white font-bold">{ordinal(feedback.rank)} place</span>
                {feedback.behindBy > 0 && <> — <span className="text-warning font-bold">{feedback.behindBy} pts</span> behind</>}
                {feedback.rank === 1 && <span className="text-warning font-bold"> — You're leading!</span>}
              </p>
            )}
          </div>
          {sessionId && (
            <div className="card-night p-4 sm:p-6 animate-slide-up">
              <Leaderboard sessionId={sessionId} compact currentQuestion={(session.currentQuestionIndex || 0) + 1} totalQuestions={totalQuestions} />
            </div>
          )}
          <div className="flex items-center justify-center gap-2 mt-6 text-white/30 text-sm">
            <div className="w-4 h-4 border-2 border-white/20 border-t-white/50 rounded-full animate-spin" />
            Waiting for everyone...
          </div>
        </div>
      </div>
    );
  }

  // Loading question
  if (!currentQuestion) {
    return (
      <div className="min-h-dvh flex items-center justify-center" style={GAME_BG}>
        <div className="w-10 h-10 border-4 border-brand/30 border-t-brand rounded-full animate-spin" role="status" aria-label="Loading question" />
      </div>
    );
  }

  // Live question
  return (
    <div className="min-h-dvh flex flex-col" style={GAME_BG}>
      {!isOnline && <OfflineBanner />}
      <ViolationWarning visible={showWarning} onDismiss={dismissWarning} />
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          {playerAvatar && <span className="text-lg leading-none">{playerAvatar}</span>}
          <div className="flex flex-col">
            <span className="text-white/70 text-xs font-semibold truncate max-w-28 sm:max-w-40">{playerNickname}</span>
            <span className="text-white/40 text-[11px] font-medium">Q{isStudentPaced ? localQIndex + 1 : (session.currentQuestionIndex || 0) + 1}{myTeam ? ` · ${myTeam.name.split(' ')[0]}` : ''}</span>
          </div>
        </div>
        <div className="flex flex-col items-center">
          {submitted ? (
            <div className="w-20 h-20 flex items-center justify-center" role="status" aria-label="Answer submitted">
              <div className="w-12 h-12 rounded-full bg-success/20 border-2 border-success flex items-center justify-center animate-bounce-in" aria-hidden="true">
                <svg className="w-6 h-6 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
          ) : isStudentPaced ? (
            <div className="flex flex-col items-center">
              <span className="text-2xl font-bold text-white tabular-nums">
                {localQIndex + 1}<span className="text-white/30">/{spTotalQuestions}</span>
              </span>
              <span className="text-[10px] text-white/40 uppercase tracking-wider font-medium">Your Pace</span>
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
        <div className="text-center py-3 sm:py-6 animate-fade-in">
          <h2 className="text-xl md:text-2xl font-bold text-white wrap-break-word">{currentQuestion.text}</h2>
          {currentQuestion.imageUrl && (
            <img src={currentQuestion.imageUrl} alt="Question image" className="max-h-28 sm:max-h-40 mx-auto mt-4 rounded-xl object-contain" />
          )}
          {currentQuestion.videoUrl && getYouTubeId(currentQuestion.videoUrl) && (
            <div className="mt-4 mx-auto w-full max-w-md aspect-video rounded-xl overflow-hidden">
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
          <>
            {isMultiAnswer && (
              <p className="text-center text-white/50 text-sm mb-2 animate-fade-in">Select all that apply</p>
            )}
            <div className="grid grid-cols-2 gap-2 sm:gap-3 flex-1 max-h-[60dvh] sm:max-h-100">
              {currentQuestion.options.map((opt, i) => {
                const isSelected = isMultiAnswer
                  ? selectedAnswers.includes(opt)
                  : selectedAnswer === opt;
                return (
                  <button
                    key={i}
                    onClick={() => {
                      if (!submitted) {
                        hapticLight();
                        if (isMultiAnswer) {
                          setSelectedAnswers((prev) =>
                            prev.includes(opt) ? prev.filter((a) => a !== opt) : [...prev, opt]
                          );
                        } else {
                          setSelectedAnswer(opt);
                        }
                      }
                    }}
                    disabled={submitted}
                    aria-pressed={isSelected}
                    aria-label={`Answer ${answerLabels[i % answerLabels.length]}: ${opt}`}
                    className={`rounded-2xl text-white font-bold text-base md:text-lg flex items-center justify-center gap-2 p-4 min-h-14 select-none touch-manipulation transition-all ${
                      answerColors[i % answerColors.length]
                    } ${
                      isSelected ? 'ring-4 ring-white scale-95' : ''
                    } ${
                      submitted ? 'opacity-60' : 'active:scale-95'
                    }`}
                  >
                    {isMultiAnswer && isSelected ? (
                      <Check className="w-5 h-5 shrink-0" />
                    ) : (
                      <span className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center text-sm font-black shrink-0">{answerLabels[i % answerLabels.length]}</span>
                    )}
                    <span className="wrap-break-word text-center min-w-0">{opt}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {currentQuestion.type === 'short' && (
          <div className="w-full max-w-md mx-auto mt-4">
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
        )}

        {currentQuestion.type === 'code_output' && (
          <div className="flex flex-col items-center gap-4 mt-4">
            {currentQuestion.codeSnippet && (
              <CodeBlock code={currentQuestion.codeSnippet} language={currentQuestion.codeLanguage} className="w-full max-w-lg" />
            )}
            <div className="w-full max-w-md">
              <input
                type="text"
                value={selectedAnswer}
                onChange={(e) => setSelectedAnswer(e.target.value)}
                placeholder="What will this code output?"
                disabled={submitted}
                className="w-full text-center text-2xl font-bold px-6 py-5 rounded-2xl border-2 border-white/20 bg-white/10 text-white placeholder:text-white/30 focus:border-brand focus:ring-4 focus:ring-brand/20 outline-none backdrop-blur"
                autoFocus
              />
            </div>
          </div>
        )}

        {/* Matching UI */}
        {currentQuestion.type === 'matching' && (
          <div className="flex-1 space-y-2 sm:space-y-3 max-w-md mx-auto w-full">
            {currentQuestion.options.map((left, i) => (
              <div key={i} className={`flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-xl border-2 ${
                matchingPairs[left] ? 'border-brand/50 bg-white/5' : 'border-white/10'
              }`}>
                <span className={`font-bold text-white px-3 py-1.5 rounded-lg text-sm shrink-0 wrap-break-word ${answerColors[i % answerColors.length].split(' ')[0]}`}>
                  {left}
                </span>
                <span className="hidden sm:inline text-white/30">&rarr;</span>
                <select
                  value={matchingPairs[left] || ''}
                  onChange={(e) => setMatchingPairs({ ...matchingPairs, [left]: e.target.value })}
                  disabled={submitted}
                  className="w-full sm:flex-1 px-3 py-2 rounded-lg bg-white/10 text-white border border-white/20 outline-none focus:border-brand"
                >
                  <option value="" className="bg-gray-800 dark:bg-gray-800 text-white">Select...</option>
                  {shuffledMatchOptions.map((right) => (
                    <option key={right} value={right} className="bg-gray-800 dark:bg-gray-800 text-white">{right}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}

        {/* Fill in the Blank UI */}
        {currentQuestion.type === 'fill_blank' && (
          <div className="mt-4">
            <div className="w-full max-w-lg mx-auto space-y-4">
              <div className="text-base sm:text-lg text-white leading-relaxed text-center">
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
                        className="inline-block w-24 sm:w-32 mx-1 px-2 py-1 text-center font-bold rounded-lg border-2 border-brand/50 bg-white/10 text-white placeholder:text-white/30 outline-none focus:border-brand"
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
          <div className="grid grid-cols-2 gap-2 sm:gap-3 flex-1 max-h-[60dvh] sm:max-h-100">
            {currentQuestion.options.map((opt, i) => (
              <button
                key={i}
                onClick={() => { if (!submitted) { hapticLight(); setSelectedAnswer(opt); } }}
                disabled={submitted}
                aria-pressed={selectedAnswer === opt}
                aria-label={`Option ${answerLabels[i % answerLabels.length]}: ${opt}`}
                className={`rounded-2xl text-white font-bold text-base md:text-lg flex items-center justify-center gap-2 p-4 min-h-14 select-none touch-manipulation transition-all ${
                  answerColors[i % answerColors.length]
                } ${
                  selectedAnswer === opt ? 'ring-4 ring-white scale-95' : ''
                } ${
                  submitted ? 'opacity-60' : 'active:scale-95'
                }`}
              >
                <span className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center text-sm font-black shrink-0">{answerLabels[i % answerLabels.length]}</span>
                <span className="wrap-break-word text-center min-w-0">{opt}</span>
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
            className="mt-4 py-4 btn-3d-cyan text-white font-bold text-lg animate-slide-up w-full select-none touch-manipulation"
          >
            Submit Answer
          </button>
        )}

        {submitted && !feedback && !submitFailed && (
          <div className="mt-4 py-4 text-center text-white/50 animate-fade-in" role="status">
            <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-2" aria-hidden="true" />
            Waiting for results...
          </div>
        )}

        {submitFailed && (
          <div className="mt-4 text-center animate-fade-in" role="alert">
            <p className="text-danger font-bold mb-2">Failed to submit answer</p>
            <button
              onClick={submitAnswer}
              className="py-3 px-8 bg-white dark:bg-white text-surface-dark dark:text-surface-dark font-bold text-base rounded-2xl hover:bg-gray-100 dark:hover:bg-gray-100 transition-all shadow-lg"
            >
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
