import { useEffect, useMemo, useState } from 'react';
import { collection, query, where, onSnapshot, getDocs, orderBy, limit, getCountFromServer } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuthStore } from '../../stores/authStore';
import { useToastStore } from '../../stores/toastStore';
import { confirmAction } from '../../lib/swal';
import { useNavigate } from 'react-router-dom';
import { useActiveSession } from '../../hooks/useActiveSession';
import ActiveSessionBanner from '../../components/ActiveSessionBanner';
import { SkeletonStats } from '../../components/Skeleton';
import AiGenerateModal from '../../components/AiGenerateModal';
import WaveBackground from '../../components/ui/WaveBackground';
import {
  FileText, Users, HelpCircle, Play, Plus, ClipboardList, ClipboardCheck,
  Sparkles, BarChart3, Clock, ArrowRight, BookOpen, Gamepad2,
} from 'lucide-react';
import { addDoc, serverTimestamp } from 'firebase/firestore';
import type { Quiz, Collection } from '../../types/models';
import boy1 from '../../assets/optimized/boy_1.png';

interface QuizWithMeta extends Quiz {
  questionCount?: number;
}

interface RecentSession {
  id: string;
  quizId: string;
  quizTitle: string;
  pinCode: string;
  endedAt: number;
  playerCount: number;
}

const CARD_GRADIENTS: Record<string, string> = {
  brand: 'bg-gradient-to-br from-[#0EA5E9] to-[#0080B8]',
  accent: 'bg-gradient-to-br from-[#8B3DC7] to-[#5A1886]',
  success: 'bg-gradient-to-br from-[#34D399] to-[#15803D]',
  warning: 'bg-gradient-to-br from-[#F4CF5D] to-[#D4A530]',
  info: 'bg-gradient-to-br from-[#60A5FA] to-[#2563EB]',
  purple: 'bg-gradient-to-br from-[#A78BFA] to-[#7C3AED]',
};
const DEFAULT_GRADIENT = 'bg-gradient-to-br from-[#4B5563] to-[#374151]';

function toMs(ts: unknown): number {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts;
  if (typeof ts === 'object' && ts !== null && 'toMillis' in ts && typeof (ts as { toMillis: () => number }).toMillis === 'function') {
    return (ts as { toMillis: () => number }).toMillis();
  }
  return 0;
}

