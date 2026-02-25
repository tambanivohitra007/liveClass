import { useEffect, useMemo, useState, useRef } from 'react';
import { collection, query, where, onSnapshot, doc, deleteDoc, getDocs, addDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuthStore } from '../../stores/authStore';
import { useToastStore } from '../../stores/toastStore';
import { confirmDelete, confirmAction } from '../../lib/swal';
import { useNavigate } from 'react-router-dom';
import { useActiveSession } from '../../hooks/useActiveSession';
import ActiveSessionBanner from '../../components/ActiveSessionBanner';
import { SkeletonCard, SkeletonStats } from '../../components/Skeleton';
import AiGenerateModal from '../../components/AiGenerateModal';
import WaveBackground from '../../components/ui/WaveBackground';
import {
  Trash2, Search, FileText, Users, HelpCircle, Play, Plus, ClipboardList,
  Eye, Copy, X as XIcon, BookOpen, MoreHorizontal, Pencil, Sparkles, BarChart3, Printer,
  Clock, ArrowRight,
} from 'lucide-react';
import { EmptyQuizzes, EmptySearch } from '../../components/EmptyStates';
import { COLLECTION_COLORS } from '../../types/models';
import type { Quiz, Collection, CollectionColor } from '../../types/models';

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
  // Firestore Timestamp object
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
  const [deleting, setDeleting] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [stats, setStats] = useState({ totalQuizzes: 0, totalQuestions: 0, totalSessions: 0 });
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([]);
  const navigate = useNavigate();
  const { activeSession, endActiveSession } = useActiveSession();

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

  // Collection modal state
  const [showCollModal, setShowCollModal] = useState(false);
  const [editingColl, setEditingColl] = useState<Collection | null>(null);
  const [collName, setCollName] = useState('');
  const [collDesc, setCollDesc] = useState('');
  const [collColor, setCollColor] = useState<CollectionColor>('brand');
  const [savingColl, setSavingColl] = useState(false);

  // AI Quiz modal state
  const [showAiQuizModal, setShowAiQuizModal] = useState(false);

  // New UI state
  const [selectedFilter, setSelectedFilter] = useState<string>('all');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpenId) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpenId]);

  const handleDelete = async (quizId: string, quizTitle: string) => {
    const { isConfirmed } = await confirmDelete(quizTitle || 'Untitled Quiz');
    if (!isConfirmed) return;
    setDeleting(quizId);
    try {
      const questionsSnap = await getDocs(query(collection(db, 'questions'), where('quizId', '==', quizId)));
      await Promise.all(questionsSnap.docs.map((d) => deleteDoc(d.ref)));
      await deleteDoc(doc(db, 'quizzes', quizId));
      addToast('success', `"${quizTitle}" deleted successfully`);
    } catch {
      addToast('error', 'Failed to delete quiz. Please try again.');
    } finally {
      setDeleting(null);
    }
  };

  const handleDuplicate = async (quiz: QuizWithMeta) => {
    if (!user) return;
    try {
      const newQuizRef = await addDoc(collection(db, 'quizzes'), {
        ownerId: user.id,
        title: `${quiz.title} (Copy)`,
        description: quiz.description,
        visibility: 'private',
        collectionId: quiz.collectionId || null,
        color: quiz.color || null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const questionsSnap = await getDocs(query(collection(db, 'questions'), where('quizId', '==', quiz.id)));
      await Promise.all(questionsSnap.docs.map((d) => {
        const qData = d.data();
        return addDoc(collection(db, 'questions'), { ...qData, quizId: newQuizRef.id });
      }));
      addToast('success', `"${quiz.title}" duplicated`);
    } catch {
      addToast('error', 'Failed to duplicate quiz');
    }
  };

  // Fetch quizzes
  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, 'quizzes'), where('ownerId', '==', user.id));

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const quizzesData = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as QuizWithMeta[];
      const quizIds = quizzesData.map((qz) => qz.id);

      // Batch: fetch ALL questions for all quizzes in one query instead of N+1
      let totalQ = 0;
      const questionCountMap = new Map<string, number>();
      if (quizIds.length > 0) {
        // Firestore 'in' supports up to 30 values; chunk if needed
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

      const sessionsSnap = await getDocs(query(collection(db, 'sessions'), where('hostId', '==', user.id)));

      // Extract recent ended sessions from the same query (no extra reads)
      const quizTitleMap = new Map<string, string>();
      enriched.forEach((q) => quizTitleMap.set(q.id, q.title));

      type SessionDoc = { id: string; status: string; endedAt: unknown; quizId: string; pinCode: string; top10Snapshot?: unknown[] };
      const endedSessions = sessionsSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as SessionDoc)
        .filter((s) => s.status === 'ended' && s.endedAt)
        .sort((a, b) => toMs(b.endedAt) - toMs(a.endedAt))
        .slice(0, 3)
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
        totalSessions: sessionsSnap.size,
      });
      setLoading(false);
    });

    return unsubscribe;
  }, [user]);

  // Fetch collections
  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, 'collections'), where('ownerId', '==', user.id));
    const unsub = onSnapshot(q, (snapshot) => {
      setCollections(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Collection[]);
    });

    return unsub;
  }, [user]);

  const openNewCollModal = () => {
    setEditingColl(null);
    setCollName('');
    setCollDesc('');
    setCollColor('brand');
    setShowCollModal(true);
  };

  const openEditCollModal = (coll: Collection) => {
    setEditingColl(coll);
    setCollName(coll.name);
    setCollDesc(coll.description);
    setCollColor(coll.color);
    setShowCollModal(true);
  };

  const handleSaveColl = async () => {
    if (!user || !collName.trim()) return;
    setSavingColl(true);
    try {
      if (editingColl) {
        await updateDoc(doc(db, 'collections', editingColl.id), {
          name: collName.trim(),
          description: collDesc.trim(),
          color: collColor,
          updatedAt: Date.now(),
        });
        addToast('success', 'Collection updated');
      } else {
        await addDoc(collection(db, 'collections'), {
          ownerId: user.id,
          name: collName.trim(),
          description: collDesc.trim(),
          color: collColor,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        addToast('success', 'Collection created');
      }
      setShowCollModal(false);
    } catch {
      addToast('error', 'Failed to save collection');
    } finally {
      setSavingColl(false);
    }
  };

  const handleQuizCollectionChange = async (quizId: string, collectionId: string) => {
    try {
      await updateDoc(doc(db, 'quizzes', quizId), {
        collectionId: collectionId || null,
      });
    } catch {
      addToast('error', 'Failed to update quiz collection');
    }
  };

  const handleHostLive = async (quizId: string) => {
    if (!activeSession) {
      navigate(`/quiz/${quizId}/host`);
      return;
    }

    if (activeSession.quizId === quizId) {
      // Same quiz — offer to resume
      const { isConfirmed } = await confirmAction(
        'Resume active session?',
        `You already have an active session for this quiz (PIN: ${activeSession.pinCode}). Resume it or start fresh?`,
        'Resume session',
      );
      if (isConfirmed) {
        navigate(`/quiz/${quizId}/host?sessionId=${activeSession.id}`);
      }
    } else {
      // Different quiz — must end the active session first
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

  const getQuizCountForCollection = (collId: string) =>
    quizzes.filter((q) => q.collectionId === collId).length;

  const getCardGradient = (quiz: QuizWithMeta): string => {
    if (quiz.color) return CARD_GRADIENTS[quiz.color] || DEFAULT_GRADIENT;
    if (!quiz.collectionId) return DEFAULT_GRADIENT;
    const coll = collections.find((c) => c.id === quiz.collectionId);
    if (!coll) return DEFAULT_GRADIENT;
    return CARD_GRADIENTS[coll.color] || DEFAULT_GRADIENT;
  };

  const getCollectionName = (quiz: QuizWithMeta): string | null => {
    if (!quiz.collectionId) return null;
    return collections.find((c) => c.id === quiz.collectionId)?.name || null;
  };

  const showQuickStart = quizzes.length >= 4;

  const quickStartQuizzes = useMemo(
    () => [...quizzes].sort((a, b) => toMs(b.updatedAt) - toMs(a.updatedAt)).slice(0, 3),
    [quizzes],
  );

  const filtered = quizzes
    .filter((q) => selectedFilter === 'all' || q.collectionId === selectedFilter)
    .filter((q) =>
      q.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.description.toLowerCase().includes(searchQuery.toLowerCase())
    );

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        <div className="h-8 w-48 bg-white/10 rounded-lg animate-pulse" />
        <SkeletonStats />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-surface">
    <WaveBackground variant="dark" position="bottom" />
    <div className="absolute inset-0 pattern-stars pointer-events-none" />
    <div className="relative z-10 max-w-7xl mx-auto px-6 py-8">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl text-white">
            Welcome back, {user?.displayName?.split(' ')[0] || 'Teacher'}
          </h1>
          <p className="text-white/40 mt-1 text-sm">Create, manage, and host your quizzes</p>
        </div>
        <div className="flex gap-3">
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
            onClick={() => navigate('/assignment/new')}
            className="btn-3d-ghost btn-3d-sm flex items-center gap-2 text-sm"
          >
            <ClipboardList className="w-4 h-4" />
            <span className="hidden sm:inline">Assignment</span>
          </button>
          <button
            onClick={() => navigate('/quiz/new')}
            className="btn-3d-cyan btn-3d-sm flex items-center gap-2 text-sm"
          >
            <Plus className="w-4 h-4" />
            Create New Quiz
          </button>
        </div>
      </div>

      {/* ── Stats Row ── */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          {
            icon: <FileText className="w-4 h-4" />, label: 'Quizzes', value: stats.totalQuizzes, color: 'text-brand bg-brand/10',
            sub: stats.totalQuizzes > 0 ? `${collections.length} collection${collections.length !== 1 ? 's' : ''}` : 'Create your first quiz',
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
            className={`card-night p-4 flex items-center gap-3 animate-fade-in ${'onClick' in s && s.onClick ? 'cursor-pointer card-night-hover' : ''}`}
            onClick={'onClick' in s ? (s as { onClick: () => void }).onClick : undefined}
          >
            <div className={`w-9 h-9 rounded-xl ${s.color} flex items-center justify-center shrink-0`}>{s.icon}</div>
            <div>
              <p className="text-xl font-bold text-white">{s.value}</p>
              <p className="text-[11px] font-medium text-white/40 uppercase tracking-wider">{s.label}</p>
              {s.sub && <p className="text-[11px] text-white/30 mt-0.5">{s.sub}</p>}
            </div>
          </div>
        ))}
      </div>

      {/* ── Active Session Banner ── */}
      {activeSession && (
        <ActiveSessionBanner session={activeSession} onEnd={handleEndActiveSession} />
      )}

      {/* ── Quick Start ── */}
      {showQuickStart && (
        <div className="mb-8 animate-fade-in">
          <h2 className="text-sm font-bold text-white/40 uppercase tracking-wider mb-3">Quick Start</h2>
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
                  <p className="font-semibold text-sm text-white truncate group-hover:text-brand transition-colors">
                    {quiz.title || 'Untitled Quiz'}
                  </p>
                  <p className="text-[11px] text-white/40">
                    {quiz.questionCount ?? 0} Qs &middot; {formatDate(quiz.updatedAt)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Recent Sessions ── */}
      {recentSessions.length > 0 && (
        <div className="mb-8 animate-fade-in">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-white/40 uppercase tracking-wider">Recent Sessions</h2>
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
                <p className="font-semibold text-sm text-white truncate group-hover:text-brand transition-colors">
                  {session.quizTitle}
                </p>
                <div className="flex items-center gap-2 mt-1.5 text-[11px] text-white/40">
                  <span className="flex items-center gap-0.5">
                    <Users className="w-3 h-3" />
                    {session.playerCount}{session.playerCount >= 10 ? '+' : ''} players
                  </span>
                  <span className="w-0.5 h-0.5 rounded-full bg-white/20" />
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

      {/* ── Search Bar ── */}
      <div className="relative mb-6 group">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 group-focus-within:text-brand transition-colors" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search your library for quizzes, topics, or folders..."
          className="w-full pl-12 pr-4 py-3.5 bg-white/5 rounded-xl border border-white/10 focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none transition-all text-sm text-white"
        />
      </div>

      {/* ── Filter Pills ── */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-8 no-scrollbar">
        <button
          onClick={() => setSelectedFilter('all')}
          className={`px-5 py-2 rounded-full text-sm font-semibold whitespace-nowrap spring-transition ${
            selectedFilter === 'all'
              ? 'bg-brand text-white shadow-sm'
              : 'bg-white/5 border border-white/10 text-white/60 hover:border-brand/40'
          }`}
        >
          All Quizzes
        </button>
        {collections.map((coll) => {
          const isActive = selectedFilter === coll.id;
          const colorMeta = COLLECTION_COLORS.find((c) => c.key === coll.color);
          return (
            <div key={coll.id} className="relative group/pill">
              <button
                onClick={() => setSelectedFilter(isActive ? 'all' : coll.id)}
                className={`px-5 py-2 rounded-full text-sm font-semibold whitespace-nowrap spring-transition flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-brand text-white shadow-sm'
                    : 'bg-white/5 border border-white/10 text-white/60 hover:border-brand/40'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${colorMeta?.bg || 'bg-gray-300'} ${isActive ? 'opacity-80' : ''}`} />
                {coll.name}
                <span className={`text-xs ${isActive ? 'text-white/70' : 'text-white/30'}`}>
                  {getQuizCountForCollection(coll.id)}
                </span>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); openEditCollModal(coll); }}
                className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-gray-700 text-white flex items-center justify-center opacity-0 group-hover/pill:opacity-100 transition-opacity shadow-sm"
                title="Edit collection"
              >
                <Pencil className="w-2.5 h-2.5" />
              </button>
            </div>
          );
        })}
        {collections.length > 0 && (
          <div className="h-6 w-px bg-white/10 mx-1 shrink-0" />
        )}
        <button
          onClick={openNewCollModal}
          className="px-4 py-2 rounded-full border-2 border-dashed border-white/20 text-white/40 text-sm font-medium hover:border-brand hover:text-brand transition-colors whitespace-nowrap flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" /> Collection
        </button>
      </div>

      {/* ── Quiz Grid ── */}
      {quizzes.length === 0 ? (
        <div className="text-center py-20">
          <EmptyQuizzes />
          <h3 className="text-lg font-semibold text-white mb-2 mt-4">No quizzes yet</h3>
          <p className="text-white/50 mb-6 text-sm">Create your first quiz to get started</p>
          <button
            onClick={() => navigate('/quiz/new')}
            className="btn-3d-cyan"
          >
            Create your first quiz
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <EmptySearch />
          <p className="text-white/50 mt-4 text-sm">No quizzes match "{searchQuery || collections.find(c => c.id === selectedFilter)?.name}"</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 stagger-children">
          {filtered.map((quiz) => {
            const collName = getCollectionName(quiz);
            return (
              <div
                key={quiz.id}
                className="group card-night card-night-hover flex flex-col animate-fade-in"
              >
                {/* Banner */}
                <div className={`h-32 ${quiz.coverImageUrl ? '' : getCardGradient(quiz)} relative overflow-hidden rounded-t-2xl`}>
                  {quiz.coverImageUrl ? (
                    <img src={quiz.coverImageUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <>
                      {/* Decorative shapes */}
                      <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-white/10" />
                      <div className="absolute right-10 bottom-1 w-16 h-16 rounded-full bg-white/5" />
                      <div className="absolute left-1/2 -top-8 w-32 h-32 rounded-full bg-white/5" />
                    </>
                  )}

                  {/* Collection badge */}
                  {collName && (
                    <div className="absolute top-3 left-3 px-2.5 py-1 bg-black/40 backdrop-blur-sm rounded-lg text-[10px] font-bold text-white uppercase tracking-wider">
                      {collName}
                    </div>
                  )}

                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                    <button
                      onClick={() => handleHostLive(quiz.id)}
                      className="p-3 bg-brand text-white rounded-full hover:scale-110 transition-transform shadow-lg"
                      title="Host Live"
                    >
                      <Play className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => navigate(`/quiz/${quiz.id}`)}
                      className="p-3 bg-white/10 text-white rounded-full hover:scale-110 transition-transform shadow-lg"
                      title="Edit"
                    >
                      <Pencil className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-5 flex-1 flex flex-col">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-base leading-tight text-white group-hover:text-brand transition-colors line-clamp-1">
                      {quiz.title || 'Untitled Quiz'}
                    </h3>
                    {/* More menu */}
                    <div className="relative" ref={menuOpenId === quiz.id ? menuRef : undefined}>
                      <button
                        onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === quiz.id ? null : quiz.id); }}
                        className="p-1 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/10 transition-colors"
                      >
                        <MoreHorizontal className="w-5 h-5" />
                      </button>
                      {menuOpenId === quiz.id && (
                          <div className="absolute right-0 top-full mt-1 w-52 bg-surface-card rounded-xl shadow-lg border border-white/10 z-20 py-1.5 animate-fade-in">
                            <button
                              onClick={() => { navigate(`/quiz/${quiz.id}/preview`); setMenuOpenId(null); }}
                              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-white/70 hover:bg-white/10 transition-colors"
                            >
                              <Eye className="w-4 h-4 text-white/40" /> Preview
                            </button>
                            <button
                              onClick={() => { handleDuplicate(quiz); setMenuOpenId(null); }}
                              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-white/70 hover:bg-white/10 transition-colors"
                            >
                              <Copy className="w-4 h-4 text-white/40" /> Duplicate
                            </button>
                            <button
                              onClick={() => { navigate(`/quiz/${quiz.id}/flashcards`); setMenuOpenId(null); }}
                              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-white/70 hover:bg-white/10 transition-colors"
                            >
                              <BookOpen className="w-4 h-4 text-white/40" /> Flashcards
                            </button>
                            <button
                              onClick={() => { navigate(`/quiz/${quiz.id}/worksheet`); setMenuOpenId(null); }}
                              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-white/70 hover:bg-white/10 transition-colors"
                            >
                              <Printer className="w-4 h-4 text-white/40" /> Worksheet
                            </button>
                            {collections.length > 0 && (
                              <>
                                <hr className="my-1.5 border-white/10" />
                                <div className="px-4 py-2">
                                  <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">Move to</p>
                                  <select
                                    value={quiz.collectionId || ''}
                                    onChange={(e) => { handleQuizCollectionChange(quiz.id, e.target.value); setMenuOpenId(null); }}
                                    className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-white/10 text-white/70 bg-white/5 outline-none"
                                  >
                                    <option value="">Uncategorized</option>
                                    {collections.map((c) => (
                                      <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                  </select>
                                </div>
                              </>
                            )}
                            <hr className="my-1.5 border-white/10" />
                            <button
                              onClick={() => { handleDelete(quiz.id, quiz.title); setMenuOpenId(null); }}
                              disabled={deleting === quiz.id}
                              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-danger hover:bg-danger/10 transition-colors disabled:opacity-50"
                            >
                              <Trash2 className="w-4 h-4" /> Delete
                            </button>
                          </div>
                      )}
                    </div>
                  </div>

                  {/* Metadata */}
                  <div className="flex items-center gap-3 text-sm text-white/40 mb-5">
                    <span className="flex items-center gap-1">
                      <HelpCircle className="w-3.5 h-3.5" />
                      {quiz.questionCount ?? '?'} Qs
                    </span>
                    <span className="w-1 h-1 rounded-full bg-white/20" />
                    <span>{formatDate(quiz.updatedAt)}</span>
                  </div>

                  {/* Host button */}
                  <button
                    onClick={() => handleHostLive(quiz.id)}
                    className="btn-3d-cyan btn-3d-sm w-full text-sm mt-auto"
                  >
                    Host Live
                  </button>
                </div>
              </div>
            );
          })}

          {/* Create Placeholder Card */}
          <button
            onClick={() => navigate('/quiz/new')}
            className="min-h-[280px] flex flex-col items-center justify-center border-2 border-dashed border-white/20 rounded-2xl hover:border-brand hover:bg-brand/5 transition-all duration-200 group/create"
          >
            <div className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center text-white/30 group-hover/create:bg-brand group-hover/create:text-white transition-all mb-4 hover-jelly">
              <Plus className="w-7 h-7" />
            </div>
            <span className="font-bold text-white/40 group-hover/create:text-brand transition-colors">New Quiz</span>
          </button>
        </div>
      )}

      {/* ── Footer ── */}
      {filtered.length > 0 && (
        <div className="mt-10 flex items-center justify-between py-5 border-t border-white/10">
          <p className="text-sm text-white/40">
            Showing {filtered.length} of {quizzes.length} quiz{quizzes.length !== 1 ? 'zes' : ''}
          </p>
        </div>
      )}

      {/* ── AI Quiz Modal ── */}
      <AiGenerateModal
        open={showAiQuizModal}
        onClose={() => setShowAiQuizModal(false)}
        generateMeta={true}
        onGenerated={handleAiQuizGenerated}
      />

      {/* ── Collection Modal ── */}
      {showCollModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowCollModal(false)} onKeyDown={(e) => { if (e.key === 'Escape') setShowCollModal(false); }}>
          <div role="dialog" aria-modal="true" aria-label={editingColl ? 'Edit Collection' : 'New Collection'} className="card-night w-full max-w-md animate-bounce-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 pb-0">
              <h3 className="text-lg text-white">{editingColl ? 'Edit Collection' : 'New Collection'}</h3>
              <button onClick={() => setShowCollModal(false)} className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 transition-colors">
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-white/60 mb-1.5">Name</label>
                <input
                  value={collName}
                  onChange={(e) => setCollName(e.target.value)}
                  placeholder="e.g. Biology"
                  className="w-full px-4 py-3 rounded-xl border border-white/10 bg-white/5 focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none text-white"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-white/60 mb-1.5">Description</label>
                <textarea
                  value={collDesc}
                  onChange={(e) => setCollDesc(e.target.value)}
                  placeholder="Optional description"
                  rows={2}
                  className="w-full px-4 py-3 rounded-xl border border-white/10 bg-white/5 focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none text-white resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-white/60 mb-1.5">Color</label>
                <div className="flex gap-2">
                  {COLLECTION_COLORS.map((c) => (
                    <button
                      key={c.key}
                      onClick={() => setCollColor(c.key)}
                      className={`w-8 h-8 rounded-full ${c.bg} border border-white/20 transition-all ${collColor === c.key ? 'ring-2 ring-offset-2 ring-offset-surface-card ring-brand scale-110' : 'hover:scale-105'}`}
                      title={c.label}
                    />
                  ))}
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleSaveColl}
                  disabled={savingColl || !collName.trim()}
                  className="btn-3d-cyan flex-1 disabled:opacity-50"
                >
                  {savingColl ? 'Saving...' : editingColl ? 'Update' : 'Create'}
                </button>
                <button
                  onClick={() => setShowCollModal(false)}
                  className="btn-3d-ghost px-5"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}
