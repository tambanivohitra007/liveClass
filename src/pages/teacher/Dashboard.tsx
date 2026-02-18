import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, doc, deleteDoc, getDocs, addDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuthStore } from '../../stores/authStore';
import { useToastStore } from '../../stores/toastStore';
import { confirmDelete } from '../../lib/swal';
import { useNavigate } from 'react-router-dom';
import { SkeletonCard, SkeletonStats } from '../../components/Skeleton';
import {
  Trash2, Search, FileText, Users, HelpCircle, Play, Plus, ClipboardList,
  Eye, Copy, X as XIcon, BookOpen, MoreHorizontal, Pencil,
} from 'lucide-react';
import { EmptyQuizzes, EmptySearch } from '../../components/EmptyStates';
import { COLLECTION_COLORS } from '../../types/models';
import type { Quiz, Collection, CollectionColor } from '../../types/models';

interface QuizWithMeta extends Quiz {
  questionCount?: number;
}

const CARD_GRADIENTS: Record<string, string> = {
  brand: 'bg-gradient-to-br from-[#F06292] to-[#B94458]',
  accent: 'bg-gradient-to-br from-[#4DD0C8] to-[#1F9A8D]',
  success: 'bg-gradient-to-br from-[#34D399] to-[#059669]',
  warning: 'bg-gradient-to-br from-[#FBBF24] to-[#D97706]',
  info: 'bg-gradient-to-br from-[#60A5FA] to-[#2563EB]',
  purple: 'bg-gradient-to-br from-[#A78BFA] to-[#7C3AED]',
};
const DEFAULT_GRADIENT = 'bg-gradient-to-br from-[#94A3B8] to-[#64748B]';

