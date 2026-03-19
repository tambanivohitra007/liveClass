import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { doc, onSnapshot, collection, updateDoc, setDoc, getDocs, query, orderBy, where, limit } from 'firebase/firestore';
import { db, functions } from '../../lib/firebase';
import { APP_URL } from '../../lib/config';
import { useAuthStore } from '../../stores/authStore';
import { useToastStore } from '../../stores/toastStore';
import { confirmAction } from '../../lib/swal';
import CriterionInput from '../../components/CriterionInput';
import { QRCodeSVG } from 'qrcode.react';
import {
  Users, Lock, Unlock, Play, Check,
  ArrowRight, Maximize2, X as XIcon, SkipForward, Award,
  CheckCircle2, Clock, Mic,
} from 'lucide-react';
import type { LiveGrading, LiveGradingPlayer, Criterion, EvaluationScore, Evaluation } from '../../types/models';

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

export default function HostLiveGrading() {
  const { rubricId } = useParams<{ rubricId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { addToast } = useToastStore();

  const [liveGrading, setLiveGrading] = useState<LiveGrading | null>(null);
  const [players, setPlayers] = useState<LiveGradingPlayer[]>([]);
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [evaluations, setEvaluations] = useState<Map<string, Evaluation>>(new Map());
  const [error, setError] = useState('');
  const [qrZoomed, setQrZoomed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [regradeConfirmId, setRegradeConfirmId] = useState<string | null>(null);
  const [endingSession, setEndingSession] = useState(false);

  // Grading form state
  const [currentScores, setCurrentScores] = useState<Record<string, EvaluationScore>>({});
  const [comment, setComment] = useState('');

  const liveGradingRef = useRef<LiveGrading | null>(null);
  const unsubscribesRef = useRef<Array<() => void>>([]);
  const cancelledRef = useRef(false);

  // Keep ref in sync
  useEffect(() => {
    liveGradingRef.current = liveGrading;
  }, [liveGrading]);

  // Create or rejoin session on mount
  useEffect(() => {
    if (!rubricId || !user) return;
    cancelledRef.current = false;

    const init = async () => {
      try {
        // Check for existing active session to rejoin
        const existingSnap = await getDocs(
          query(
            collection(db, 'live_gradings'),
            where('ownerId', '==', user.id),
            where('rubricId', '==', rubricId),
            where('status', 'in', ['lobby', 'live']),
            limit(1)
          )
        );

        if (cancelledRef.current) return;

        if (!existingSnap.empty) {
          // Rejoin existing session
          const existingId = existingSnap.docs[0].id;
          subscribe(existingId);
          addToast('info', 'Rejoined existing session');
        } else {
          // Create new session
          const fn = httpsCallable<{ rubricId: string }, { liveGradingId: string }>(functions, 'createLiveGrading');
          const result = await fn({ rubricId });
          if (cancelledRef.current) {
            updateDoc(doc(db, 'live_gradings', result.data.liveGradingId), {
              status: 'ended', endedAt: Date.now(),
            }).catch(() => {});
            return;
          }
          subscribe(result.data.liveGradingId);
        }
      } catch (err) {
        if (!cancelledRef.current) {
          setError(err instanceof Error ? err.message : 'Failed to create session');
        }
      }
    };

    // Load criteria from rubric
    const loadCriteria = async () => {
      try {
        const snap = await getDocs(query(collection(db, 'rubrics', rubricId, 'criteria'), orderBy('order')));
        if (!cancelledRef.current) {
          setCriteria(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Criterion[]);
          if (snap.empty) {
            addToast('warning', 'No criteria found in this rubric.');
          }
        }
      } catch {
        if (!cancelledRef.current) {
          addToast('error', 'Failed to load rubric criteria.');
        }
      }
    };

    init();
    loadCriteria();

    return () => {
      cancelledRef.current = true;
      unsubscribesRef.current.forEach((u) => u());
      unsubscribesRef.current = [];
    };
  }, [rubricId, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const subscribe = (lgId: string) => {
    unsubscribesRef.current.forEach((u) => u());
    unsubscribesRef.current = [];

    const unsub1 = onSnapshot(doc(db, 'live_gradings', lgId), (snap) => {
      if (snap.exists()) {
        setLiveGrading({ id: snap.id, ...snap.data() } as LiveGrading);
      }
    });
    const unsub2 = onSnapshot(collection(db, `live_gradings/${lgId}/players`), (snap) => {
      setPlayers(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as LiveGradingPlayer[]);
    });
    const unsub3 = onSnapshot(collection(db, `live_gradings/${lgId}/evaluations`), (snap) => {
      const map = new Map<string, Evaluation>();
      snap.docs.forEach((d) => map.set(d.id, { id: d.id, ...d.data() } as Evaluation));
      setEvaluations(map);
    });

    unsubscribesRef.current = [unsub1, unsub2, unsub3];
  };

  // Prevent accidental navigation
  useEffect(() => {
    if (!liveGrading || liveGrading.status === 'ended') return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [liveGrading]);

  // Reset form when current student changes
  useEffect(() => {
    if (!liveGrading || liveGrading.status !== 'live') return;
    setRegradeConfirmId(null);
    const studentId = liveGrading.currentStudentId;
    if (!studentId) return;
    const existing = evaluations.get(studentId);
    if (existing) {
      setCurrentScores(existing.scores || {});
      setComment(existing.comment || '');
    } else {
      setCurrentScores({});
      setComment('');
    }
  }, [liveGrading?.currentStudentId, liveGrading?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Computed values
  const maxPossibleScore = criteria.reduce((sum, c) => sum + c.maxScore * c.weight, 0);
  const totalScore = criteria.reduce((sum, c) => sum + (currentScores[c.id]?.score || 0) * c.weight, 0);
  const percentage = maxPossibleScore > 0 ? (totalScore / maxPossibleScore) * 100 : 0;

  const currentStudent = liveGrading?.currentStudentId
    ? players.find((p) => p.id === liveGrading.currentStudentId) || null
    : null;

  const gradedCount = evaluations.size;

  // Fisher-Yates shuffle
  const shuffleArray = <T,>(arr: T[]): T[] => {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  const handleStart = async () => {
    if (!liveGrading || players.length === 0) return;
    const shuffled = shuffleArray(players.map((p) => p.id));
    await updateDoc(doc(db, 'live_gradings', liveGrading.id), {
      status: 'live',
      studentOrder: shuffled,
      currentStudentIndex: 0,
      currentStudentId: shuffled[0],
      startedAt: Date.now(),
      joinLocked: true,
    });
  };

  const handleToggleLock = async () => {
    if (!liveGrading) return;
    await updateDoc(doc(db, 'live_gradings', liveGrading.id), {
      joinLocked: !liveGrading.joinLocked,
    });
  };

  const handleScoreChange = useCallback((criterionId: string, value: EvaluationScore) => {
    setCurrentScores((prev) => ({ ...prev, [criterionId]: value }));
  }, []);

  const handleSubmitAndNext = async () => {
    if (!liveGrading || !liveGrading.currentStudentId) return;
    const studentId = liveGrading.currentStudentId;

    // Guard: if already graded, require confirmation first
    if (evaluations.has(studentId) && regradeConfirmId !== studentId) {
      setRegradeConfirmId(studentId);
      return;
    }
    setRegradeConfirmId(null);

    setSubmitting(true);
    try {
      const student = players.find((p) => p.id === studentId);
      const criterionMeta = criteria.reduce<Record<string, { name: string; type: Criterion['type']; maxScore: number; weight: number }>>((acc, criterion) => {
        acc[criterion.id] = {
          name: criterion.name,
          type: criterion.type,
          maxScore: criterion.maxScore,
          weight: criterion.weight,
        };
        return acc;
      }, {});

      // Write evaluation
      await setDoc(doc(db, 'live_gradings', liveGrading.id, 'evaluations', studentId), {
        studentName: student?.nickname || 'Unknown',
        totalScore,
        maxPossibleScore,
        percentage,
        comment,
        scores: currentScores,
        criterionMeta,
        gradedAt: Date.now(),
      });

      // Advance to next student or end
      const nextIndex = liveGrading.currentStudentIndex + 1;
      if (nextIndex >= liveGrading.studentOrder.length) {
        await updateDoc(doc(db, 'live_gradings', liveGrading.id), {
          status: 'ended',
          currentStudentId: null,
          currentStudentIndex: nextIndex,
          endedAt: Date.now(),
        });
        addToast('success', 'All students graded! Session complete.');
      } else {
        await updateDoc(doc(db, 'live_gradings', liveGrading.id), {
          currentStudentIndex: nextIndex,
          currentStudentId: liveGrading.studentOrder[nextIndex],
        });
      }

      setCurrentScores({});
      setComment('');
    } catch {
      addToast('error', 'Failed to submit evaluation. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkip = async () => {
    if (!liveGrading) return;
    const nextIndex = liveGrading.currentStudentIndex + 1;
    if (nextIndex >= liveGrading.studentOrder.length) {
      await updateDoc(doc(db, 'live_gradings', liveGrading.id), {
        status: 'ended',
        currentStudentId: null,
        currentStudentIndex: nextIndex,
        endedAt: Date.now(),
      });
    } else {
      await updateDoc(doc(db, 'live_gradings', liveGrading.id), {
        currentStudentIndex: nextIndex,
        currentStudentId: liveGrading.studentOrder[nextIndex],
      });
    }
    setCurrentScores({});
    setComment('');
  };

  const handleEndSession = async () => {
    if (!liveGrading || endingSession) return;
    const { isConfirmed } = await confirmAction(
      'End session early?',
      'This will end the grading session for all students. Evaluations submitted so far are preserved.',
      'Yes, end session',
    );
    if (!isConfirmed) return;
    setEndingSession(true);
    try {
      await updateDoc(doc(db, 'live_gradings', liveGrading.id), {
        status: 'ended',
        currentStudentId: null,
        endedAt: Date.now(),
      });
      navigate(`/live-grading/${liveGrading.id}/results`);
    } catch {
      addToast('error', 'Failed to end session.');
    } finally {
      setEndingSession(false);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!liveGrading) return;
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;

      if (liveGrading.status === 'lobby' && e.code === 'Space' && players.length > 0) {
        e.preventDefault();
        handleStart();
      }
      if (liveGrading.status === 'live' && (e.ctrlKey || e.metaKey) && e.code === 'Enter') {
        e.preventDefault();
        handleSubmitAndNext();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [liveGrading, players.length, currentScores, comment]); // eslint-disable-line react-hooks/exhaustive-deps

  // Error state
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white" style={MESH_BG}>
        <div className="text-center">
          <p className="text-lg text-danger mb-4">{error}</p>
          <button onClick={() => navigate('/rubrics')} className="btn-3d-ghost">Back to Rubrics</button>
        </div>
      </div>
    );
  }

  // Loading state
  if (!liveGrading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white" style={MESH_BG}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-3 border-brand/30 border-t-brand rounded-full animate-spin" />
          <p className="text-white/60 text-sm">Creating session...</p>
        </div>
      </div>
    );
  }

  // =================== RENDER ===================
  return (
    <div className="min-h-screen flex flex-col text-white overflow-hidden" style={MESH_BG}>

      {/* QR Zoom Modal */}
      {qrZoomed && (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center" onClick={() => setQrZoomed(false)}>
          <div className="flex flex-col items-center gap-4" onClick={(e) => e.stopPropagation()}>
            <div className="bg-white p-6 rounded-3xl">
              <QRCodeSVG value={`${APP_URL}/join?pin=${liveGrading.pinCode}`} size={300} level="M" />
            </div>
            <p className="text-white/70 text-sm font-medium select-all">{`${APP_URL}/join?pin=${liveGrading.pinCode}`}</p>
          </div>
          <button onClick={() => setQrZoomed(false)} className="absolute top-4 right-4 p-2 text-white/60 hover:text-white">
            <XIcon className="w-8 h-8" />
          </button>
        </div>
      )}

      {/* Top Bar */}
      <header className="flex items-center justify-between px-4 sm:px-8 py-2 sm:py-3 w-full max-w-7xl mx-auto shrink-0">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="bg-emerald-500 p-1.5 sm:p-2 rounded-lg flex items-center justify-center">
            <Mic className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
          </div>
          <h1 className="text-base sm:text-xl font-bold tracking-tight">
            Live <span className="text-emerald-400">Grading</span>
          </h1>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="flex items-center gap-1.5 sm:gap-2.5 bg-white/10 backdrop-blur-md px-3 sm:px-5 py-1.5 sm:py-2 rounded-full border border-white/5">
            <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 bg-success rounded-full animate-pulse" />
            <span className="text-xs sm:text-sm font-semibold">
              <span className="hidden sm:inline">{players.length} Student{players.length !== 1 && 's'}</span>
              <span className="sm:hidden">{players.length}</span>
            </span>
          </div>
        </div>
      </header>

      {/* ═══════════ LOBBY ═══════════ */}
      {liveGrading.status === 'lobby' && (
        <>
          <main className="grow flex flex-col lg:flex-row gap-4 sm:gap-6 px-4 sm:px-8 py-2 sm:py-4 max-w-7xl mx-auto w-full min-h-0">
            {/* Left: PIN + Players */}
            <div className="grow flex flex-col gap-3 sm:gap-4 min-h-0">
              {/* PIN Hero */}
              <div className="relative flex flex-col items-center py-4 sm:py-6 px-4 sm:px-8 bg-white/[0.07] border border-white/12 rounded-2xl overflow-hidden backdrop-blur-md animate-bounce-in shadow-xl shadow-black/20 shrink-0">
                <div className="absolute inset-0 bg-linear-to-br from-emerald-500/10 via-transparent to-brand/10" />
                <h2 className="relative text-sm sm:text-base font-medium text-white/60 mb-2 sm:mb-4 uppercase tracking-[0.2em]">
                  Join for Grading
                </h2>
                <div className="relative flex flex-col sm:flex-row items-center gap-4 sm:gap-8">
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-sm font-medium text-emerald-400">Enter PIN</p>
                    <div
                      className="bg-white text-surface-dark px-6 sm:px-10 py-2 sm:py-3 rounded-2xl flex items-center gap-2 sm:gap-3 animate-glow-pulse"
                      style={{ boxShadow: '0 0 60px rgba(16, 185, 129, 0.3)' }}
                    >
                      <span className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">
                        {liveGrading.pinCode.slice(0, 3)}
                      </span>
                      <div className="w-1 sm:w-1.5 h-6 sm:h-10 bg-gray-200 rounded-full" />
                      <span className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">
                        {liveGrading.pinCode.slice(3)}
                      </span>
                    </div>
                  </div>

                  <div className="hidden sm:flex flex-col items-center gap-2 self-stretch justify-center">
                    <div className="flex-1 w-px bg-linear-to-b from-transparent via-white/15 to-transparent" />
                    <span className="text-[10px] uppercase tracking-widest text-white/30 font-medium">or</span>
                    <div className="flex-1 w-px bg-linear-to-b from-transparent via-white/15 to-transparent" />
                  </div>
                  <div className="flex sm:hidden items-center gap-3 w-full">
                    <div className="flex-1 h-px bg-linear-to-r from-transparent via-white/15 to-transparent" />
                    <span className="text-[10px] uppercase tracking-widest text-white/30 font-medium">or</span>
                    <div className="flex-1 h-px bg-linear-to-r from-transparent via-white/15 to-transparent" />
                  </div>

                  <div className="flex flex-col items-center gap-2">
                    <p className="text-sm font-medium text-emerald-400">Scan to Join</p>
                    <button
                      type="button"
                      onClick={() => setQrZoomed(true)}
                      className="relative group bg-white p-2 sm:p-3 rounded-2xl cursor-pointer transition-transform hover:scale-105"
                      style={{ boxShadow: '0 0 40px rgba(16, 185, 129, 0.2)' }}
                      title="Click to enlarge"
                    >
                      <QRCodeSVG value={`${APP_URL}/join?pin=${liveGrading.pinCode}`} size={100} level="M" className="sm:w-32 sm:h-32" />
                      <div className="absolute inset-0 rounded-2xl bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                        <Maximize2 className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                      </div>
                    </button>
                    <p className="text-xs text-white/50 font-medium select-all break-all text-center max-w-40">
                      {`${APP_URL}/join?pin=${liveGrading.pinCode}`}
                    </p>
                  </div>
                </div>
              </div>

              <p className="text-center text-white/40 text-sm font-medium -mt-1 sm:-mt-2 shrink-0">
                Or go to <span className="text-white/70 font-semibold select-all">{window.location.host}</span> and enter the PIN
              </p>

              {/* Players Grid */}
              <div className="flex-1 flex flex-col animate-fade-in min-h-0">
                <div className="flex items-center justify-between mb-2 shrink-0">
                  <h3 className="text-lg font-bold">Students</h3>
                  <span className="text-lg font-bold tabular-nums">
                    {players.length} <span className="text-sm font-medium text-white/40">joined</span>
                  </span>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto pr-1">
                  {players.length > 0 ? (
                    <div className="flex flex-wrap gap-2 sm:gap-2.5 content-start">
                      {players.map((p, i) => {
                        const color = AVATAR_COLORS[i % AVATAR_COLORS.length];
                        return (
                          <div
                            key={p.id}
                            className={`flex items-center gap-2 pl-1 pr-3 py-1 rounded-full ${color.bg} border ${color.border} animate-fade-in cursor-default hover:scale-105 transition-transform`}
                          >
                            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                              {p.avatar ? <span className="text-lg leading-none">{p.avatar}</span> : <span className={`text-xs font-bold ${color.text}`}>{p.nickname.charAt(0).toUpperCase()}</span>}
                            </div>
                            <span className={`text-sm font-semibold ${color.text} truncate max-w-24`}>{p.nickname}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-3 py-8 opacity-50">
                      <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center animate-pulse">
                        <span className="text-white/30 text-lg">+</span>
                      </div>
                      <span className="text-white/30 italic text-sm">Waiting for students...</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Settings */}
            <aside className="w-full lg:w-72 flex flex-col shrink-0 min-h-0">
              <div className="bg-white/[0.07] backdrop-blur-xl border border-white/12 rounded-2xl p-4 sm:p-5 flex flex-col gap-3 sm:gap-4 h-full shadow-lg shadow-black/10">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <Award className="w-5 h-5 text-emerald-400" />
                  {liveGrading.rubricName}
                </h3>
                <p className="text-xs text-white/40">{criteria.length} criteria &middot; {maxPossibleScore} pts max</p>

                {/* Join Lock Toggle */}
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 hover:bg-white/10 transition-colors">
                  <div className="flex items-center gap-3">
                    {liveGrading.joinLocked ? <Lock className="w-5 h-5 text-warning" /> : <Unlock className="w-5 h-5 text-white/50" />}
                    <span className="text-sm font-medium">Lock Join</span>
                  </div>
                  <button
                    onClick={handleToggleLock}
                    className={`relative w-11 h-6 rounded-full transition-colors ${liveGrading.joinLocked ? 'bg-warning' : 'bg-white/20'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${liveGrading.joinLocked ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>

                <div className="flex-1" />

                {/* Start Button */}
                <button
                  onClick={handleStart}
                  disabled={players.length === 0}
                  className="btn-3d-emerald w-full py-3 text-base font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Play className="w-5 h-5" />
                  Start Grading
                  {players.length > 0 && <span className="text-xs opacity-70">({players.length} students)</span>}
                </button>
                <p className="text-center text-white/30 text-xs">Press Space to start</p>
                <button
                  onClick={async () => {
                    await updateDoc(doc(db, 'live_gradings', liveGrading.id), {
                      status: 'ended', endedAt: Date.now(), currentStudentId: null,
                    });
                    navigate('/rubrics');
                  }}
                  className="btn-3d-ghost w-full py-2 text-sm text-danger hover:bg-danger/10 mt-2"
                >
                  Cancel Session
                </button>
              </div>
            </aside>
          </main>

          {/* Scrolling Marquee */}
          <div className="w-full overflow-hidden py-3 shrink-0">
            <div className="flex animate-marquee whitespace-nowrap">
              {Array.from({ length: 4 }).flatMap((_, rep) =>
                ['ORAL PRESENTATION', 'LIVE GRADING', 'RANDOM ORDER', 'STAY READY'].map((item, i) => (
                  <span key={`${rep}-${i}`} className="mx-8 text-xl sm:text-2xl font-bold text-white/[0.04] uppercase tracking-widest select-none">{item}</span>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {/* ═══════════ LIVE GRADING ═══════════ */}
      {liveGrading.status === 'live' && (
        <main className="grow flex flex-col lg:flex-row gap-4 px-4 sm:px-8 py-2 sm:py-4 max-w-7xl mx-auto w-full min-h-0 overflow-hidden">
          {/* Left: Grading Panel */}
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            {/* Current Student Header */}
            {currentStudent && (
              <div className="mb-4 animate-fade-in shrink-0">
                <div className="flex items-center gap-3 mb-1">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
                    {currentStudent.avatar
                      ? <span className="text-2xl leading-none">{currentStudent.avatar}</span>
                      : <span className="text-lg font-bold text-emerald-400">{currentStudent.nickname.charAt(0).toUpperCase()}</span>}
                  </div>
                  <div>
                    <h2 className="text-xl sm:text-2xl font-bold">{currentStudent.nickname}</h2>
                    <p className="text-sm text-white/40">
                      Student {liveGrading.currentStudentIndex + 1} of {liveGrading.studentOrder.length}
                    </p>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <Mic className="w-5 h-5 text-emerald-400 animate-pulse" />
                    <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Presenting</span>
                  </div>
                </div>
              </div>
            )}

            {/* Criteria Cards */}
            <div className="space-y-3 sm:space-y-4 max-w-2xl">
              {criteria.map((c) => {
                const scored = currentScores[c.id] && currentScores[c.id].score > 0;
                return (
                  <div
                    key={c.id}
                    className={`bg-white/[0.07] border rounded-2xl p-4 sm:p-5 transition-all ${
                      scored ? 'border-success/30 border-l-4 border-l-success' : 'border-white/10'
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <h3 className="text-sm sm:text-base font-bold flex-1 min-w-0">{c.name}</h3>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        c.type === 'numeric' ? 'bg-brand/10 text-brand' :
                        c.type === 'level' ? 'bg-purple-500/10 text-purple-400' :
                        'bg-info/10 text-info'
                      }`}>
                        {c.type}
                      </span>
                      {c.weight !== 1 && (
                        <span className="px-2 py-0.5 rounded-full bg-warning/10 text-warning text-[10px] font-bold">x{c.weight}</span>
                      )}
                      <span className="text-sm font-bold tabular-nums text-white/50">
                        {currentScores[c.id]?.score || 0} / {c.maxScore} pts
                      </span>
                    </div>
                    <CriterionInput
                      criterion={c}
                      value={currentScores[c.id] || { score: 0 }}
                      onChange={(value) => handleScoreChange(c.id, value)}
                    />
                  </div>
                );
              })}
            </div>

            {/* Comment */}
            <div className="max-w-2xl mt-4">
              <label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">Comment</label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Add feedback for this student..."
                rows={2}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 resize-y focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 transition-colors"
              />
            </div>

            {/* Re-grade Confirmation Banner */}
            {regradeConfirmId && (
              <div className="max-w-2xl mt-4 bg-warning/10 border border-warning/30 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3 animate-fade-in">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-warning">This student has already been graded</p>
                  <p className="text-xs text-white/50 mt-0.5">Submitting will overwrite the previous evaluation.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setRegradeConfirmId(null)} className="btn-3d-ghost px-4 py-2 text-xs">Cancel</button>
                  <button onClick={handleSubmitAndNext} className="btn-3d-gold px-4 py-2 text-xs font-bold flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5" /> Overwrite
                  </button>
                </div>
              </div>
            )}

            {/* Total Score + Actions */}
            <div className="max-w-2xl mt-4 mb-4">
              <div className="bg-white/[0.07] border border-white/10 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-1">Total Score</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl sm:text-4xl font-bold tabular-nums">{totalScore.toFixed(1)}</span>
                    <span className="text-sm text-white/30">/ {maxPossibleScore.toFixed(1)}</span>
                    <span className={`text-sm font-bold px-2 py-0.5 rounded-full ml-2 ${
                      percentage >= 70 ? 'bg-success/20 text-success' :
                      percentage >= 40 ? 'bg-warning/20 text-warning' :
                      'bg-danger/20 text-danger'
                    }`}>
                      {percentage.toFixed(0)}%
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    onClick={handleSkip}
                    className="btn-3d-ghost px-4 py-2.5 text-sm flex items-center gap-1.5"
                    title="Skip this student"
                  >
                    <SkipForward className="w-4 h-4" />
                    Skip
                  </button>
                  <button
                    onClick={handleSubmitAndNext}
                    disabled={submitting}
                    className="btn-3d-emerald flex-1 sm:flex-initial px-6 py-2.5 font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {submitting ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        {liveGrading.currentStudentIndex < liveGrading.studentOrder.length - 1
                          ? 'Submit & Next'
                          : 'Submit & Finish'}
                        {liveGrading.currentStudentIndex < liveGrading.studentOrder.length - 1 && (
                          <ArrowRight className="w-4 h-4" />
                        )}
                      </>
                    )}
                  </button>
                </div>
              </div>
              <p className="text-center text-white/30 text-xs mt-2">Ctrl+Enter to submit</p>
            </div>
          </div>

          {/* Right: Student Queue */}
          <aside className="w-full lg:w-72 flex flex-col shrink-0 min-h-0">
            <div className="bg-white/[0.07] backdrop-blur-xl border border-white/12 rounded-2xl p-4 flex flex-col gap-2 h-full shadow-lg shadow-black/10 overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <Users className="w-4 h-4 text-emerald-400" />
                  Presentation Order
                </h3>
                <span className="text-xs text-white/40">{gradedCount}/{liveGrading.studentOrder.length}</span>
              </div>

              {liveGrading.studentOrder.map((pid, i) => {
                const player = players.find((p) => p.id === pid);
                if (!player) return null;
                const isCurrent = pid === liveGrading.currentStudentId;
                const isGraded = evaluations.has(pid);
                const isPast = i < liveGrading.currentStudentIndex;

                return (
                  <div
                    key={pid}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all ${
                      isCurrent ? 'bg-emerald-500/20 border border-emerald-500/40' :
                      isGraded ? 'bg-white/5 opacity-70' :
                      'bg-white/[0.03]'
                    }`}
                  >
                    <span className="text-xs font-bold text-white/30 w-5 text-center">{i + 1}</span>
                    <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                      {player.avatar
                        ? <span className="text-sm leading-none">{player.avatar}</span>
                        : <span className="text-[10px] font-bold text-white/60">{player.nickname.charAt(0).toUpperCase()}</span>}
                    </div>
                    <span className="text-sm font-medium truncate flex-1">{player.nickname}</span>
                    {isCurrent && <Mic className="w-3.5 h-3.5 text-emerald-400 animate-pulse shrink-0" />}
                    {isGraded && !isCurrent && <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />}
                    {!isCurrent && !isGraded && !isPast && <Clock className="w-3.5 h-3.5 text-white/20 shrink-0" />}
                  </div>
                );
              })}

              <div className="flex-1" />
              <button
                onClick={handleEndSession}
                disabled={endingSession}
                className="btn-3d-ghost w-full py-2 text-sm text-danger hover:bg-danger/10 mt-2 disabled:opacity-50"
              >
                {endingSession ? 'Ending...' : 'End Session Early'}
              </button>
            </div>
          </aside>
        </main>
      )}

      {/* ═══════════ ENDED ═══════════ */}
      {liveGrading.status === 'ended' && (
        <main className="grow flex flex-col items-center px-4 sm:px-8 py-6 max-w-4xl mx-auto w-full overflow-y-auto">
          <div className="text-center mb-8 animate-fade-in">
            <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8 text-success" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Session Complete</h2>
            <p className="text-white/50 text-sm">
              {gradedCount} of {players.length} student{players.length !== 1 ? 's' : ''} graded
            </p>
          </div>

          {/* Results Table */}
          <div className="w-full bg-white/[0.07] border border-white/10 rounded-2xl overflow-hidden mb-6">
            <div className="grid grid-cols-[1fr_auto_auto] sm:grid-cols-[1fr_auto_auto_auto] gap-2 px-4 py-3 border-b border-white/10 text-xs font-bold text-white/40 uppercase tracking-wider">
              <span>Student</span>
              <span className="text-right">Score</span>
              <span className="text-right hidden sm:block">%</span>
              <span className="text-right">Status</span>
            </div>
            {liveGrading.studentOrder.map((pid) => {
              const player = players.find((p) => p.id === pid);
              const eval_ = evaluations.get(pid);
              return (
                <div key={pid} className="grid grid-cols-[1fr_auto_auto] sm:grid-cols-[1fr_auto_auto_auto] gap-2 px-4 py-3 border-b border-white/5 last:border-0 items-center">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                      {player?.avatar
                        ? <span className="text-sm leading-none">{player.avatar}</span>
                        : <span className="text-[10px] font-bold text-white/60">{(player?.nickname || '?').charAt(0).toUpperCase()}</span>}
                    </div>
                    <span className="text-sm font-medium truncate">{player?.nickname || 'Unknown'}</span>
                  </div>
                  <span className="text-sm font-bold tabular-nums text-right">
                    {eval_ ? `${eval_.totalScore.toFixed(1)}/${eval_.maxPossibleScore.toFixed(1)}` : '-'}
                  </span>
                  <span className={`text-sm font-bold tabular-nums text-right hidden sm:block ${
                    eval_ ? (eval_.percentage >= 70 ? 'text-success' : eval_.percentage >= 40 ? 'text-warning' : 'text-danger') : 'text-white/30'
                  }`}>
                    {eval_ ? `${eval_.percentage.toFixed(0)}%` : '-'}
                  </span>
                  <span className="text-right">
                    {eval_
                      ? <CheckCircle2 className="w-4 h-4 text-success inline" />
                      : <span className="text-xs text-white/30">Skipped</span>}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(`/live-grading/${liveGrading.id}/results`)}
              className="btn-3d-emerald px-8 py-3 text-base font-bold flex items-center gap-2"
            >
              <Award className="w-5 h-5" />
              View Detailed Results
            </button>
            <button
              onClick={() => navigate('/rubrics')}
              className="btn-3d-ghost px-6 py-3 text-base"
            >
              Back to Rubrics
            </button>
          </div>
        </main>
      )}
    </div>
  );
}
