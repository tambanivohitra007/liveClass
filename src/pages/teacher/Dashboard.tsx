import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, doc, deleteDoc, getDocs, addDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuthStore } from '../../stores/authStore';
import { useToastStore } from '../../stores/toastStore';
import { confirmDelete } from '../../lib/swal';
import { useNavigate } from 'react-router-dom';
import { SkeletonCard, SkeletonStats } from '../../components/Skeleton';
import { Trash2, Search, FileText, Users, HelpCircle, Play, Plus, ClipboardList, Eye, Copy, FolderOpen, X as XIcon } from 'lucide-react';
import { EmptyQuizzes, EmptySearch } from '../../components/EmptyStates';
import { COLLECTION_COLORS } from '../../types/models';
import type { Quiz, Collection, CollectionColor } from '../../types/models';

interface QuizWithMeta extends Quiz {
  questionCount?: number;
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

  const getQuizColorStrip = (quiz: QuizWithMeta) => {
    if (!quiz.collectionId) return 'bg-gray-200';
    const coll = collections.find((c) => c.id === quiz.collectionId);
    if (!coll) return 'bg-gray-200';
    const colorMeta = COLLECTION_COLORS.find((c) => c.key === coll.color);
    return colorMeta?.bg || 'bg-gray-200';
  };

