import { useEffect, useMemo, useState } from 'react';
import { collection, query, where, onSnapshot, doc, deleteDoc, getDocs, addDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuthStore } from '../../stores/authStore';
import { useToastStore } from '../../stores/toastStore';
import { confirmDelete, confirmAction } from '../../lib/swal';
import { useNavigate } from 'react-router-dom';
import { useActiveSession } from '../../hooks/useActiveSession';
import { SkeletonCard } from '../../components/Skeleton';
import AiGenerateModal from '../../components/AiGenerateModal';
import WaveBackground from '../../components/ui/WaveBackground';
import {
  Trash2, Search, Play, Plus,
  Eye, Copy, X as XIcon, BookOpen, MoreHorizontal, Pencil, Sparkles, Printer,
  LayoutGrid, List, Table2,
} from 'lucide-react';
import { EmptyQuizzes, EmptySearch } from '../../components/EmptyStates';
import { COLLECTION_COLORS } from '../../types/models';
import type { Quiz, Collection, CollectionColor } from '../../types/models';

type ViewMode = 'card' | 'list' | 'table';

interface QuizWithMeta extends Quiz {
  questionCount?: number;
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

export default function QuizLibrary() {
  const { user } = useAuthStore();
  const { addToast } = useToastStore();
  const [quizzes, setQuizzes] = useState<QuizWithMeta[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();
  const { activeSession, endActiveSession } = useActiveSession();

  // Collection modal state
  const [showCollModal, setShowCollModal] = useState(false);
  const [editingColl, setEditingColl] = useState<Collection | null>(null);
  const [collName, setCollName] = useState('');
  const [collDesc, setCollDesc] = useState('');
  const [collColor, setCollColor] = useState<CollectionColor>('brand');
  const [savingColl, setSavingColl] = useState(false);

  // AI Quiz modal state
  const [showAiQuizModal, setShowAiQuizModal] = useState(false);

  // View state
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    return (localStorage.getItem('quizLibraryView') as ViewMode) || 'card';
  });

