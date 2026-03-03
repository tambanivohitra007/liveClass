import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { doc, onSnapshot, collection, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { ref, onValue, off } from 'firebase/database';
import { db, functions, rtdb } from '../../lib/firebase';
import { APP_URL } from '../../lib/config';
import { useSessionStore } from '../../stores/sessionStore';
import { useToastStore } from '../../stores/toastStore';
import { confirmAction } from '../../lib/swal';
import Leaderboard from '../../components/Leaderboard';
import { ShieldAlert, Users, Shuffle, Music, Volume2, VolumeX, Pause, Play, SkipForward, SlidersHorizontal, Zap, Sparkles, GraduationCap, Presentation, CheckCircle2, Dices, AlertTriangle, X, Maximize2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { startLobbyMusic, stopLobbyMusic, playJoin, isMuted, setMuted as setSoundMuted, MUSIC_TRACKS, setLobbyTrack, getLobbyTrack } from '../../lib/sounds';
import CodeBlock from '../../components/CodeBlock';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import OfflineBanner from '../../components/OfflineBanner';
import type { Session, SessionPlayer, Question, ViolationDoc } from '../../types/models';
import { TEAM_PRESETS } from '../../types/models';

const AVATAR_COLORS = [
  { bg: 'bg-cyan-500/20', border: 'border-cyan-500/40', text: 'text-cyan-400' },
  { bg: 'bg-purple-500/20', border: 'border-purple-500/40', text: 'text-purple-400' },
  { bg: 'bg-sky-500/20', border: 'border-sky-500/40', text: 'text-sky-400' },
  { bg: 'bg-violet-500/20', border: 'border-violet-500/40', text: 'text-violet-400' },
  { bg: 'bg-indigo-500/20', border: 'border-indigo-500/40', text: 'text-indigo-400' },
  { bg: 'bg-blue-500/20', border: 'border-blue-500/40', text: 'text-blue-400' },
  { bg: 'bg-teal-500/20', border: 'border-teal-500/40', text: 'text-teal-400' },
  { bg: 'bg-fuchsia-500/20', border: 'border-fuchsia-500/40', text: 'text-fuchsia-400' },
];

const MESH_BG: React.CSSProperties = {
  background: `
    radial-gradient(ellipse at 20% 0%, rgba(0,158,226,0.12) 0%, transparent 50%),
    radial-gradient(ellipse at 80% 0%, rgba(112,30,168,0.08) 0%, transparent 50%),
    radial-gradient(ellipse at 50% 100%, rgba(244,207,93,0.06) 0%, transparent 50%),
    linear-gradient(160deg, #080F1E 0%, #0F1729 40%, #080F1E 100%)
  `,
};

const MARQUEE_ITEMS = [
  'GET READY TO LEARN',
  'WARMING UP THE BRAINS',
  'LOADING QUESTIONS',
  'MAY THE BEST PLAYER WIN',
  'KNOWLEDGE IS POWER',
  'STAY SHARP',
];

export default function HostSession() {
  const { quizId } = useParams<{ quizId: string }>();
  const [searchParams] = useSearchParams();
  const { session, setSession, players, setPlayers } = useSessionStore();

  // Force dark mode for immersive game experience
  useEffect(() => {
    const wasDark = document.documentElement.classList.contains('dark');
    document.documentElement.classList.add('dark');
    return () => { if (!wasDark) document.documentElement.classList.remove('dark'); };
  }, []);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [currentQuestionText, setCurrentQuestionText] = useState('');
  const [currentCodeSnippet, setCurrentCodeSnippet] = useState('');
  const [currentCodeLanguage, setCurrentCodeLanguage] = useState('');
  const [currentTimeLimitSec, setCurrentTimeLimitSec] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [error, setError] = useState('');
  const [violations, setViolations] = useState<Map<string, ViolationDoc>>(new Map());
  const [muted, setMutedState] = useState(isMuted());
  const [lobbyTrack, setLobbyTrackState] = useState(getLobbyTrack());

  const [answeredCount, setAnsweredCount] = useState(0);
  const [answeredPlayerIds, setAnsweredPlayerIds] = useState<Set<string>>(new Set());
  const [studentProgress, setStudentProgress] = useState<Record<string, { answered: number; finished: boolean }>>({});
  const [endingSession, setEndingSession] = useState(false);
  const [preReveal, setPreReveal] = useState(false);
  const [qrZoomed, setQrZoomed] = useState(false);
  const prevPlayerCountRef = useRef(0);
  const lobbyGridRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const isOnline = useNetworkStatus();
  const addToast = useToastStore((s) => s.addToast);

  // Refs for listener cleanup and unmount logic
  const unsubscribesRef = useRef<(() => void)[]>([]);
  const sessionRef = useRef<Session | null>(null);

  // Refs for keyboard handler (avoids re-registering listener on every render)
  const playersLengthRef = useRef(0);
  const totalQuestionsRef = useRef(0);
  const keyboardActionsRef = useRef<{
    startQuestion: () => void;
    endQuestion: () => void;
    nextQuestion: () => void;
    endStudentPacedSessionFn: () => void;
    endSessionEarly: () => void;
    navigate: ReturnType<typeof useNavigate>;
  } | null>(null);

  const [allQuestions, setAllQuestions] = useState<Question[]>([]);

  useEffect(() => {
    if (!quizId) return;
    const loadQuestions = async () => {
      const q = query(collection(db, 'questions'), where('quizId', '==', quizId));
      const snap = await getDocs(q);
      const qs = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Question[];
      setAllQuestions(qs);
      setTotalQuestions(qs.length);
    };
    loadQuestions();
  }, [quizId]);

  const cancelledRef = useRef(false);

  const createSession = async () => {
    if (!quizId) return;
    try {
      const fn = httpsCallable<{ quizId: string }, { sessionId: string }>(functions, 'createSession');
      const result = await fn({ quizId });
      if (cancelledRef.current) {
        // Effect was cleaned up while Cloud Function was in-flight — end the orphan session
        updateDoc(doc(db, 'sessions', result.data.sessionId), {
          status: 'ended',
          endedAt: Date.now(),
        }).catch(() => {});
        return;
      }
      subscribeToSession(result.data.sessionId);
    } catch (err) {
      if (!cancelledRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to create session');
      }
    }
  };

  const subscribeToSession = (sessionId: string) => {
    // Clean up any existing listeners first
    unsubscribesRef.current.forEach((unsub) => unsub());
    unsubscribesRef.current = [];

    const unsub1 = onSnapshot(doc(db, 'sessions', sessionId), (snap) => {
      if (snap.exists()) {
        const s = { id: snap.id, ...snap.data() } as Session;
        setSession(s);
        sessionRef.current = s;
      }
    });
    const unsub2 = onSnapshot(collection(db, `sessions/${sessionId}/players`), (snap) => {
      setPlayers(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as SessionPlayer[]);
    });
    const unsub3 = onSnapshot(collection(db, `sessions/${sessionId}/violations`), (snap) => {
      const map = new Map<string, ViolationDoc>();
      snap.docs.forEach((d) => map.set(d.id, d.data() as ViolationDoc));
      setViolations(map);
    });

    unsubscribesRef.current = [unsub1, unsub2, unsub3];
  };

  useEffect(() => {
    if (!session || session.questionState !== 'live' || allQuestions.length === 0) return;
    // Reset for new question — prevent stale data from triggering auto-end
    timerTickedRef.current = false;
    autoEndCalledRef.current = false;
    setPreReveal(false);
    // currentQuestionId reset removed — now derived from session props
    setAnsweredCount(0);
    const qIdx = session.questionOrder
      ? session.questionOrder[session.currentQuestionIndex]
      : session.currentQuestionIndex;
    const current = allQuestions[qIdx];
    setCurrentQuestionText(current?.text || '');
    setCurrentCodeSnippet(current?.codeSnippet || '');
    setCurrentCodeLanguage(current?.codeLanguage || '');
    // question ID now derived from session props in the subscription effect
    if (current?.timeLimitSec) {
      setCurrentTimeLimitSec(current.timeLimitSec);
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
    }
  }, [session?.currentQuestionIndex, session?.questionState, allQuestions]);

  const autoEndCalledRef = useRef(false);
  const timerTickedRef = useRef(false);

  // Clear pre-reveal when CF completes and questionState transitions to 'reveal'
  useEffect(() => {
    if (session?.questionState === 'reveal') {
      setPreReveal(false);
    }
  }, [session?.questionState]);

  // Safety timeout — reset preReveal if CF doesn't complete in 10s
  useEffect(() => {
    if (!preReveal) return;
    const timeout = setTimeout(() => {
      setPreReveal(false);
      autoEndCalledRef.current = false;
      addToast('error', 'Score finalization timed out. Try ending the question again.');
    }, 10000);
    return () => clearTimeout(timeout);
  }, [preReveal]);

  // Timer countdown
  useEffect(() => {
    if (!session || session.questionState !== 'live') {
      autoEndCalledRef.current = false;
      timerTickedRef.current = false;
      return;
    }
    if (timeLeft <= 0 || session.timerPaused) return;
    const timer = setInterval(() => {
      timerTickedRef.current = true;
      setTimeLeft((t) => Math.max(0, t - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [session?.questionState, timeLeft, session?.timerPaused]);

  // Timer auto-end — only after the countdown has actually ticked
  useEffect(() => {
    if (!session || session.questionState !== 'live' || session.timerPaused) return;
    if (!timerTickedRef.current) return;
    if (timeLeft <= 0 && currentTimeLimitSec > 0 && !autoEndCalledRef.current) {
      autoEndCalledRef.current = true;
      setPreReveal(true);
      httpsCallable(functions, 'endQuestion')({ sessionId: session.id });
    }
  }, [timeLeft, session?.questionState, currentTimeLimitSec, session?.timerPaused]);

  // Subscribe to RTDB answer count and auto-end when all players have answered.
  useEffect(() => {
    if (!session || session.questionState !== 'live' || allQuestions.length === 0) {
      setAnsweredCount(0);
      return;
    }
    const qIdx = session.questionOrder
      ? session.questionOrder[session.currentQuestionIndex]
      : session.currentQuestionIndex;
    const qId = allQuestions[qIdx]?.id;
    if (!qId) {
      setAnsweredCount(0);
      return;
    }
    setAnsweredCount(0);
    const countRef = ref(rtdb, `answerCounts/${session.id}/${qId}/count`);
    const handler = (snap: import('firebase/database').DataSnapshot) => {
      const count: number = snap.val() || 0;
      setAnsweredCount(count);
      if (count > 0 && count >= players.length && !autoEndCalledRef.current) {
        autoEndCalledRef.current = true;
        setTimeLeft(0);
        setPreReveal(true);
        httpsCallable(functions, 'endQuestion')({ sessionId: session.id });
      }
    };
    onValue(countRef, handler);
    return () => off(countRef, 'value', handler);
  }, [session?.id, session?.questionState, session?.currentQuestionIndex, session?.questionOrder, allQuestions, players.length]);

  // Subscribe to RTDB liveAnswers to track which players have answered
  useEffect(() => {
    if (!session || session.questionState !== 'live' || allQuestions.length === 0) {
      setAnsweredPlayerIds(new Set());
      return;
    }
    const qIdx = session.questionOrder
      ? session.questionOrder[session.currentQuestionIndex]
      : session.currentQuestionIndex;
    const qId = allQuestions[qIdx]?.id;
    if (!qId) {
      setAnsweredPlayerIds(new Set());
      return;
    }
    setAnsweredPlayerIds(new Set());
    const answersRef = ref(rtdb, `liveAnswers/${session.id}/${qId}`);
    const handler = (snap: import('firebase/database').DataSnapshot) => {
      const val = snap.val();
      setAnsweredPlayerIds(val ? new Set(Object.keys(val)) : new Set());
    };
    onValue(answersRef, handler);
    return () => off(answersRef, 'value', handler);
  }, [session?.id, session?.questionState, session?.currentQuestionIndex, session?.questionOrder, allQuestions]);

  // Subscribe to student progress for student-paced mode
  useEffect(() => {
    if (!session || session.questionState !== 'student_paced') {
      setStudentProgress({});
      return;
    }
    const progressRef = ref(rtdb, `studentProgress/${session.id}`);
    const handler = (snap: import('firebase/database').DataSnapshot) => {
      setStudentProgress(snap.val() || {});
    };
    onValue(progressRef, handler);
    return () => off(progressRef, 'value', handler);
  }, [session?.id, session?.questionState]);

  const endStudentPacedSessionFn = async () => {
    if (!session || endingSession) return;
    setEndingSession(true);
    try {
      await httpsCallable(functions, 'endStudentPacedSession')({ sessionId: session.id });
    } catch {
      setEndingSession(false);
    }
  };

  const startQuestionDirect = async (qIndex: number) => {
    if (!session) return;
    const updateData: Record<string, unknown> = {
      status: 'live',
      currentQuestionIndex: qIndex,
      questionState: 'live',
      questionStartedAt: Date.now(),
      timerPaused: false,
      timerPausedAt: null,
    };
    // Generate shuffle order on first question if enabled
    if (qIndex === 0 && session.shuffleQuestions && allQuestions.length > 0) {
      const indices = Array.from({ length: allQuestions.length }, (_, i) => i);
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }
      updateData.questionOrder = indices;
    }
    await updateDoc(doc(db, 'sessions', session.id), updateData);
  };

  const startQuestion = async () => {
    if (session?.paceMode === 'student') {
      // Assign rotating question subsets if enabled
      if (session.rotatingSetSize && session.rotatingSetSize < allQuestions.length) {
        await httpsCallable(functions, 'assignQuestionSubsets')({ sessionId: session.id });
      }
      // Student-paced: set session live with student_paced questionState
      const updateData: Record<string, unknown> = {
        status: 'live',
        questionState: 'student_paced',
        questionStartedAt: Date.now(),
      };
      // Generate shuffle order if enabled
      if (session.shuffleQuestions && allQuestions.length > 0) {
        const indices = Array.from({ length: allQuestions.length }, (_, i) => i);
        for (let i = indices.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [indices[i], indices[j]] = [indices[j], indices[i]];
        }
        updateData.questionOrder = indices;
      }
      await updateDoc(doc(db, 'sessions', session.id), updateData);
      return;
    }
    startQuestionDirect(session?.currentQuestionIndex ?? 0);
  };
  const nextQuestion = () => startQuestionDirect((session?.currentQuestionIndex ?? 0) + 1);

  const endQuestion = async () => {
    if (!session || autoEndCalledRef.current) return;
    autoEndCalledRef.current = true;
    setPreReveal(true);
    try {
      await httpsCallable(functions, 'endQuestion')({ sessionId: session.id });
    } catch {
      setPreReveal(false);
      autoEndCalledRef.current = false;
      addToast('error', 'Failed to end question');
    }
  };

  const togglePause = async () => {
    if (!session) return;
    if (session.timerPaused) {
      const newStartedAt = Date.now() - (currentTimeLimitSec - timeLeft) * 1000;
      await updateDoc(doc(db, 'sessions', session.id), {
        timerPaused: false,
        timerPausedAt: null,
        questionStartedAt: newStartedAt,
      });
    } else {
      await updateDoc(doc(db, 'sessions', session.id), {
        timerPaused: true,
        timerPausedAt: Date.now(),
      });
    }
  };

  const extendTimer = async () => {
    if (!session) return;
    const startedAt = session.questionStartedAt as any;
    const startMs = startedAt?.toMillis ? startedAt.toMillis() : (typeof startedAt === 'number' ? startedAt : 0);
    if (startMs > 0) {
      await updateDoc(doc(db, 'sessions', session.id), { questionStartedAt: startMs + 30000 });
      setTimeLeft((t) => t + 30);
    }
  };

  const skipQuestion = async () => {
    if (!session) return;
    // Fire-and-forget: don't await endQuestion so the next question starts immediately
    httpsCallable(functions, 'endQuestion')({ sessionId: session.id });
    if (session.currentQuestionIndex < totalQuestions - 1) {
      await startQuestionDirect(session.currentQuestionIndex + 1);
    }
  };

  // Init: resume existing session or create new one
  useEffect(() => {
    cancelledRef.current = false;

    const existingSessionId = searchParams.get('sessionId');
    if (existingSessionId) {
      subscribeToSession(existingSessionId);
    } else {
      createSession();
    }

    return () => {
      // Signal any in-flight createSession to discard its result
      cancelledRef.current = true;

      // Unsubscribe all listeners
      unsubscribesRef.current.forEach((unsub) => unsub());
      unsubscribesRef.current = [];

      // End session if still active
      const s = sessionRef.current;
      if (s && (s.status === 'lobby' || s.status === 'live')) {
        updateDoc(doc(db, 'sessions', s.id), {
          status: 'ended',
          endedAt: Date.now(),
        }).catch(() => {
          // Best-effort; TTL cleanup is the safety net
        });
      }

      // Clear Zustand store
      setSession(null);
      setPlayers([]);
    };
  }, [quizId]);

  // Navigate to results when student-paced session ends
  useEffect(() => {
    if (session?.status === 'ended' && session?.paceMode === 'student') {
      navigate(`/session/${session.id}/results`);
    }
  }, [session?.status, session?.paceMode]);

  // Custom navigation blocker (works with BrowserRouter)
  const isSessionActive = session?.status === 'lobby' || session?.status === 'live';
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const pendingNavigationRef = useRef<(() => void) | null>(null);
  const leavingRef = useRef(false);

  // Block browser tab close / refresh
  useEffect(() => {
    if (!isSessionActive) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isSessionActive]);

  // Block browser back/forward button
  useEffect(() => {
    if (!isSessionActive) return;
    window.history.pushState(null, '', window.location.href);
    const handler = () => {
      if (leavingRef.current) return;
      window.history.pushState(null, '', window.location.href);
      setShowLeaveDialog(true);
      pendingNavigationRef.current = () => {
        leavingRef.current = true;
        window.history.go(-1);
      };
    };
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, [isSessionActive]);

  if (error) return (
    <div className="min-h-dvh flex items-center justify-center" style={MESH_BG}>
      <div className="text-center">
        <p className="text-danger mb-4">{error}</p>
        <button onClick={() => navigate('/dashboard')} className="text-brand underline">Back to Dashboard</button>
      </div>
    </div>
  );

  const isLastQuestion = session ? session.currentQuestionIndex >= totalQuestions - 1 : false;

  const endSessionEarly = async () => {
    if (!session || endingSession) return;
    const { isConfirmed } = await confirmAction(
      'End session early?',
      'This will end the session for all students. Scores and answers up to this point are preserved.',
      'Yes, end session',
    );
    if (!isConfirmed) return;
    setEndingSession(true);
    try {
      await updateDoc(doc(db, 'sessions', session.id), { status: 'ended', endedAt: Date.now() });
      navigate(`/session/${session.id}/results`);
    } catch {
      addToast('error', 'Failed to end session');
    } finally {
      setEndingSession(false);
    }
  };

  // Sync refs for the keyboard handler (runs every render, but does NOT register listeners)
  useEffect(() => { playersLengthRef.current = players.length; });
  useEffect(() => { totalQuestionsRef.current = totalQuestions; });
  useEffect(() => {
    keyboardActionsRef.current = { startQuestion, endQuestion, nextQuestion, endStudentPacedSessionFn, endSessionEarly, navigate };
  });

  // Keyboard handler — registers ONCE via [] deps, reads live state from refs
  useEffect(() => {
    const handler = async (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const s = sessionRef.current;
      if (!s) return;
      e.preventDefault();
      const actions = keyboardActionsRef.current;
      if (!actions) return;
      const pLen = playersLengthRef.current;
      const tQ = totalQuestionsRef.current;

      if (s.status === 'lobby' && pLen > 0) {
        actions.startQuestion();
      } else if (s.questionState === 'student_paced') {
        const { isConfirmed } = await confirmAction(
          'End session?',
          'End the session for all students?',
          'Yes, end session',
        );
        if (isConfirmed) actions.endStudentPacedSessionFn();
      } else if (s.questionState === 'live') {
        actions.endQuestion(); // endQuestion() sets preReveal internally
      } else if (s.questionState === 'reveal' && s.currentQuestionIndex < tQ - 1) {
        actions.nextQuestion();
      } else if (s.questionState === 'reveal' && s.currentQuestionIndex >= tQ - 1) {
        try {
          await updateDoc(doc(db, 'sessions', s.id), { status: 'ended', endedAt: Date.now() });
          actions.navigate(`/session/${s.id}/results`);
        } catch {
          useToastStore.getState().addToast('error', 'Failed to end session');
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (session?.status === 'lobby' && !muted) startLobbyMusic();
    else stopLobbyMusic();
    return () => stopLobbyMusic();
  }, [session?.status, muted]);

  useEffect(() => {
    if (players.length > prevPlayerCountRef.current && prevPlayerCountRef.current > 0) playJoin();
    prevPlayerCountRef.current = players.length;
    // Auto-scroll lobby grid to show newest players
    if (lobbyGridRef.current) {
      lobbyGridRef.current.scrollTop = lobbyGridRef.current.scrollHeight;
    }
  }, [players.length]);

  const toggleMute = () => {
    const next = !muted;
    setSoundMuted(next);
    setMutedState(next);
  };

  const safeUpdateSession = async (data: Record<string, unknown>) => {
    if (!session) return;
    try {
      await updateDoc(doc(db, 'sessions', session.id), data);
    } catch {
      addToast('error', 'Failed to update session setting');
    }
  };

  if (!session) return (
    <div className="min-h-dvh flex items-center justify-center" style={MESH_BG}>
      <div className="w-10 h-10 border-4 border-brand/30 border-t-brand rounded-full animate-spin" />
    </div>
  );

  return (
    <div className={`text-white flex flex-col pt-safe ${session?.status === 'lobby' ? 'h-dvh overflow-hidden' : 'min-h-dvh'}`} style={MESH_BG}>
      {!isOnline && <OfflineBanner />}

      {/* QR Code Zoom Modal */}
      {qrZoomed && session?.pinCode && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in"
          onClick={() => setQrZoomed(false)}
        >
          <div
            className="bg-white dark:bg-white rounded-3xl p-6 sm:p-10 flex flex-col items-center gap-4 animate-bounce-in"
            onClick={(e) => e.stopPropagation()}
          >
            <QRCodeSVG
              value={`${APP_URL}/join?pin=${session.pinCode}`}
              size={Math.min(window.innerWidth - 80, window.innerHeight - 200, 400)}
              level="M"
            />
            <p className="text-gray-800 dark:text-gray-800 font-bold text-lg">PIN: <span className="text-brand tracking-widest text-2xl">{session.pinCode}</span></p>
            <p className="text-gray-400 dark:text-gray-400 text-sm font-medium text-center">Or go to <span className="text-gray-600 dark:text-gray-600 font-semibold">{window.location.host}</span> and enter the PIN</p>
          </div>
          <button
            onClick={() => setQrZoomed(false)}
            className="mt-6 p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
          >
            <X className="w-6 h-6 text-white" />
          </button>
        </div>
      )}

      {/* ══════════ Top Navigation Bar ══════════ */}
      <header className="flex items-center justify-between px-4 sm:px-8 py-2 sm:py-3 w-full max-w-7xl mx-auto shrink-0">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="bg-brand p-1.5 sm:p-2 rounded-lg flex items-center justify-center">
            <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
          </div>
          <h1 className="text-base sm:text-xl font-bold tracking-tight">
            LiveClass <span className="text-brand">Game</span>
          </h1>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="flex items-center gap-1.5 sm:gap-2.5 bg-white/10 backdrop-blur-md px-3 sm:px-5 py-1.5 sm:py-2 rounded-full border border-white/5">
            <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 bg-success rounded-full animate-pulse" />
            <span className="text-xs sm:text-sm font-semibold">
              <span className="hidden sm:inline">{players.length} Player{players.length !== 1 && 's'} Joined</span>
              <span className="sm:hidden">{players.length}</span>
            </span>
          </div>
          <button
            onClick={toggleMute}
            className="p-2 sm:p-2.5 hover:bg-white/10 rounded-full transition-colors text-white/60 hover:text-white"
            aria-label={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? <VolumeX className="w-4 h-4 sm:w-5 sm:h-5" /> : <Volume2 className="w-4 h-4 sm:w-5 sm:h-5" />}
          </button>
        </div>
      </header>

      {/* ══════════════════ LOBBY ══════════════════ */}
      {session.status === 'lobby' && (
        <>
          <main className="grow flex flex-col lg:flex-row gap-4 sm:gap-6 px-4 sm:px-8 py-2 sm:py-4 max-w-7xl mx-auto w-full min-h-0">

            {/* ── Left Column: PIN Hero + Players ── */}
            <div className="grow flex flex-col gap-3 sm:gap-4 min-h-0">

              {/* Hero PIN + QR Section */}
              <div className="relative flex flex-col items-center py-4 sm:py-6 px-4 sm:px-8 bg-white/[0.07] border border-white/12 rounded-2xl overflow-hidden backdrop-blur-md animate-bounce-in shadow-xl shadow-black/20 shrink-0">
                <div className="absolute inset-0 bg-linear-to-br from-purple-500/10 via-transparent to-brand/10" />
                <h2 className="relative text-sm sm:text-base font-medium text-white/60 mb-2 sm:mb-4 uppercase tracking-[0.2em]">
                  Join the Game
                </h2>
                <div className="relative flex flex-col sm:flex-row items-center gap-4 sm:gap-8">
                  {/* PIN */}
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-sm font-medium text-brand">Enter Game PIN</p>
                    <div
                      className="bg-white dark:bg-white text-surface-dark dark:text-surface-dark px-6 sm:px-10 py-2 sm:py-3 rounded-2xl flex items-center gap-2 sm:gap-3 animate-glow-pulse"
                      style={{ boxShadow: '0 0 60px rgba(0, 158, 226, 0.3)' }}
                    >
                      <span className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">
                        {session.pinCode.slice(0, 3)}
                      </span>
                      <div className="w-1 sm:w-1.5 h-6 sm:h-10 bg-gray-200 dark:bg-gray-200 rounded-full" />
                      <span className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">
                        {session.pinCode.slice(3)}
                      </span>
                    </div>
                  </div>

                  {/* Vertical divider (desktop) */}
                  <div className="hidden sm:flex flex-col items-center gap-2 self-stretch justify-center">
                    <div className="flex-1 w-px bg-linear-to-b from-transparent via-white/15 to-transparent" />
                    <span className="text-[10px] uppercase tracking-widest text-white/30 font-medium">or</span>
                    <div className="flex-1 w-px bg-linear-to-b from-transparent via-white/15 to-transparent" />
                  </div>
                  {/* Horizontal divider (mobile) */}
                  <div className="flex sm:hidden items-center gap-3 w-full">
                    <div className="flex-1 h-px bg-linear-to-r from-transparent via-white/15 to-transparent" />
                    <span className="text-[10px] uppercase tracking-widest text-white/30 font-medium">or</span>
                    <div className="flex-1 h-px bg-linear-to-r from-transparent via-white/15 to-transparent" />
                  </div>

                  {/* QR Code */}
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-sm font-medium text-brand">Scan to Join</p>
                    <button
                      type="button"
                      onClick={() => setQrZoomed(true)}
                      className="relative group bg-white dark:bg-white p-2 sm:p-3 rounded-2xl cursor-pointer transition-transform hover:scale-105"
                      style={{ boxShadow: '0 0 40px rgba(0, 158, 226, 0.2)' }}
                      title="Click to enlarge"
                    >
                      <QRCodeSVG
                        value={`${APP_URL}/join?pin=${session.pinCode}`}
                        size={100}
                        level="M"
                        className="sm:w-32 sm:h-32"
                      />
                      <div className="absolute inset-0 rounded-2xl bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                        <Maximize2 className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                      </div>
                    </button>
                  </div>
                </div>
              </div>

              {/* Join URL */}
              <p className="text-center text-white/40 text-sm font-medium -mt-1 sm:-mt-2 shrink-0">
                Or go to <span className="text-white/70 font-semibold select-all">{window.location.host}</span> and enter the PIN
              </p>

              {/* Players Grid */}
              <div className="flex-1 flex flex-col animate-fade-in min-h-0">
                <div className="flex items-center justify-between mb-2 shrink-0">
                  <h3 className="text-lg font-bold">Waiting Lobby</h3>
                  <span className="text-lg font-bold tabular-nums">
                    {players.length} <span className="text-sm font-medium text-white/40">player{players.length !== 1 && 's'}</span>
                  </span>
                </div>

                {session.teamMode && session.teams ? (
                  <div ref={lobbyGridRef} className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[50vh] overflow-y-auto pr-1">
                    {session.teams.map((team, ti) => {
                      const teamPlayers = players.filter((p) => p.teamIndex === ti);
                      return (
                        <div key={ti} className="bg-white/5 rounded-2xl p-4 border border-white/5">
                          <div className="flex items-center gap-2 mb-3">
                            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: team.color }} />
                            <span className="text-sm font-bold">{team.name}</span>
                            <span className="text-xs text-white/30 ml-auto">{teamPlayers.length}</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {teamPlayers.map((p, i) => {
                              const color = AVATAR_COLORS[i % AVATAR_COLORS.length];
                              return players.length <= 20 ? (
                                <div
                                  key={p.id}
                                  className={`flex items-center gap-1.5 pl-1 pr-2.5 py-0.5 rounded-full ${color.bg} border ${color.border} animate-fade-in cursor-default`}
                                >
                                  <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                                    {p.avatar ? <span className="text-base leading-none">{p.avatar}</span> : <span className={`text-[10px] font-bold ${color.text}`}>{p.nickname.charAt(0).toUpperCase()}</span>}
                                  </div>
                                  <span className={`text-xs font-semibold ${color.text} truncate max-w-20`}>{p.nickname}</span>
                                </div>
                              ) : (
                                <div
                                  key={p.id}
                                  title={p.nickname}
                                  className={`w-11 h-11 rounded-full ${color.bg} border ${color.border} flex items-center justify-center shrink-0 animate-fade-in cursor-default`}
                                >
                                  {p.avatar ? <span className="text-xl leading-none">{p.avatar}</span> : <span className={`text-xs font-bold ${color.text}`}>{p.nickname.charAt(0).toUpperCase()}</span>}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div ref={lobbyGridRef} className="flex-1 min-h-0 overflow-y-auto pr-1">
                    {players.length > 0 ? (
                      <div className="flex flex-wrap gap-2 sm:gap-2.5 content-start">
                        {players.map((p, i) => {
                          const color = AVATAR_COLORS[i % AVATAR_COLORS.length];
                          return players.length <= 20 ? (
                            <div
                              key={p.id}
                              className={`flex items-center gap-2 pl-1 pr-3 py-1 rounded-full ${color.bg} border ${color.border} animate-fade-in cursor-default hover:scale-105 transition-transform`}
                            >
                              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                                {p.avatar ? <span className="text-lg leading-none">{p.avatar}</span> : <span className={`text-xs font-bold ${color.text}`}>{p.nickname.charAt(0).toUpperCase()}</span>}
                              </div>
                              <span className={`text-sm font-semibold ${color.text} truncate max-w-24`}>{p.nickname}</span>
                            </div>
                          ) : (
                            <div
                              key={p.id}
                              title={p.nickname}
                              className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full ${color.bg} border ${color.border} flex items-center justify-center shrink-0 animate-fade-in cursor-default hover:scale-110 transition-transform`}
                            >
                              {p.avatar ? <span className="text-2xl sm:text-3xl leading-none">{p.avatar}</span> : <span className={`text-sm sm:text-base font-bold ${color.text}`}>{p.nickname.charAt(0).toUpperCase()}</span>}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-3 py-8 opacity-50">
                        <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center animate-pulse">
                          <span className="text-white/30 text-lg">+</span>
                        </div>
                        <span className="text-white/30 italic text-sm">Waiting for players...</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ── Right Column: Host Controls Sidebar ── */}
            <aside className="w-full lg:w-80 flex flex-col shrink-0 min-h-0">
              <div className="bg-white/[0.07] backdrop-blur-xl border border-white/12 rounded-2xl p-4 sm:p-5 flex flex-col gap-3 sm:gap-4 h-full shadow-lg shadow-black/10 overflow-y-auto">

                {/* Settings Header */}
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <SlidersHorizontal className="w-5 h-5 text-brand" />
                  Host Settings
                </h3>

                {/* Setting Rows */}
                <div className="space-y-2">
                  {/* Anti-Cheat */}
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 hover:bg-white/10 transition-colors group">
                    <div className="flex items-center gap-3">
                      <ShieldAlert className={`w-5 h-5 ${session.antiCheatEnabled !== false ? 'text-success' : 'text-white/50 group-hover:text-brand'} transition-colors`} />
                      <span className="text-sm font-medium">Anti-Cheat</span>
                    </div>
                    <button
                      onClick={() => safeUpdateSession({ antiCheatEnabled: session.antiCheatEnabled === false })}
                      className={`relative w-11 h-6 rounded-full transition-colors ${session.antiCheatEnabled !== false ? 'bg-success' : 'bg-white/20'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${session.antiCheatEnabled !== false ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>

                  {/* Scoring Mode */}
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 hover:bg-white/10 transition-colors group">
                    <div className="flex items-center gap-3">
                      <Zap className={`w-5 h-5 ${session.scoringMode === 'accuracy' ? 'text-success' : 'text-white/50 group-hover:text-brand'} transition-colors`} />
                      <span className="text-sm font-medium">Scoring</span>
                    </div>
                    <div className="flex items-center bg-white/10 rounded-full p-0.5 gap-0.5">
                      <button
                        onClick={() => safeUpdateSession({ scoringMode: 'speed' })}
                        className={`px-2.5 py-1 rounded-full text-xs font-bold transition-all ${
                          session.scoringMode !== 'accuracy'
                            ? 'bg-brand text-white shadow'
                            : 'text-white/50 hover:text-white'
                        }`}
                      >
                        <Zap className="w-3 h-3 inline mr-1" />
                        Speed
                      </button>
                      <button
                        onClick={() => safeUpdateSession({ scoringMode: 'accuracy' })}
                        className={`px-2.5 py-1 rounded-full text-xs font-bold transition-all ${
                          session.scoringMode === 'accuracy'
                            ? 'bg-success text-white shadow'
                            : 'text-white/50 hover:text-white'
                        }`}
                      >
                        <CheckCircle2 className="w-3 h-3 inline mr-1" />
                        Accuracy
                      </button>
                    </div>
                  </div>

                  {/* Pace Mode */}
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 hover:bg-white/10 transition-colors group">
                    <div className="flex items-center gap-3">
                      <GraduationCap className={`w-5 h-5 ${session.paceMode === 'student' ? 'text-info' : 'text-white/50 group-hover:text-brand'} transition-colors`} />
                      <span className="text-sm font-medium">Pace</span>
                    </div>
                    <div className="flex items-center bg-white/10 rounded-full p-0.5 gap-0.5">
                      <button
                        onClick={() => safeUpdateSession({ paceMode: 'teacher' })}
                        className={`px-2.5 py-1 rounded-full text-xs font-bold transition-all ${
                          session.paceMode !== 'student'
                            ? 'bg-brand text-white shadow'
                            : 'text-white/50 hover:text-white'
                        }`}
                      >
                        <Presentation className="w-3 h-3 inline mr-1" />
                        Led
                      </button>
                      <button
                        onClick={() => safeUpdateSession({ paceMode: 'student' })}
                        className={`px-2.5 py-1 rounded-full text-xs font-bold transition-all ${
                          session.paceMode === 'student'
                            ? 'bg-info text-white shadow'
                            : 'text-white/50 hover:text-white'
                        }`}
                      >
                        <GraduationCap className="w-3 h-3 inline mr-1" />
                        Self
                      </button>
                    </div>
                  </div>

                  {/* Teams */}
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 hover:bg-white/10 transition-colors group">
                    <div className="flex items-center gap-3">
                      <Users className={`w-5 h-5 ${session.teamMode ? 'text-info' : 'text-white/50 group-hover:text-brand'} transition-colors`} />
                      <span className="text-sm font-medium">Teams</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {session.teamMode && (
                        <select
                          value={session.teamCount || 2}
                          onChange={(e) => {
                            const count = parseInt(e.target.value);
                            safeUpdateSession({ teamCount: count, teams: TEAM_PRESETS.slice(0, count) });
                          }}
                          className="px-2 py-0.5 bg-white/10 text-white text-xs rounded-lg border border-white/20 outline-none"
                        >
                          {[2, 3, 4, 5, 6].map((n) => (
                            <option key={n} value={n} className="bg-gray-800 dark:bg-gray-800 text-white">{n}</option>
                          ))}
                        </select>
                      )}
                      <button
                        onClick={() => {
                          const teamCount = session.teamCount || 2;
                          safeUpdateSession({ teamMode: !session.teamMode, teamCount, teams: TEAM_PRESETS.slice(0, teamCount) });
                        }}
                        className={`relative w-11 h-6 rounded-full transition-colors ${session.teamMode ? 'bg-info' : 'bg-white/20'}`}
                      >
                        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${session.teamMode ? 'translate-x-5' : 'translate-x-0'}`} />
                      </button>
                    </div>
                  </div>

                  {/* Shuffle Questions */}
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 hover:bg-white/10 transition-colors group">
                    <div className="flex items-center gap-3">
                      <Shuffle className={`w-5 h-5 ${session.shuffleQuestions ? 'text-warning' : 'text-white/50 group-hover:text-brand'} transition-colors`} />
                      <span className="text-sm font-medium">Shuffle Questions</span>
                    </div>
                    <button
                      onClick={() => safeUpdateSession({ shuffleQuestions: !session.shuffleQuestions })}
                      className={`relative w-11 h-6 rounded-full transition-colors ${session.shuffleQuestions ? 'bg-warning' : 'bg-white/20'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${session.shuffleQuestions ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>

                  {/* Shuffle Answers */}
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 hover:bg-white/10 transition-colors group">
                    <div className="flex items-center gap-3">
                      <Shuffle className={`w-5 h-5 ${session.shuffleAnswers ? 'text-warning' : 'text-white/50 group-hover:text-brand'} transition-colors`} />
                      <span className="text-sm font-medium">Shuffle Answers</span>
                    </div>
                    <button
                      onClick={() => safeUpdateSession({ shuffleAnswers: !session.shuffleAnswers })}
                      className={`relative w-11 h-6 rounded-full transition-colors ${session.shuffleAnswers ? 'bg-warning' : 'bg-white/20'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${session.shuffleAnswers ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>

                  {/* Rotating Sets (student-paced only) */}
                  {session.paceMode === 'student' && allQuestions.length > 2 && (
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 hover:bg-white/10 transition-colors group">
                      <div className="flex items-center gap-3">
                        <Dices className={`w-5 h-5 ${session.rotatingSetSize ? 'text-purple-400' : 'text-white/50 group-hover:text-brand'} transition-colors`} />
                        <span className="text-sm font-medium">Rotating Sets</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {session.rotatingSetSize && (
                          <select
                            value={session.rotatingSetSize}
                            onChange={(e) => safeUpdateSession({ rotatingSetSize: parseInt(e.target.value) })}
                            className="px-2 py-0.5 bg-white/10 text-white text-xs rounded-lg border border-white/20 outline-none"
                          >
                            {Array.from(
                              { length: allQuestions.length - 1 },
                              (_, i) => i + 1
                            ).map((n) => (
                              <option key={n} value={n} className="bg-gray-800 dark:bg-gray-800 text-white">
                                {n} of {allQuestions.length}
                              </option>
                            ))}
                          </select>
                        )}
                        <button
                          onClick={() => {
                            if (session.rotatingSetSize) {
                              safeUpdateSession({ rotatingSetSize: null });
                            } else {
                              const defaultSize = Math.min(Math.ceil(allQuestions.length / 2), allQuestions.length - 1);
                              safeUpdateSession({ rotatingSetSize: defaultSize });
                            }
                          }}
                          className={`relative w-11 h-6 rounded-full transition-colors ${session.rotatingSetSize ? 'bg-purple-500' : 'bg-white/20'}`}
                        >
                          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${session.rotatingSetSize ? 'translate-x-5' : 'translate-x-0'}`} />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Music */}
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 hover:bg-white/10 transition-colors group">
                    <div className="flex items-center gap-3">
                      <Music className="w-5 h-5 text-white/50 group-hover:text-brand transition-colors" />
                      <span className="text-sm font-medium">Music</span>
                    </div>
                    <select
                      value={lobbyTrack}
                      onChange={(e) => {
                        setLobbyTrackState(e.target.value);
                        setLobbyTrack(e.target.value);
                      }}
                      className="px-2 py-1 bg-white/10 text-white text-xs rounded-lg border border-white/20 outline-none max-w-30"
                    >
                      {Object.entries(MUSIC_TRACKS).map(([key, track]) => (
                        <option key={key} value={key} className="bg-gray-800 dark:bg-gray-800 text-white">{track.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Bottom: Game Info + Start */}
                <div className="mt-auto flex flex-col gap-3">
                  <div className="bg-brand/10 border border-brand/20 rounded-xl p-3 text-center">
                    <p className="text-xs text-brand font-bold uppercase mb-0.5">
                      {players.length > 0 ? 'Game Ready' : 'Waiting for Players'}
                    </p>
                    <p className="text-sm text-white/50">
                      {totalQuestions} Question{totalQuestions !== 1 && 's'} loaded
                    </p>
                  </div>
                  <button
                    onClick={startQuestion}
                    disabled={players.length === 0}
                    className="w-full btn-3d-cyan text-white font-bold py-3 rounded-full transition-all disabled:opacity-30 flex items-center justify-center gap-2 group"
                  >
                    <span>START GAME</span>
                    <Play className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
                  </button>
                  <button
                    onClick={endSessionEarly}
                    disabled={endingSession}
                    className="w-full py-2.5 btn-3d-ghost text-white/60 font-semibold rounded-full transition-all text-sm"
                  >
                    {endingSession ? 'Ending...' : 'End Session'}
                  </button>
                </div>
              </div>
            </aside>
          </main>

          {/* Scrolling Marquee Footer */}
          <footer className="w-full bg-white/5 border-t border-white/5 py-2.5 overflow-hidden shrink-0">
            <div className="animate-marquee whitespace-nowrap flex items-center gap-12 text-white/25 font-medium text-sm">
              <div className="flex items-center gap-12">
                {MARQUEE_ITEMS.map((item, i) => (
                  <span key={i} className="flex items-center gap-2">
                    <Sparkles className="w-3 h-3" /> {item}...
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-12" aria-hidden="true">
                {MARQUEE_ITEMS.map((item, i) => (
                  <span key={`dup-${i}`} className="flex items-center gap-2">
                    <Sparkles className="w-3 h-3" /> {item}...
                  </span>
                ))}
              </div>
            </div>
          </footer>
        </>
      )}

      {/* ══════════════════ LIVE QUESTION ══════════════════ */}
      {session.questionState === 'live' && !preReveal && (
        <main className="grow flex flex-col lg:flex-row gap-4 sm:gap-6 px-4 sm:px-8 py-6 sm:py-8 max-w-7xl mx-auto w-full">
          {/* Left: Question + Timer + Controls */}
          <div className="grow flex flex-col items-center justify-center">
            {/* Question counter */}
            <div className="inline-flex items-center gap-2 px-4 sm:px-5 py-1.5 sm:py-2 bg-white/10 backdrop-blur-md rounded-full border border-white/5 mb-4 sm:mb-8 animate-fade-in">
              <span className="text-xs text-white/50 uppercase tracking-wider font-medium">Question</span>
              <span className="text-sm font-bold">
                {session.currentQuestionIndex + 1}
                <span className="text-white/30 mx-1">/</span>
                {totalQuestions}
              </span>
            </div>

            <h2 className="text-xl sm:text-2xl md:text-5xl font-bold text-center mb-6 sm:mb-10 max-w-3xl leading-tight animate-fade-in wrap-break-word">
              {currentQuestionText}
            </h2>

            {currentCodeSnippet && (
              <CodeBlock code={currentCodeSnippet} language={currentCodeLanguage} className="w-full max-w-2xl mb-6 sm:mb-10 animate-fade-in" />
            )}

            {/* Timer + Answer Progress */}
            <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-6">
              {currentTimeLimitSec > 0 && (
                <div className={`inline-flex items-baseline gap-2 px-5 sm:px-8 py-3 sm:py-4 rounded-2xl border transition-colors animate-bounce-in ${
                  session.timerPaused
                    ? 'bg-warning/10 border-warning/20'
                    : timeLeft <= 5
                      ? 'bg-danger/10 border-danger/20'
                      : 'bg-white/5 border-white/10'
                }`}>
                  <span className={`text-4xl sm:text-6xl font-black tabular-nums ${
                    session.timerPaused ? 'text-warning' :
                    timeLeft <= 5 ? 'text-danger animate-timer-pulse' : 'text-white'
                  }`}>{timeLeft}</span>
                  <span className={`text-sm sm:text-base font-medium ${
                    session.timerPaused ? 'text-warning' :
                    timeLeft <= 5 ? 'text-danger/50' : 'text-white/30'
                  }`}>{session.timerPaused ? 'PAUSED' : 'sec'}</span>
                </div>
              )}
              <div className="inline-flex flex-col items-center px-5 sm:px-6 py-2 sm:py-3 rounded-2xl bg-white/5 border border-white/10 animate-bounce-in">
                <span className={`text-2xl sm:text-4xl font-black tabular-nums ${answeredCount >= players.length ? 'text-success' : 'text-white'}`}>
                  {answeredCount}<span className="text-white/30">/{players.length}</span>
                </span>
                <span className="text-xs font-medium text-white/30">answered</span>
              </div>
            </div>

            {/* Control Toolbar */}
            <div className="flex flex-col sm:flex-row items-center gap-3 mt-6 sm:mt-10">
              <div className="inline-flex items-center gap-1 bg-white/5 rounded-full p-1.5 border border-white/10 backdrop-blur-sm">
                <button
                  onClick={togglePause}
                  className="p-3 rounded-full hover:bg-white/10 transition-colors text-white/60 hover:text-white touch-manipulation"
                  title={session.timerPaused ? 'Resume timer' : 'Pause timer'}
                  aria-label={session.timerPaused ? 'Resume timer' : 'Pause timer'}
                >
                  {session.timerPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                </button>
                <button
                  onClick={extendTimer}
                  className="px-3 sm:px-4 py-2 sm:py-2.5 rounded-full hover:bg-white/10 transition-colors text-white/60 hover:text-white text-sm font-bold touch-manipulation"
                  title="Add 30 seconds"
                >
                  +30s
                </button>
                {!isLastQuestion && (
                  <button
                    onClick={skipQuestion}
                    className="p-3 rounded-full hover:bg-white/10 transition-colors text-white/60 hover:text-white touch-manipulation"
                    title="Skip to next question"
                    aria-label="Skip to next question"
                  >
                    <SkipForward className="w-4 h-4" />
                  </button>
                )}
              </div>
              <button
                onClick={endQuestion}
                className="px-6 sm:px-8 py-3 sm:py-3.5 btn-3d-danger text-white font-bold rounded-full transition-all w-full sm:w-auto"
              >
                End Question
              </button>
              <button
                onClick={endSessionEarly}
                disabled={endingSession}
                className="px-5 sm:px-6 py-3 sm:py-3.5 btn-3d-ghost text-white/60 font-semibold rounded-full transition-all w-full sm:w-auto text-sm"
              >
                {endingSession ? 'Ending...' : 'End Session'}
              </button>
            </div>

            <p className="hidden sm:block text-white/15 text-xs mt-10">
              Press <kbd className="px-1.5 py-0.5 bg-white/5 rounded text-white/25 text-[10px]">Space</kbd> to advance
            </p>
          </div>

          {/* Right: Participants panel */}
          <div className="w-full lg:w-72 shrink-0 bg-white/[0.07] backdrop-blur-xl border border-white/12 rounded-2xl shadow-lg shadow-black/10 p-4 animate-slide-up self-start lg:sticky lg:top-4 max-h-[calc(100vh-8rem)] flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-white/60 uppercase tracking-wider flex items-center gap-2">
                <Users className="w-4 h-4" />
                Participants
              </h3>
              <span className="text-xs font-bold tabular-nums text-white/40">
                {answeredCount}/{players.length}
              </span>
            </div>
            <div className="overflow-y-auto flex-1 space-y-1 min-h-0">
              {[...players]
                .sort((a, b) => {
                  const aAnswered = answeredPlayerIds.has(a.id) ? 1 : 0;
                  const bAnswered = answeredPlayerIds.has(b.id) ? 1 : 0;
                  return aAnswered - bAnswered;
                })
                .map((p) => {
                  const hasAnswered = answeredPlayerIds.has(p.id);
                  return (
                    <div
                      key={p.id}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all duration-300 ${
                        hasAnswered ? 'bg-success/10' : 'bg-white/5'
                      }`}
                    >
                      {p.avatar ? (
                        <span className="text-base leading-none shrink-0">{p.avatar}</span>
                      ) : (
                        <div className={`w-2 h-2 rounded-full shrink-0 ${hasAnswered ? 'bg-success' : 'bg-white/20 animate-pulse'}`} />
                      )}
                      <span className={`text-sm font-medium truncate ${hasAnswered ? 'text-success' : 'text-white/50'}`}>
                        {p.nickname}
                      </span>
                      {hasAnswered && <CheckCircle2 className="w-3.5 h-3.5 text-success ml-auto shrink-0" />}
                    </div>
                  );
                })}
            </div>
          </div>
        </main>
      )}

      {/* ══════════════════ PRE-REVEAL (provisional leaderboard while CF processes) ══════════════════ */}
      {preReveal && session.questionState === 'live' && (
        <main className="grow flex flex-col px-4 sm:px-8 py-4 sm:py-8 max-w-4xl mx-auto w-full">
          <div className="flex items-center justify-center gap-3 mb-6 animate-fade-in">
            <div className="w-5 h-5 border-2 border-brand/30 border-t-brand rounded-full animate-spin" />
            <span className="text-white/50 text-sm font-medium">Finalizing scores...</span>
          </div>

          <div className="bg-white/[0.07] backdrop-blur-xl border border-white/12 rounded-2xl shadow-lg shadow-black/10 p-4 sm:p-6 animate-slide-up">
            <Leaderboard
              sessionId={session.id}
              currentQuestion={session.currentQuestionIndex + 1}
              totalQuestions={totalQuestions}
            />
          </div>
        </main>
      )}

      {/* ══════════════════ STUDENT-PACED LIVE ══════════════════ */}
      {session.questionState === 'student_paced' && (() => {
        const finishedCount = Object.values(studentProgress).filter((p) => p.finished).length;
        const totalPlayers = players.length;
        const progressPercent = totalPlayers > 0 ? Math.round((finishedCount / totalPlayers) * 100) : 0;
        return (
          <main className="grow flex flex-col lg:flex-row gap-4 sm:gap-8 px-4 sm:px-8 py-4 sm:py-8 max-w-7xl mx-auto w-full">
            {/* Left: Progress */}
            <div className="grow flex flex-col gap-4 sm:gap-6">
              {/* Progress Card */}
              <div className="bg-white/[0.07] backdrop-blur-xl border border-white/12 rounded-2xl shadow-lg shadow-black/10 p-4 sm:p-6 animate-fade-in">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                  <h3 className="text-base sm:text-lg font-bold flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-success" />
                    Student Progress
                  </h3>
                  <span className="text-xl sm:text-2xl font-bold tabular-nums">
                    {finishedCount}<span className="text-white/30">/{totalPlayers}</span>
                    <span className="text-sm font-medium text-white/40 ml-2">finished</span>
                  </span>
                </div>
                <div className="w-full bg-white/10 rounded-full h-4 overflow-hidden">
                  <div
                    className="h-full bg-linear-to-r from-brand to-success rounded-full transition-all duration-500"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <p className="text-white/40 text-sm mt-2">{progressPercent}% complete</p>
              </div>

              {/* Per-student progress list */}
              <div className="bg-white/[0.07] backdrop-blur-xl border border-white/12 rounded-2xl shadow-lg shadow-black/10 p-4 sm:p-6 animate-fade-in">
                <h4 className="text-sm font-bold text-white/60 mb-4 uppercase tracking-wider">Individual Progress</h4>
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {players.map((p) => {
                    const prog = studentProgress[p.id];
                    const answered = prog?.answered || 0;
                    const done = prog?.finished || false;
                    const questionsForPlayer = session.rotatingSetSize || totalQuestions;
                    const pct = questionsForPlayer > 0 ? Math.round((answered / questionsForPlayer) * 100) : 0;
                    return (
                      <div key={p.id} className="flex items-center gap-3 p-2 rounded-lg bg-white/5">
                        <span className="font-medium text-sm truncate w-28">{p.nickname}</span>
                        <div className="flex-1 bg-white/10 rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${done ? 'bg-success' : 'bg-brand'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-white/40 tabular-nums w-16 text-right">
                          {answered}/{questionsForPlayer}
                        </span>
                        {done && <CheckCircle2 className="w-4 h-4 text-success shrink-0" />}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Right: Leaderboard + End Button */}
            <div className="w-full lg:w-96 flex flex-col gap-4 sm:gap-6 shrink-0">
              <div className="bg-white/[0.07] backdrop-blur-xl border border-white/12 rounded-2xl shadow-lg shadow-black/10 p-4 sm:p-6 animate-slide-up">
                <Leaderboard sessionId={session.id} currentQuestion={undefined} totalQuestions={totalQuestions} />
              </div>

              <button
                onClick={endStudentPacedSessionFn}
                disabled={endingSession}
                className="w-full py-4 btn-3d-danger text-white font-bold rounded-full transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {endingSession ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Ending...
                  </>
                ) : (
                  'End Session'
                )}
              </button>

              <p className="hidden sm:block text-white/15 text-xs text-center">
                Press <kbd className="px-1.5 py-0.5 bg-white/5 rounded text-white/25 text-[10px]">Space</kbd> to end session
              </p>
            </div>
          </main>
        );
      })()}

      {/* ══════════════════ REVEAL ══════════════════ */}
      {session.questionState === 'reveal' && (
        <main className="grow flex flex-col px-4 sm:px-8 py-4 sm:py-8 max-w-4xl mx-auto w-full">
          {session.teamMode && session.teamScoreSnapshot && (
            <div className="bg-white/[0.07] backdrop-blur-xl border border-white/12 rounded-2xl shadow-lg shadow-black/10 p-4 sm:p-6 mb-4 animate-bounce-in">
              <h3 className="text-base sm:text-lg font-bold mb-4">Team Standings</h3>
              <div className="space-y-3">
                {session.teamScoreSnapshot.map((team, i) => (
                  <div key={team.teamIndex} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5">
                    <span className="text-2xl font-bold text-white/30 w-8">{i + 1}</span>
                    <span className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: team.color }} />
                    <span className="flex-1 font-bold">{team.name}</span>
                    <span className="font-bold text-lg tabular-nums">{team.avgPoints.toLocaleString()}</span>
                    <span className="text-xs text-white/40">avg pts</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white/[0.07] backdrop-blur-xl border border-white/12 rounded-2xl shadow-lg shadow-black/10 p-4 sm:p-6 mb-4 animate-slide-up">
            <Leaderboard sessionId={session.id} top10Snapshot={session.top10Snapshot} currentQuestion={session.currentQuestionIndex + 1} totalQuestions={totalQuestions} />
          </div>

          {violations.size > 0 && (
            <div className="bg-danger/10 backdrop-blur rounded-2xl p-3 sm:p-4 mb-4 sm:mb-6 animate-fade-in border border-danger/10">
              <div className="flex items-center gap-2 mb-3">
                <ShieldAlert className="w-4 h-4 text-danger" />
                <h3 className="text-sm font-bold text-danger">Flagged Activity</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {Array.from(violations.entries()).map(([pid, v]) => (
                  <span key={pid} className="px-3 py-1.5 bg-white/10 rounded-lg text-xs text-white/80">
                    {v.nickname}: {v.totalViolations} violation{v.totalViolations !== 1 ? 's' : ''}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row justify-center items-center gap-3 sm:gap-4 mt-4 sm:mt-6">
            {!isLastQuestion && (
              <>
                <button
                  onClick={nextQuestion}
                  className="px-8 sm:px-10 py-3 sm:py-4 btn-3d-cyan text-white font-bold text-base sm:text-lg rounded-full transition-all flex items-center gap-2 group w-full sm:w-auto justify-center"
                >
                  Next Question
                  <Play className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
                </button>
                <button
                  onClick={endSessionEarly}
                  disabled={endingSession}
                  className="px-5 sm:px-6 py-3 sm:py-3.5 btn-3d-ghost text-white/60 font-semibold rounded-full transition-all w-full sm:w-auto text-sm"
                >
                  {endingSession ? 'Ending...' : 'End Session'}
                </button>
              </>
            )}
            {isLastQuestion && (
              <button
                onClick={async () => {
                  try {
                    await updateDoc(doc(db, 'sessions', session.id), { status: 'ended', endedAt: Date.now() });
                    navigate(`/session/${session.id}/results`);
                  } catch {
                    addToast('error', 'Failed to end session');
                  }
                }}
                className="px-8 sm:px-10 py-3 sm:py-4 btn-3d-success text-white font-bold text-base sm:text-lg rounded-full transition-all w-full sm:w-auto"
              >
                View Results
              </button>
            )}
          </div>

          <p className="hidden sm:block text-center text-white/15 text-xs mt-8">
            Press <kbd className="px-1.5 py-0.5 bg-white/5 rounded text-white/25 text-[10px]">Space</kbd> to advance
          </p>
        </main>
      )}

      {/* ══════════ Navigation Blocker Dialog ══════════ */}
      {showLeaveDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-surface-dark border border-white/10 rounded-2xl p-6 sm:p-8 max-w-md w-full mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-warning/20 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-warning" />
              </div>
              <h3 className="text-lg font-bold text-white">Leave session?</h3>
            </div>
            <p className="text-white/60 text-sm mb-6">
              {session?.status === 'lobby'
                ? `You have ${players.length} player${players.length !== 1 ? 's' : ''} waiting in the lobby. Leaving will end the session for everyone.`
                : `A live game is in progress with ${players.length} player${players.length !== 1 ? 's' : ''}. Leaving will end the session immediately.`}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowLeaveDialog(false); pendingNavigationRef.current = null; }}
                className="flex-1 px-5 py-3 bg-white/10 text-white font-semibold rounded-xl hover:bg-white/20 transition-colors"
              >
                Stay
              </button>
              <button
                onClick={() => { setShowLeaveDialog(false); pendingNavigationRef.current?.(); pendingNavigationRef.current = null; }}
                className="flex-1 px-5 py-3 bg-danger text-white font-semibold rounded-xl hover:brightness-110 transition-all"
              >
                Leave &amp; End
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