function timeAgo(ts: number): string {
  if (!ts) return '';
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return 'Just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w ago`;
  return `${Math.floor(d / 30)}mo ago`;
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
  const navigate = useNavigate();

  // Collection modal state
  const [showCollModal, setShowCollModal] = useState(false);
  const [editingColl, setEditingColl] = useState<Collection | null>(null);
  const [collName, setCollName] = useState('');
  const [collDesc, setCollDesc] = useState('');
  const [collColor, setCollColor] = useState<CollectionColor>('brand');
  const [savingColl, setSavingColl] = useState(false);

  // New UI state
  const [selectedFilter, setSelectedFilter] = useState<string>('all');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

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

      let totalQ = 0;
      const enriched = await Promise.all(
        quizzesData.map(async (quiz) => {
          const qSnap = await getDocs(query(collection(db, 'questions'), where('quizId', '==', quiz.id)));
          totalQ += qSnap.size;
          return { ...quiz, questionCount: qSnap.size };
        })
      );

      const sessionsSnap = await getDocs(query(collection(db, 'sessions'), where('hostId', '==', user.id)));

      setQuizzes(enriched);
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

  const getQuizCountForCollection = (collId: string) =>
    quizzes.filter((q) => q.collectionId === collId).length;

  const getCardGradient = (quiz: QuizWithMeta): string => {
    if (!quiz.collectionId) return DEFAULT_GRADIENT;
    const coll = collections.find((c) => c.id === quiz.collectionId);
    if (!coll) return DEFAULT_GRADIENT;
    return CARD_GRADIENTS[coll.color] || DEFAULT_GRADIENT;
  };

  const getCollectionName = (quiz: QuizWithMeta): string | null => {
    if (!quiz.collectionId) return null;
    return collections.find((c) => c.id === quiz.collectionId)?.name || null;
  };

  const filtered = quizzes
    .filter((q) => selectedFilter === 'all' || q.collectionId === selectedFilter)
    .filter((q) =>
      q.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.description.toLowerCase().includes(searchQuery.toLowerCase())
    );

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        <div className="h-8 w-48 bg-gray-200 rounded-lg animate-pulse" />
        <SkeletonStats />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome back, {user?.displayName?.split(' ')[0] || 'Teacher'}
          </h1>
          <p className="text-gray-500 mt-1 text-sm">Create, manage, and host your quizzes</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => navigate('/assignment/new')}
            className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-medium hover:bg-gray-50 transition-colors flex items-center gap-2 text-sm"
          >
            <ClipboardList className="w-4 h-4" />
            <span className="hidden sm:inline">Assignment</span>
          </button>
          <button
            onClick={() => navigate('/quiz/new')}
            className="px-5 py-2.5 bg-brand text-white font-semibold rounded-xl hover:bg-brand-dark transition-colors shadow-lg shadow-brand/20 flex items-center gap-2 text-sm active:scale-95"
          >
            <Plus className="w-4 h-4" />
            Create New Quiz
          </button>
        </div>
      </div>

      {/* ── Stats Row ── */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { icon: <FileText className="w-4 h-4" />, label: 'Quizzes', value: stats.totalQuizzes, color: 'text-brand bg-brand/10' },
          { icon: <HelpCircle className="w-4 h-4" />, label: 'Questions', value: stats.totalQuestions, color: 'text-accent-dark bg-accent/10' },
          { icon: <Users className="w-4 h-4" />, label: 'Sessions', value: stats.totalSessions, color: 'text-success bg-success/10' },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3 animate-fade-in">
            <div className={`w-9 h-9 rounded-xl ${s.color} flex items-center justify-center shrink-0`}>{s.icon}</div>
            <div>
              <p className="text-xl font-bold text-gray-900">{s.value}</p>
              <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Search Bar ── */}
      <div className="relative mb-6 group">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-brand transition-colors" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search your library for quizzes, topics, or folders..."
          className="w-full pl-12 pr-4 py-3.5 bg-white rounded-xl border border-gray-200 focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none transition-all text-sm text-gray-800"
        />
      </div>

      {/* ── Filter Pills ── */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-8 no-scrollbar">
        <button
          onClick={() => setSelectedFilter('all')}
          className={`px-5 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all ${
            selectedFilter === 'all'
              ? 'bg-brand text-white shadow-sm'
              : 'bg-white border border-gray-200 text-gray-600 hover:border-brand/40'
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
                className={`px-5 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-brand text-white shadow-sm'
                    : 'bg-white border border-gray-200 text-gray-600 hover:border-brand/40'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${colorMeta?.bg || 'bg-gray-300'} ${isActive ? 'opacity-80' : ''}`} />
                {coll.name}
                <span className={`text-xs ${isActive ? 'text-white/70' : 'text-gray-400'}`}>
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
          <div className="h-6 w-px bg-gray-200 mx-1 shrink-0" />
        )}
        <button
          onClick={openNewCollModal}
          className="px-4 py-2 rounded-full border-2 border-dashed border-gray-300 text-gray-400 text-sm font-medium hover:border-brand hover:text-brand transition-colors whitespace-nowrap flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" /> Collection
        </button>
      </div>

      {/* ── Quiz Grid ── */}
      {quizzes.length === 0 ? (
        <div className="text-center py-20">
          <EmptyQuizzes />
          <h3 className="text-lg font-semibold text-gray-900 mb-2 mt-4">No quizzes yet</h3>
          <p className="text-gray-500 mb-6 text-sm">Create your first quiz to get started</p>
          <button
            onClick={() => navigate('/quiz/new')}
            className="px-6 py-3 bg-brand text-white font-semibold rounded-xl hover:bg-brand-dark transition-colors shadow-lg shadow-brand/20"
          >
            Create your first quiz
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <EmptySearch />
          <p className="text-gray-500 mt-4 text-sm">No quizzes match "{searchQuery || collections.find(c => c.id === selectedFilter)?.name}"</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 stagger-children">
          {filtered.map((quiz) => {
            const collName = getCollectionName(quiz);
            return (
              <div
                key={quiz.id}
                className="group bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm hover:shadow-xl hover:shadow-brand/5 transition-all flex flex-col animate-fade-in"
              >
                {/* Gradient Banner */}
                <div className={`h-32 ${getCardGradient(quiz)} relative overflow-hidden`}>
                  {/* Decorative shapes */}
                  <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-white/10" />
                  <div className="absolute right-10 bottom-1 w-16 h-16 rounded-full bg-white/5" />
                  <div className="absolute left-1/2 -top-8 w-32 h-32 rounded-full bg-white/5" />

                  {/* Collection badge */}
                  {collName && (
                    <div className="absolute top-3 left-3 px-2.5 py-1 bg-black/40 backdrop-blur-sm rounded-lg text-[10px] font-bold text-white uppercase tracking-wider">
                      {collName}
                    </div>
                  )}

                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                    <button
                      onClick={() => navigate(`/quiz/${quiz.id}/host`)}
                      className="p-3 bg-white text-brand rounded-full hover:scale-110 transition-transform shadow-lg"
                      title="Host Live"
                    >
                      <Play className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => navigate(`/quiz/${quiz.id}`)}
                      className="p-3 bg-white text-gray-700 rounded-full hover:scale-110 transition-transform shadow-lg"
                      title="Edit"
                    >
                      <Pencil className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-5 flex-1 flex flex-col">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-base leading-tight group-hover:text-brand transition-colors line-clamp-1">
                      {quiz.title || 'Untitled Quiz'}
                    </h3>
                    {/* More menu */}
                    <div className="relative">
                      <button
                        onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === quiz.id ? null : quiz.id); }}
                        className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                      >
                        <MoreHorizontal className="w-5 h-5" />
                      </button>
                      {menuOpenId === quiz.id && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setMenuOpenId(null)} />
                          <div className="absolute right-0 top-full mt-1 w-52 bg-white rounded-xl shadow-xl border border-gray-100 z-20 py-1.5 animate-fade-in">
                            <button
                              onClick={() => { navigate(`/quiz/${quiz.id}/preview`); setMenuOpenId(null); }}
                              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                            >
                              <Eye className="w-4 h-4 text-gray-400" /> Preview
                            </button>
                            <button
                              onClick={() => { handleDuplicate(quiz); setMenuOpenId(null); }}
                              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                            >
                              <Copy className="w-4 h-4 text-gray-400" /> Duplicate
                            </button>
                            <button
                              onClick={() => { navigate(`/quiz/${quiz.id}/flashcards`); setMenuOpenId(null); }}
                              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                            >
                              <BookOpen className="w-4 h-4 text-gray-400" /> Flashcards
                            </button>
                            {collections.length > 0 && (
                              <>
                                <hr className="my-1.5 border-gray-100" />
                                <div className="px-4 py-2">
                                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Move to</p>
                                  <select
                                    value={quiz.collectionId || ''}
                                    onChange={(e) => { handleQuizCollectionChange(quiz.id, e.target.value); setMenuOpenId(null); }}
                                    className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 bg-gray-50 outline-none"
                                  >
                                    <option value="">Uncategorized</option>
                                    {collections.map((c) => (
                                      <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                  </select>
                                </div>
                              </>
                            )}
                            <hr className="my-1.5 border-gray-100" />
                            <button
                              onClick={() => { handleDelete(quiz.id, quiz.title); setMenuOpenId(null); }}
                              disabled={deleting === quiz.id}
                              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-danger hover:bg-danger/5 transition-colors disabled:opacity-50"
                            >
                              <Trash2 className="w-4 h-4" /> Delete
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Metadata */}
                  <div className="flex items-center gap-3 text-sm text-gray-500 mb-5">
                    <span className="flex items-center gap-1">
                      <HelpCircle className="w-3.5 h-3.5" />
                      {quiz.questionCount ?? '?'} Qs
                    </span>
                    <span className="w-1 h-1 rounded-full bg-gray-300" />
                    <span>{timeAgo(quiz.updatedAt)}</span>
                  </div>

                  {/* Host button */}
                  <button
                    onClick={() => navigate(`/quiz/${quiz.id}/host`)}
                    className="w-full py-2.5 bg-brand text-white rounded-xl font-bold text-sm hover:bg-brand-dark transition-colors mt-auto"
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
            className="min-h-[280px] flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-2xl hover:border-brand hover:bg-brand/5 transition-all group/create"
          >
            <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 group-hover/create:bg-brand group-hover/create:text-white transition-all mb-4">
              <Plus className="w-7 h-7" />
            </div>
            <span className="font-bold text-gray-500 group-hover/create:text-brand transition-colors">New Quiz</span>
          </button>
        </div>
      )}

      {/* ── Footer ── */}
      {filtered.length > 0 && (
        <div className="mt-10 flex items-center justify-between py-5 border-t border-gray-200">
          <p className="text-sm text-gray-500">
            Showing {filtered.length} of {quizzes.length} quiz{quizzes.length !== 1 ? 'zes' : ''}
          </p>
        </div>
      )}

      {/* ── Collection Modal ── */}
      {showCollModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowCollModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 pb-0">
              <h3 className="text-lg font-bold text-gray-900">{editingColl ? 'Edit Collection' : 'New Collection'}</h3>
              <button onClick={() => setShowCollModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Name</label>
                <input
                  value={collName}
                  onChange={(e) => setCollName(e.target.value)}
                  placeholder="e.g. Biology"
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand/30 focus:border-brand outline-none text-gray-900"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
                <textarea
                  value={collDesc}
                  onChange={(e) => setCollDesc(e.target.value)}
                  placeholder="Optional description"
                  rows={2}
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand/30 focus:border-brand outline-none text-gray-900 resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Color</label>
                <div className="flex gap-2">
                  {COLLECTION_COLORS.map((c) => (
                    <button
                      key={c.key}
                      onClick={() => setCollColor(c.key)}
                      className={`w-8 h-8 rounded-full ${c.bg} transition-all ${collColor === c.key ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : 'hover:scale-105'}`}
                      title={c.label}
                    />
                  ))}
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleSaveColl}
                  disabled={savingColl || !collName.trim()}
                  className="flex-1 py-2.5 bg-brand text-white font-semibold rounded-xl hover:bg-brand-dark transition-colors disabled:opacity-50"
                >
                  {savingColl ? 'Saving...' : editingColl ? 'Update' : 'Create'}
                </button>
                <button
                  onClick={() => setShowCollModal(false)}
                  className="px-5 py-2.5 border border-gray-200 text-gray-600 font-medium rounded-xl hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