  const changeViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem('quizLibraryView', mode);
  };

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpenId) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest(`[data-quiz-menu="${menuOpenId}"]`)) return;
      setMenuOpenId(null);
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

      const questionCountMap = new Map<string, number>();
      if (quizIds.length > 0) {
        for (let i = 0; i < quizIds.length; i += 30) {
          const chunk = quizIds.slice(i, i + 30);
          const qSnap = await getDocs(query(collection(db, 'questions'), where('quizId', 'in', chunk)));
          qSnap.docs.forEach((d) => {
            const qid = d.data().quizId as string;
            questionCountMap.set(qid, (questionCountMap.get(qid) || 0) + 1);
          });
        }
      }

      const enriched = quizzesData.map((quiz) => ({
        ...quiz,
        questionCount: questionCountMap.get(quiz.id) || 0,
      }));

      setQuizzes(enriched);
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
      const collName = collectionId
        ? collections.find((c) => c.id === collectionId)?.name || 'collection'
        : 'Uncategorized';
      addToast('success', `Moved to ${collName}`);
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

  const getQuizCountForCollection = (collId: string) =>
    quizzes.filter((q) => q.collectionId === collId).length;

  const getCardGradient = (quiz: QuizWithMeta): string => {
    if (quiz.color) return CARD_GRADIENTS[quiz.color] || DEFAULT_GRADIENT;
    if (!quiz.collectionId) return DEFAULT_GRADIENT;
    const coll = collections.find((c) => c.id === quiz.collectionId);
    if (!coll) return DEFAULT_GRADIENT;
    return CARD_GRADIENTS[coll.color] || DEFAULT_GRADIENT;
  };

  const filtered = useMemo(() =>
    quizzes
      .filter((q) =>
        q.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        q.description.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    [quizzes, searchQuery],
  );

  // Group filtered quizzes by collection
  const grouped = useMemo(() => {
    const groups: { collection: Collection | null; quizzes: QuizWithMeta[] }[] = [];
    const collMap = new Map<string, QuizWithMeta[]>();
    const uncategorized: QuizWithMeta[] = [];

    for (const quiz of filtered) {
      if (quiz.collectionId) {
        const arr = collMap.get(quiz.collectionId) || [];
        arr.push(quiz);
        collMap.set(quiz.collectionId, arr);
      } else {
        uncategorized.push(quiz);
      }
    }

    // Collections in their original order
    for (const coll of collections) {
      const quizzesInColl = collMap.get(coll.id);
      if (quizzesInColl && quizzesInColl.length > 0) {
        groups.push({ collection: coll, quizzes: quizzesInColl });
      }
    }

    // Uncategorized last
    if (uncategorized.length > 0) {
      groups.push({ collection: null, quizzes: uncategorized });
    }

    return groups;
  }, [filtered, collections]);

  const renderMoreMenu = (quiz: QuizWithMeta) => (
    <div className="relative" data-quiz-menu={quiz.id}>
      <button
        onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === quiz.id ? null : quiz.id); }}
        className="p-1.5 rounded-lg text-gray-300 dark:text-white/30 hover:text-gray-600 dark:hover:text-white/60 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {menuOpenId === quiz.id && (
        <div className="absolute right-0 top-full mt-1 w-52 bg-surface-card rounded-xl shadow-lg border border-gray-200 dark:border-white/10 z-50 py-1.5 animate-fade-in">
          <button
            onClick={() => { navigate(`/quiz/${quiz.id}/preview`); setMenuOpenId(null); }}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-600 dark:text-white/70 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
          >
            <Eye className="w-4 h-4 text-gray-400 dark:text-white/40" /> Preview
          </button>
          <button
            onClick={() => { handleDuplicate(quiz); setMenuOpenId(null); }}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-600 dark:text-white/70 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
          >
            <Copy className="w-4 h-4 text-gray-400 dark:text-white/40" /> Duplicate
          </button>
          <button
            onClick={() => { navigate(`/quiz/${quiz.id}/flashcards`); setMenuOpenId(null); }}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-600 dark:text-white/70 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
          >
            <BookOpen className="w-4 h-4 text-gray-400 dark:text-white/40" /> Flashcards
          </button>
          <button
            onClick={() => { navigate(`/quiz/${quiz.id}/worksheet`); setMenuOpenId(null); }}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-600 dark:text-white/70 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
          >
            <Printer className="w-4 h-4 text-gray-400 dark:text-white/40" /> Worksheet
          </button>
          {collections.length > 0 && (
            <>
              <hr className="my-1.5 border-gray-200 dark:border-white/10" />
              <div className="px-4 py-2">
                <p className="text-[10px] font-semibold text-gray-400 dark:text-white/40 uppercase tracking-wider mb-1.5">Move to</p>
                <select
                  value={quiz.collectionId || ''}
                  onChange={(e) => { handleQuizCollectionChange(quiz.id, e.target.value); setMenuOpenId(null); }}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-white/20 text-gray-600 dark:text-white/80 bg-gray-50 dark:bg-slate-800 outline-none"
                >
                  <option value="" className="bg-white dark:bg-slate-800 text-gray-700 dark:text-white">Uncategorized</option>
                  {collections.map((c) => (
                    <option key={c.id} value={c.id} className="bg-white dark:bg-slate-800 text-gray-700 dark:text-white">{c.name}</option>
                  ))}
                </select>
              </div>
            </>
          )}
          <hr className="my-1.5 border-gray-200 dark:border-white/10" />
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
  );

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        <div className="h-8 w-48 bg-gray-100 dark:bg-white/10 rounded-lg animate-pulse" />
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
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl text-gray-900 dark:text-white">My Quizzes</h1>
            <p className="text-gray-400 dark:text-white/40 mt-1 text-sm">
              {quizzes.length} quiz{quizzes.length !== 1 ? 'zes' : ''} &middot; {collections.length} collection{collections.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setShowAiQuizModal(true)}
              className="btn-3d-purple btn-3d-sm flex items-center gap-2 text-sm"
            >
              <Sparkles className="w-4 h-4" />
              <span className="hidden sm:inline">AI Generate</span>
            </button>
            <button
              onClick={() => navigate('/quiz/new')}
              className="btn-3d-cyan btn-3d-sm flex items-center gap-2 text-sm"
            >
              <Plus className="w-4 h-4" />
              New Quiz
            </button>
          </div>
        </div>

        {/* Search Bar + View Toggle */}
        <div className="flex items-center gap-3 mb-4">
          <div className="relative group flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300 dark:text-white/30 group-focus-within:text-brand transition-colors" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search quizzes..."
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-white/5 rounded-xl border border-gray-200 dark:border-white/10 focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none transition-all text-sm text-gray-900 dark:text-white"
            />
          </div>
          <div className="hidden sm:flex items-center bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl p-1 gap-0.5">
            {([
              { mode: 'card' as ViewMode, icon: LayoutGrid, label: 'Card view' },
              { mode: 'list' as ViewMode, icon: List, label: 'List view' },
              { mode: 'table' as ViewMode, icon: Table2, label: 'Table view' },
            ]).map(({ mode, icon: Icon, label }) => (
              <button
                key={mode}
                onClick={() => changeViewMode(mode)}
                className={`p-2 rounded-lg transition-all ${
                  viewMode === mode
                    ? 'bg-brand text-white shadow-sm'
                    : 'text-gray-400 dark:text-white/40 hover:text-gray-600 dark:hover:text-white/70 hover:bg-gray-100 dark:hover:bg-white/10'
                }`}
                title={label}
              >
                <Icon className="w-4 h-4" />
              </button>
            ))}
          </div>
        </div>

        {/* Collection management row */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-5 no-scrollbar">
          {collections.map((coll) => {
            const colorMeta = COLLECTION_COLORS.find((c) => c.key === coll.color);
            return (
              <div key={coll.id} className="relative group/pill">
                <button
                  onClick={() => navigate(`/collection/${coll.id}`)}
                  className="px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap spring-transition flex items-center gap-1.5 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 text-gray-500 dark:text-white/60 hover:border-brand/40"
                >
                  <span className={`w-2 h-2 rounded-full ${colorMeta?.bg || 'bg-gray-300'}`} />
                  {coll.name}
                  <span className="text-xs text-gray-300 dark:text-white/30">
                    {getQuizCountForCollection(coll.id)}
                  </span>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); openEditCollModal(coll); }}
                  className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-gray-500 dark:bg-gray-700 text-white flex items-center justify-center opacity-100 md:opacity-0 md:group-hover/pill:opacity-100 transition-opacity shadow-sm"
                  title="Edit collection"
                >
                  <Pencil className="w-2.5 h-2.5" />
                </button>
              </div>
            );
          })}
          {collections.length > 0 && (
            <div className="h-6 w-px bg-gray-100 dark:bg-white/10 mx-1 shrink-0" />
          )}
          <button
            onClick={openNewCollModal}
            className="px-4 py-2 rounded-full border-2 border-dashed border-gray-300 dark:border-white/20 text-gray-400 dark:text-white/40 text-sm font-medium hover:border-brand hover:text-brand transition-colors whitespace-nowrap flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" /> Collection
          </button>
        </div>

        {/* Quizzes grouped by collection */}
        {quizzes.length === 0 ? (
          <div className="text-center py-20">
            <EmptyQuizzes />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2 mt-4">No quizzes yet</h3>
            <p className="text-gray-500 dark:text-white/50 mb-6 text-sm">Create your first quiz to get started</p>
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
            <p className="text-gray-500 dark:text-white/50 mt-4 text-sm">No quizzes match "{searchQuery}"</p>
          </div>
        ) : (
          <div className="space-y-8">
            {grouped.map((group) => {
              const colorMeta = group.collection ? COLLECTION_COLORS.find((c) => c.key === group.collection!.color) : null;
              const sectionKey = group.collection?.id || '__uncategorized';

              return (
                <section key={sectionKey}>
                  {/* Section Header */}
                  <div className="flex items-center gap-2 mb-4">
                    {colorMeta && (
                      <span className={`w-2.5 h-2.5 rounded-full ${colorMeta.bg}`} />
                    )}
                    <h2 className="text-base font-bold text-gray-900 dark:text-white">
                      {group.collection?.name || 'Uncategorized'}
                    </h2>
                    <span className="text-xs text-gray-400 dark:text-white/40 font-medium">
                      {group.quizzes.length}
                    </span>
                    {group.collection && (
                      <button
                        onClick={() => openEditCollModal(group.collection!)}
                        className="p-1 rounded-md text-gray-300 dark:text-white/30 hover:text-brand hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                        title="Edit collection"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  {/* Desktop: view mode rendering */}
                  {viewMode === 'card' && (
                    <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                      {group.quizzes.map((quiz) => (
                        <div
                          key={quiz.id}
                          className={`group relative card-night card-night-hover flex flex-col animate-fade-in ${menuOpenId === quiz.id ? 'z-50' : 'z-0'}`}
                        >
                          <div
                            className={`w-full h-32 ${quiz.coverImageUrl ? '' : getCardGradient(quiz)} relative overflow-hidden rounded-t-2xl shrink-0 cursor-pointer`}
                            onClick={() => navigate(`/quiz/${quiz.id}`)}
                          >
                            {quiz.coverImageUrl ? (
                              <img src={quiz.coverImageUrl} alt="Quiz cover" className="w-full h-full object-cover" />
                            ) : (
                              <>
                                <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-white/10" />
                                <div className="absolute right-10 bottom-1 w-16 h-16 rounded-full bg-white/5" />
                              </>
                            )}
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                              <button
                                onClick={(e) => { e.stopPropagation(); handleHostLive(quiz.id); }}
                                className="p-3 bg-brand text-white rounded-full hover:scale-110 transition-transform shadow-lg"
                                title="Host Live"
                              >
                                <Play className="w-5 h-5" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); navigate(`/quiz/${quiz.id}`); }}
                                className="p-3 bg-white/10 text-white rounded-full hover:scale-110 transition-transform shadow-lg"
                                title="Edit"
                              >
                                <Pencil className="w-5 h-5" />
                              </button>
                            </div>
                          </div>
                          <div className="p-5 flex-1 flex flex-col">
                            <div className="flex justify-between items-start mb-2">
                              <h3
                                className="font-bold text-base leading-tight text-gray-900 dark:text-white group-hover:text-brand transition-colors line-clamp-1 cursor-pointer"
                                onClick={() => navigate(`/quiz/${quiz.id}`)}
                              >
                                {quiz.title || 'Untitled Quiz'}
                              </h3>
                              {renderMoreMenu(quiz)}
                            </div>
                            <div className="flex items-center gap-3 text-sm text-gray-400 dark:text-white/40 mb-5">
                              <span>{quiz.questionCount ?? '?'} Qs</span>
                              <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-white/20" />
                              <span>{formatDate(quiz.updatedAt)}</span>
                            </div>
                            <button
                              onClick={() => handleHostLive(quiz.id)}
                              className="mt-auto w-full py-2 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand/90 transition-colors"
                            >
                              Host Live
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Desktop: list view */}
                  {viewMode === 'list' && (
                    <div className="hidden sm:flex flex-col gap-2">
                      {group.quizzes.map((quiz) => (
                        <div
                          key={quiz.id}
                          className={`group flex items-center gap-4 p-3 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 hover:bg-gray-100 dark:hover:bg-white/[0.08] transition-colors cursor-pointer animate-fade-in ${menuOpenId === quiz.id ? 'z-50 relative' : 'z-0 relative'}`}
                          onClick={() => navigate(`/quiz/${quiz.id}`)}
                        >
                          <div className={`w-12 h-12 rounded-lg ${quiz.coverImageUrl ? '' : getCardGradient(quiz)} shrink-0 overflow-hidden relative`}>
                            {quiz.coverImageUrl ? (
                              <img src={quiz.coverImageUrl} alt="Quiz cover" className="w-full h-full object-cover" />
                            ) : (
                              <div className="absolute -right-2 -top-2 w-8 h-8 rounded-full bg-white/10" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-sm text-gray-900 dark:text-white truncate group-hover:text-brand transition-colors">
                              {quiz.title || 'Untitled Quiz'}
                            </h3>
                            {quiz.description && (
                              <p className="text-xs text-gray-400 dark:text-white/40 truncate mt-0.5 hidden lg:block">
                                {quiz.description}
                              </p>
                            )}
                          </div>
                          <span className="text-xs text-gray-400 dark:text-white/40 shrink-0 hidden md:block">
                            {quiz.questionCount ?? '?'} Qs
                          </span>
                          <span className="text-xs text-gray-400 dark:text-white/40 shrink-0 hidden lg:block">
                            {formatDate(quiz.updatedAt)}
                          </span>
                          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => handleHostLive(quiz.id)}
                              className="p-2 rounded-lg text-brand hover:bg-brand/10 transition-colors"
                              title="Host Live"
                            >
                              <Play className="w-4 h-4" />
                            </button>
                            {renderMoreMenu(quiz)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Desktop: table view */}
                  {viewMode === 'table' && (
                    <div className="hidden sm:block overflow-x-auto rounded-xl border border-gray-200 dark:border-white/10 animate-fade-in">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 dark:bg-white/5 border-b border-gray-200 dark:border-white/10">
                            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 dark:text-white/40 uppercase tracking-wider">Title</th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 dark:text-white/40 uppercase tracking-wider hidden md:table-cell">Questions</th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 dark:text-white/40 uppercase tracking-wider hidden lg:table-cell">Updated</th>
                            <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 dark:text-white/40 uppercase tracking-wider">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                          {group.quizzes.map((quiz) => (
                            <tr
                              key={quiz.id}
                              className={`group hover:bg-gray-50 dark:hover:bg-white/5 transition-colors cursor-pointer ${menuOpenId === quiz.id ? 'z-50 relative' : 'z-0 relative'}`}
                              onClick={() => navigate(`/quiz/${quiz.id}`)}
                            >
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                  <div className={`w-8 h-8 rounded-md ${quiz.coverImageUrl ? '' : getCardGradient(quiz)} shrink-0 overflow-hidden relative`}>
                                    {quiz.coverImageUrl ? (
                                      <img src={quiz.coverImageUrl} alt="Quiz cover" className="w-full h-full object-cover" />
                                    ) : (
                                      <div className="absolute -right-1.5 -top-1.5 w-5 h-5 rounded-full bg-white/10" />
                                    )}
                                  </div>
                                  <span className="font-semibold text-gray-900 dark:text-white truncate max-w-[200px] lg:max-w-[300px] group-hover:text-brand transition-colors">
                                    {quiz.title || 'Untitled Quiz'}
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-gray-400 dark:text-white/40 hidden md:table-cell">
                                {quiz.questionCount ?? '?'} Qs
                              </td>
                              <td className="px-4 py-3 text-gray-400 dark:text-white/40 hidden lg:table-cell">
                                {formatDate(quiz.updatedAt)}
                              </td>
                              <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    onClick={() => handleHostLive(quiz.id)}
                                    className="p-2 rounded-lg text-brand hover:bg-brand/10 transition-colors"
                                    title="Host Live"
                                  >
                                    <Play className="w-4 h-4" />
                                  </button>
                                  {renderMoreMenu(quiz)}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Mobile: simple list rows */}
                  <div className="sm:hidden space-y-2">
                    {group.quizzes.map((quiz) => (
                      <div
                        key={quiz.id}
                        onClick={() => navigate(`/quiz/${quiz.id}`)}
                        className={`flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 active:bg-gray-100 dark:active:bg-white/10 cursor-pointer ${menuOpenId === quiz.id ? 'z-50 relative' : 'z-0 relative'}`}
                      >
                        <div className={`w-10 h-10 rounded-lg ${quiz.coverImageUrl ? '' : getCardGradient(quiz)} shrink-0 overflow-hidden`}>
                          {quiz.coverImageUrl && <img src={quiz.coverImageUrl} alt="Quiz cover" className="w-full h-full object-cover" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-sm text-gray-900 dark:text-white truncate">
                            {quiz.title || 'Untitled Quiz'}
                          </h3>
                          <p className="text-xs text-gray-400 dark:text-white/40 mt-0.5">
                            {quiz.questionCount ?? '?'} Qs · {formatDate(quiz.updatedAt)}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => handleHostLive(quiz.id)}
                            className="p-2 rounded-lg text-brand hover:bg-brand/10 transition-colors"
                            title="Host Live"
                          >
                            <Play className="w-4 h-4" />
                          </button>
                          {renderMoreMenu(quiz)}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}

            {/* New Quiz placeholder — desktop only */}
            <div className="hidden sm:block">
              <button
                onClick={() => navigate('/quiz/new')}
                className="w-full max-w-[calc(25%-15px)] min-h-60 flex flex-col items-center justify-center border-2 border-dashed border-gray-300 dark:border-white/20 rounded-2xl hover:border-brand hover:bg-brand/5 transition-all group/create"
              >
                <div className="w-14 h-14 rounded-full bg-gray-50 dark:bg-white/5 flex items-center justify-center text-gray-300 dark:text-white/30 group-hover/create:bg-brand group-hover/create:text-white transition-all mb-4 hover-jelly">
                  <Plus className="w-7 h-7" />
                </div>
                <span className="font-bold text-gray-400 dark:text-white/40 group-hover/create:text-brand transition-colors text-sm">New Quiz</span>
              </button>
            </div>

            {/* New Quiz — mobile only */}
            <div className="sm:hidden">
              <button
                onClick={() => navigate('/quiz/new')}
                className="w-full p-3 flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 dark:border-white/20 rounded-xl hover:border-brand hover:bg-brand/5 transition-all text-gray-400 dark:text-white/40 hover:text-brand font-semibold text-sm"
              >
                <Plus className="w-4 h-4" /> New Quiz
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        {filtered.length > 0 && (
          <div className="mt-10 flex items-center justify-between py-5 border-t border-gray-200 dark:border-white/10">
            <p className="text-sm text-gray-400 dark:text-white/40">
              Showing {filtered.length} of {quizzes.length} quiz{quizzes.length !== 1 ? 'zes' : ''}
            </p>
          </div>
        )}

        {/* AI Quiz Modal */}
        <AiGenerateModal
          open={showAiQuizModal}
          onClose={() => setShowAiQuizModal(false)}
          generateMeta={true}
          onGenerated={handleAiQuizGenerated}
        />

        {/* Collection Modal */}
        {showCollModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowCollModal(false)} onKeyDown={(e) => { if (e.key === 'Escape') setShowCollModal(false); }}>
            <div role="dialog" aria-modal="true" aria-label={editingColl ? 'Edit Collection' : 'New Collection'} className="card-night w-full max-w-md animate-bounce-in" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between p-6 pb-0">
                <h3 className="text-lg text-gray-900 dark:text-white">{editingColl ? 'Edit Collection' : 'New Collection'}</h3>
                <button onClick={() => setShowCollModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-gray-400 dark:text-white/40 transition-colors">
                  <XIcon className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-500 dark:text-white/60 mb-1.5">Name</label>
                  <input
                    value={collName}
                    onChange={(e) => setCollName(e.target.value)}
                    placeholder="e.g. Biology"
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none text-gray-900 dark:text-white"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 dark:text-white/60 mb-1.5">Description</label>
                  <textarea
                    value={collDesc}
                    onChange={(e) => setCollDesc(e.target.value)}
                    placeholder="Optional description"
                    rows={2}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none text-gray-900 dark:text-white resize-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 dark:text-white/60 mb-1.5">Color</label>
                  <div className="flex gap-2">
                    {COLLECTION_COLORS.map((c) => (
                      <button
                        key={c.key}
                        onClick={() => setCollColor(c.key)}
                        className={`w-8 h-8 rounded-full ${c.bg} border border-gray-300 dark:border-white/20 transition-all ${collColor === c.key ? 'ring-2 ring-offset-2 ring-offset-surface-card ring-brand scale-110' : 'hover:scale-105'}`}
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