  const filtered = quizzes.filter((q) =>
    q.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    q.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        <div className="h-8 w-48 bg-gray-200 rounded-lg animate-pulse" />
        <SkeletonStats />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome back, {user?.displayName?.split(' ')[0] || 'Teacher'}
          </h1>
          <p className="text-gray-500 mt-1">Create, manage, and host your quizzes</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => navigate('/assignment/new')}
            className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-medium hover:bg-gray-50 transition-colors flex items-center gap-2"
          >
            <ClipboardList className="w-4 h-4" />
            <span className="hidden sm:inline">Assignment</span>
          </button>
          <button
            onClick={() => navigate('/quiz/new')}
            className="px-5 py-2.5 bg-brand text-white font-semibold rounded-xl hover:bg-brand-dark transition-colors shadow-sm flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            New Quiz
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8 stagger-children">
        {[
          { icon: <FileText className="w-5 h-5" />, label: 'Quizzes', value: stats.totalQuizzes, color: 'text-brand bg-brand/10' },
          { icon: <HelpCircle className="w-5 h-5" />, label: 'Questions', value: stats.totalQuestions, color: 'text-accent-dark bg-accent/10' },
          { icon: <Users className="w-5 h-5" />, label: 'Sessions', value: stats.totalSessions, color: 'text-success bg-success/10' },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 animate-fade-in">
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-8 h-8 rounded-lg ${s.color} flex items-center justify-center`}>{s.icon}</div>
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">{s.label}</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Collections */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-gray-400" />
            Collections
          </h2>
          <button
            onClick={openNewCollModal}
            className="text-sm font-medium text-brand hover:text-brand-dark transition-colors flex items-center gap-1"
          >
            <Plus className="w-4 h-4" /> New Collection
          </button>
        </div>
        {collections.length === 0 ? (
          <p className="text-sm text-gray-400">No collections yet. Create one to organize your quizzes.</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 stagger-children">
            {collections.map((coll) => {
              const colorMeta = COLLECTION_COLORS.find((c) => c.key === coll.color) || COLLECTION_COLORS[0];
              return (
                <div
                  key={coll.id}
                  className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all cursor-pointer group animate-fade-in overflow-hidden"
                  onClick={() => navigate(`/collection/${coll.id}`)}
                >
                  <div className={`h-1.5 ${colorMeta.bg}`} />
                  <div className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-gray-900 group-hover:text-brand transition-colors line-clamp-1">{coll.name}</h3>
                        {coll.description && (
                          <p className="text-sm text-gray-400 line-clamp-1 mt-0.5">{coll.description}</p>
                        )}
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); openEditCollModal(coll); }}
                        className="p-1.5 rounded-lg text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors shrink-0 ml-2"
                        title="Edit collection"
                      >
                        <FileText className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <p className="text-xs text-gray-400 mt-2">
                      {getQuizCountForCollection(coll.id)} quiz{getQuizCountForCollection(coll.id) !== 1 ? 'zes' : ''}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Collection Modal */}
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

      {/* Search Bar */}
      {quizzes.length > 0 && (
        <div className="relative mb-6">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search your quizzes..."
            className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none transition-all text-gray-800 bg-white"
          />
        </div>
      )}

      {/* Quiz Grid */}
      {quizzes.length === 0 ? (
        <div className="text-center py-16">
          <EmptyQuizzes />
          <h3 className="text-lg font-semibold text-gray-900 mb-2 mt-4">No quizzes yet</h3>
          <p className="text-gray-500 mb-6">Create your first quiz to get started</p>
          <button
            onClick={() => navigate('/quiz/new')}
            className="px-6 py-3 bg-brand text-white font-semibold rounded-xl hover:bg-brand-dark transition-colors"
          >
            Create your first quiz
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <EmptySearch />
          <p className="text-gray-500 mt-4">No quizzes match "{searchQuery}"</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger-children">
          {filtered.map((quiz) => (
            <div
              key={quiz.id}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-brand/10 transition-all group animate-fade-in overflow-hidden"
            >
              <div className={`h-1.5 ${getQuizColorStrip(quiz)}`} />
              <div className="p-6">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-gray-900 group-hover:text-brand transition-colors line-clamp-1">
                    {quiz.title || 'Untitled Quiz'}
                  </h3>
                  <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full shrink-0 ml-2">
                    {quiz.visibility}
                  </span>
                </div>
                <p className="text-sm text-gray-400 line-clamp-2 mb-3">
                  {quiz.description || 'No description'}
                </p>
                <div className="flex items-center gap-3 text-xs text-gray-400">
                  <span className="flex items-center gap-1">
                    <HelpCircle className="w-3 h-3" />
                    {quiz.questionCount ?? '?'} question{quiz.questionCount !== 1 ? 's' : ''}
                  </span>
                </div>
                {/* Collection selector */}
                {collections.length > 0 && (
                  <div className="mt-3">
                    <select
                      value={quiz.collectionId || ''}
                      onChange={(e) => handleQuizCollectionChange(quiz.id, e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full text-xs px-2 py-1.5 rounded-lg border border-gray-200 text-gray-500 bg-gray-50 focus:ring-1 focus:ring-brand/20 focus:border-brand outline-none"
                    >
                      <option value="">Uncategorized</option>
                      {collections.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <div className="px-6 py-3 border-t border-gray-50 flex gap-2">
                <button
                  onClick={() => navigate(`/quiz/${quiz.id}`)}
                  className="flex-1 py-2 text-sm font-medium text-gray-600 hover:text-brand hover:bg-brand/5 rounded-lg transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => navigate(`/quiz/${quiz.id}/preview`)}
                  className="px-3 py-2 text-sm text-gray-400 hover:text-accent-dark hover:bg-accent/5 rounded-lg transition-colors"
                  title="Preview"
                >
                  <Eye className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDuplicate(quiz)}
                  className="px-3 py-2 text-sm text-gray-400 hover:text-info hover:bg-info/5 rounded-lg transition-colors"
                  title="Duplicate"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <button
                  onClick={() => navigate(`/quiz/${quiz.id}/host`)}
                  className="flex-1 py-2 text-sm font-medium text-white bg-brand hover:bg-brand-dark rounded-lg transition-colors flex items-center justify-center gap-1"
                >
                  <Play className="w-3 h-3" /> Host
                </button>
                <button
                  onClick={() => handleDelete(quiz.id, quiz.title)}
                  disabled={deleting === quiz.id}
                  className="px-3 py-2 text-sm text-gray-400 hover:text-danger hover:bg-danger/5 rounded-lg transition-colors disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