function formatDate(ts: unknown): string {
  const ms = toMs(ts);
  if (!ms) return '';
  const date = new Date(ms);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isToday) return `Today, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  if (isYesterday) return `Yesterday, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  if (date.getFullYear() === now.getFullYear()) return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function Dashboard() {
  const { user } = useAuthStore();
  const { addToast } = useToastStore();
  const [quizzes, setQuizzes] = useState<QuizWithMeta[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ totalQuizzes: 0, totalQuestions: 0, totalSessions: 0 });
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([]);
  const navigate = useNavigate();
  const { activeSession, endActiveSession } = useActiveSession();

  // AI Quiz modal state
  const [showAiQuizModal, setShowAiQuizModal] = useState(false);

  const handleEndActiveSession = async () => {
    if (!activeSession) return;
    const { isConfirmed } = await confirmAction(
      'End active session?',
      `This will end the session for "${activeSession.quizTitle}" (PIN: ${activeSession.pinCode}). All players will be disconnected.`,
      'End session',
    );
    if (!isConfirmed) return;
    try {
      await endActiveSession();
      addToast('success', 'Session ended successfully');
    } catch {
      addToast('error', 'Failed to end session. Please try again.');
    }
  };

  const handleHostLive = async (quizId: string) => {
    if (!activeSession) {
      navigate(`/quiz/${quizId}/host`);
      return;
    }

    if (activeSession.quizId === quizId) {
      const { isConfirmed } = await confirmAction(
        'Resume active session?',
        `You already have an active session for this quiz (PIN: ${activeSession.pinCode}). Resume it or start fresh?`,
        'Resume session',
      );
      if (isConfirmed) {
        navigate(`/quiz/${quizId}/host?sessionId=${activeSession.id}`);
      }
    } else {
      const { isConfirmed } = await confirmAction(
        'End current session?',
        `You have an active session for "${activeSession.quizTitle}". It must be ended before starting a new one.`,
        'End & start new',
      );
      if (isConfirmed) {
        await endActiveSession();
        navigate(`/quiz/${quizId}/host`);
      }
    }
  };

  const handleAiQuizGenerated = async (data: {
    questions: { type: string; text: string; options: string[]; matchOptions?: string[]; correctAnswers: string[]; timeLimitSec: number }[];
    title?: string;
    description?: string;
    note?: string;
  }) => {
    if (!user) return;
    try {
      const quizRef = await addDoc(collection(db, 'quizzes'), {
        ownerId: user.id,
        title: data.title || 'AI Generated Quiz',
        description: data.description || '',
        visibility: 'private',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      for (const q of data.questions) {
        await addDoc(collection(db, 'questions'), {
          quizId: quizRef.id,
          type: q.type || 'mcq',
          text: q.text || '',
          options: q.options || [],
          ...(q.matchOptions ? { matchOptions: q.matchOptions } : {}),
          correctAnswers: q.correctAnswers || [],
          timeLimitSec: q.timeLimitSec || 20,
        });
      }

      navigate(`/quiz/${quizRef.id}`);
    } catch {
      addToast('error', 'Failed to save generated quiz');
    }
  };

  // Fetch quizzes
  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, 'quizzes'), where('ownerId', '==', user.id));

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const quizzesData = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as QuizWithMeta[];
      const quizIds = quizzesData.map((qz) => qz.id);

      let totalQ = 0;
      const questionCountMap = new Map<string, number>();
      if (quizIds.length > 0) {
        for (let i = 0; i < quizIds.length; i += 30) {
          const chunk = quizIds.slice(i, i + 30);
          const qSnap = await getDocs(query(collection(db, 'questions'), where('quizId', 'in', chunk)));
          qSnap.docs.forEach((d) => {
            const qid = d.data().quizId as string;
            questionCountMap.set(qid, (questionCountMap.get(qid) || 0) + 1);
            totalQ++;
          });
        }
      }

      const enriched = quizzesData.map((quiz) => ({
        ...quiz,
        questionCount: questionCountMap.get(quiz.id) || 0,
      }));

      // Fetch recent 3 ended sessions (limited query instead of loading all)
      const recentSessionsQuery = query(
        collection(db, 'sessions'),
        where('hostId', '==', user.id),
        where('status', '==', 'ended'),
        orderBy('endedAt', 'desc'),
        limit(3)
      );
      const [recentSnap, totalCountSnap] = await Promise.all([
        getDocs(recentSessionsQuery),
        getCountFromServer(query(collection(db, 'sessions'), where('hostId', '==', user.id))),
      ]);

      const quizTitleMap = new Map<string, string>();
      enriched.forEach((q) => quizTitleMap.set(q.id, q.title));

      type SessionDoc = { id: string; status: string; endedAt: unknown; quizId: string; pinCode: string; top10Snapshot?: unknown[] };
      const endedSessions = recentSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as SessionDoc)
        .map((s) => ({
          id: s.id,
          quizId: s.quizId,
          quizTitle: quizTitleMap.get(s.quizId) || 'Untitled Quiz',
          pinCode: s.pinCode || '',
          endedAt: toMs(s.endedAt),
          playerCount: Array.isArray(s.top10Snapshot) ? s.top10Snapshot.length : 0,
        }));

      setQuizzes(enriched);
      setRecentSessions(endedSessions);
      setStats({
        totalQuizzes: enriched.length,
        totalQuestions: totalQ,
        totalSessions: totalCountSnap.data().count,
      });
      setLoading(false);
    });

    return unsubscribe;
  }, [user]);

  // Fetch collections (needed for quick start card gradients)
  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, 'collections'), where('ownerId', '==', user.id));
    const unsub = onSnapshot(q, (snapshot) => {
      setCollections(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Collection[]);
    });

    return unsub;
  }, [user]);

  const getCardGradient = (quiz: QuizWithMeta): string => {
    if (quiz.color) return CARD_GRADIENTS[quiz.color] || DEFAULT_GRADIENT;
    if (!quiz.collectionId) return DEFAULT_GRADIENT;
    const coll = collections.find((c) => c.id === quiz.collectionId);
    if (!coll) return DEFAULT_GRADIENT;
    return CARD_GRADIENTS[coll.color] || DEFAULT_GRADIENT;
  };

  const showQuickStart = quizzes.length >= 4;

  const quickStartQuizzes = useMemo(
    () => [...quizzes].sort((a, b) => toMs(b.updatedAt) - toMs(a.updatedAt)).slice(0, 3),
    [quizzes],
  );

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        <div className="h-8 w-48 rounded-lg animate-shimmer" />
        <SkeletonStats />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-surface">
    <WaveBackground variant="dark" position="bottom" />
    <div className="absolute inset-0 pattern-stars pointer-events-none" />
    <div className="relative z-10 max-w-7xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <img
            src={boy1}
            alt="Teacher profile"
            className="w-20 h-20 sm:w-28 sm:h-28 rounded-3xl object-contain object-center opacity-75 dark:opacity-60 mix-blend-multiply dark:mix-blend-screen"
          />
          <div className="space-y-1">
            <h1 className="text-2xl text-gray-900 dark:text-white">
              Welcome back, {user?.displayName?.split(' ')[0] || 'Teacher'}
            </h1>
            <p className="text-gray-400 dark:text-white/40 text-sm">Create, manage, and host your quizzes</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:gap-3">
          <button
            onClick={() => navigate('/history')}
            className="btn-3d-ghost btn-3d-sm flex items-center gap-2 text-sm"
          >
            <BarChart3 className="w-4 h-4" />
            <span className="hidden sm:inline">Results</span>
          </button>
          <button
            onClick={() => setShowAiQuizModal(true)}
            className="btn-3d-purple btn-3d-sm flex items-center gap-2 text-sm"
          >
            <Sparkles className="w-4 h-4" />
            <span className="hidden sm:inline">AI Generate</span>
          </button>
          <button
            onClick={() => navigate('/grading/new')}
            className="btn-3d-ghost btn-3d-sm flex items-center gap-2 text-sm"
          >
            <ClipboardCheck className="w-4 h-4" />
            <span className="hidden sm:inline">Grade</span>
          </button>
          <button
            onClick={() => navigate('/assignment/new')}
            className="btn-3d-ghost btn-3d-sm flex items-center gap-2 text-sm"
          >
            <ClipboardList className="w-4 h-4" />
            <span className="hidden sm:inline">Assignment</span>
          </button>
          <button
            onClick={() => navigate('/quiz/new')}
            className="btn-3d-blue btn-3d-sm flex items-center gap-2 text-sm"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Create New</span>
            <span className="sm:hidden">New</span>
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {[
          {
            icon: <FileText className="w-4 h-4" />, label: 'Quizzes', value: stats.totalQuizzes, color: 'text-brand bg-brand/10',
            sub: stats.totalQuizzes > 0 ? `${collections.length} collection${collections.length !== 1 ? 's' : ''}` : 'Create your first quiz',
            onClick: () => navigate('/library'),
          },
          {
            icon: <HelpCircle className="w-4 h-4" />, label: 'Questions', value: stats.totalQuestions, color: 'text-accent-dark bg-accent/10',
            sub: stats.totalQuizzes > 0 ? `~${Math.round(stats.totalQuestions / stats.totalQuizzes)} per quiz` : '',
          },
          {
            icon: <Users className="w-4 h-4" />, label: 'Sessions', value: stats.totalSessions, color: 'text-success bg-success/10',
            sub: recentSessions.length > 0 ? `Last: ${formatDate(recentSessions[0].endedAt)}` : 'No sessions yet',
            onClick: () => navigate('/history'),
          },
        ].map((s) => (
          <div
            key={s.label}
            className={`card-night p-4 flex items-center gap-3 animate-fade-in ${s.onClick ? 'cursor-pointer card-night-hover' : ''}`}
            onClick={s.onClick}
          >
            <div className={`w-9 h-9 rounded-xl ${s.color} flex items-center justify-center shrink-0`}>{s.icon}</div>
            <div>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{s.value}</p>
              <p className="text-[11px] font-medium text-gray-400 dark:text-white/40 uppercase tracking-wider">{s.label}</p>
              {s.sub && <p className="text-[11px] text-gray-300 dark:text-white/30 mt-0.5">{s.sub}</p>}
            </div>
          </div>
        ))}
      </div>

      {/* Active Session Banner */}
      {activeSession && (
        <ActiveSessionBanner session={activeSession} onEnd={handleEndActiveSession} />
      )}

      {/* Binary Challenge Card */}
      <div className="mb-8 animate-fade-in">
        <button
          onClick={() => navigate('/mini-games')}
          className="card-night card-night-hover p-4 flex items-center gap-3 w-full text-left group"
        >
          <div className="w-10 h-10 rounded-lg bg-brand/10 flex items-center justify-center shrink-0">
            <Gamepad2 className="w-5 h-5 text-brand" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-gray-900 dark:text-white group-hover:text-brand transition-colors">
              Mini Games
            </p>
            <p className="text-[11px] text-gray-400 dark:text-white/40">
              12 educational games: Binary, Subnet, Code Output &amp; more
            </p>
          </div>
          <ArrowRight className="w-4 h-4 text-gray-400 dark:text-white/40 group-hover:text-brand transition-colors" />
        </button>
      </div>

      {/* Quick Start */}
      {showQuickStart && (
        <div className="mb-8 animate-fade-in">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-gray-400 dark:text-white/40 uppercase tracking-wider">Quick Start</h2>
            <button
              onClick={() => navigate('/library')}
              className="text-xs font-medium text-brand hover:text-brand-dark flex items-center gap-1 transition-colors"
            >
              View all quizzes <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {quickStartQuizzes.map((quiz) => (
              <button
                key={quiz.id}
                onClick={() => handleHostLive(quiz.id)}
                className="card-night card-night-hover p-3 flex items-center gap-3 text-left group"
              >
                <div className={`w-10 h-10 rounded-lg ${getCardGradient(quiz)} flex items-center justify-center shrink-0`}>
                  <Play className="w-4 h-4 text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm text-gray-900 dark:text-white truncate group-hover:text-brand transition-colors">
                    {quiz.title || 'Untitled Quiz'}
                  </p>
                  <p className="text-[11px] text-gray-400 dark:text-white/40">
                    {quiz.questionCount ?? 0} Qs &middot; {formatDate(quiz.updatedAt)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Recent Sessions */}
      {recentSessions.length > 0 && (
        <div className="mb-8 animate-fade-in">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-gray-400 dark:text-white/40 uppercase tracking-wider">Recent Sessions</h2>
            <button
              onClick={() => navigate('/history')}
              className="text-xs font-medium text-brand hover:text-brand-dark flex items-center gap-1 transition-colors"
            >
              View all <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {recentSessions.map((session) => (
              <button
                key={session.id}
                onClick={() => navigate(`/session/${session.id}/results`)}
                className="card-night card-night-hover p-3 text-left group"
              >
                <p className="font-semibold text-sm text-gray-900 dark:text-white truncate group-hover:text-brand transition-colors">
                  {session.quizTitle}
                </p>
                <div className="flex items-center gap-2 mt-1.5 text-[11px] text-gray-400 dark:text-white/40">
                  <span className="flex items-center gap-0.5">
                    <Users className="w-3 h-3" />
                    {session.playerCount}{session.playerCount >= 10 ? '+' : ''} players
                  </span>
                  <span className="w-0.5 h-0.5 rounded-full bg-gray-300 dark:bg-white/20" />
                  <span className="flex items-center gap-0.5">
                    <Clock className="w-3 h-3" />
                    {formatDate(session.endedAt)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* View Library Link (when no quick start) */}
      {!showQuickStart && quizzes.length > 0 && (
        <div className="mb-8 animate-fade-in">
          <button
            onClick={() => navigate('/library')}
            className="card-night card-night-hover p-4 flex items-center gap-3 w-full text-left group"
          >
            <div className="w-10 h-10 rounded-lg bg-brand/10 flex items-center justify-center shrink-0">
              <BookOpen className="w-5 h-5 text-brand" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-gray-900 dark:text-white group-hover:text-brand transition-colors">
                View Quiz Library
              </p>
              <p className="text-[11px] text-gray-400 dark:text-white/40">
                {quizzes.length} quiz{quizzes.length !== 1 ? 'zes' : ''} &middot; Search, filter, and manage your quizzes
              </p>
            </div>
            <ArrowRight className="w-4 h-4 text-gray-400 dark:text-white/40 group-hover:text-brand transition-colors" />
          </button>
        </div>
      )}

      {/* AI Quiz Modal */}
      <AiGenerateModal
        open={showAiQuizModal}
        onClose={() => setShowAiQuizModal(false)}
        generateMeta={true}
        onGenerated={handleAiQuizGenerated}
      />
    </div>
    </div>
  );
}
