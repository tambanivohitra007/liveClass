import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc, deleteDoc, collection, query, where, onSnapshot, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuthStore } from '../../stores/authStore';
import { useToastStore } from '../../stores/toastStore';
import { confirmDelete } from '../../lib/swal';
import { SkeletonCard } from '../../components/Skeleton';
import { Pencil, Trash2, X as XIcon, Play, Eye, HelpCircle } from 'lucide-react';
import BackButton from '../../components/BackButton';
import { EmptyCollection } from '../../components/EmptyStates';
import { COLLECTION_COLORS } from '../../types/models';
import type { Collection, Quiz, CollectionColor } from '../../types/models';

interface QuizWithMeta extends Quiz {
  questionCount?: number;
}

export default function CollectionView() {
  const { collectionId } = useParams<{ collectionId: string }>();
  const { user } = useAuthStore();
  const { addToast } = useToastStore();
  const navigate = useNavigate();

  const [coll, setColl] = useState<Collection | null>(null);
  const [quizzes, setQuizzes] = useState<QuizWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editColor, setEditColor] = useState<CollectionColor>('brand');
  const [saving, setSaving] = useState(false);

  // Fetch collection doc
  useEffect(() => {
    if (!collectionId) return;
    const fetchCollection = async () => {
      const snap = await getDoc(doc(db, 'collections', collectionId));
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() } as Collection;
        setColl(data);
        setEditName(data.name);
        setEditDesc(data.description);
        setEditColor(data.color);
      }
    };
    fetchCollection();
  }, [collectionId]);

  // Real-time quizzes in this collection
  useEffect(() => {
    if (!collectionId || !user) return;
    const q = query(
      collection(db, 'quizzes'),
      where('collectionId', '==', collectionId),
      where('ownerId', '==', user.id)
    );
    const unsub = onSnapshot(q, async (snapshot) => {
      const quizzesData = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as QuizWithMeta[];
      const enriched = await Promise.all(
        quizzesData.map(async (quiz) => {
          const qSnap = await getDocs(query(collection(db, 'questions'), where('quizId', '==', quiz.id)));
          return { ...quiz, questionCount: qSnap.size };
        })
      );
      setQuizzes(enriched);
      setLoading(false);
    });
    return unsub;
  }, [collectionId, user]);

  const handleSaveEdit = async () => {
    if (!collectionId || !editName.trim()) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'collections', collectionId), {
        name: editName.trim(),
        description: editDesc.trim(),
        color: editColor,
        updatedAt: Date.now(),
      });
      setColl((prev) => prev ? { ...prev, name: editName.trim(), description: editDesc.trim(), color: editColor } : prev);
      setEditing(false);
      addToast('success', 'Collection updated');
    } catch {
      addToast('error', 'Failed to update collection');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCollection = async () => {
    if (!collectionId || !coll) return;
    const { isConfirmed } = await confirmDelete(coll.name);
    if (!isConfirmed) return;
    try {
      // Remove collectionId from all quizzes in this collection
      for (const quiz of quizzes) {
        await updateDoc(doc(db, 'quizzes', quiz.id), { collectionId: null });
      }
      await deleteDoc(doc(db, 'collections', collectionId));
      addToast('success', `"${coll.name}" deleted. Quizzes moved to Uncategorized.`);
      navigate('/dashboard');
    } catch {
      addToast('error', 'Failed to delete collection');
    }
  };

  const handleRemoveQuiz = async (quizId: string) => {
    try {
      await updateDoc(doc(db, 'quizzes', quizId), { collectionId: null });
      addToast('success', 'Quiz removed from collection');
    } catch {
      addToast('error', 'Failed to remove quiz');
    }
  };

  const colorMeta = COLLECTION_COLORS.find((c) => c.key === (coll?.color || 'brand')) || COLLECTION_COLORS[0];

  if (loading || !coll) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <div className="h-8 w-48 bg-gray-200 rounded-lg animate-pulse" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Back button */}
      <div className="mb-6">
        <BackButton to="/dashboard" label="Back to Dashboard" />
      </div>

      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-8 animate-fade-in">
        <div className={`h-2 ${colorMeta.bg}`} />
        {editing ? (
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Name</label>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand/30 focus:border-brand outline-none text-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
              <textarea
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
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
                    onClick={() => setEditColor(c.key)}
                    className={`w-8 h-8 rounded-full ${c.bg} transition-all ${editColor === c.key ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : 'hover:scale-105'}`}
                    title={c.label}
                  />
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSaveEdit}
                disabled={saving || !editName.trim()}
                className="px-5 py-2.5 bg-brand text-white font-semibold rounded-xl hover:bg-brand-dark transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={() => { setEditing(false); setEditName(coll.name); setEditDesc(coll.description); setEditColor(coll.color); }}
                className="px-5 py-2.5 border border-gray-200 text-gray-600 font-medium rounded-xl hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="p-6 flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-1">{coll.name}</h1>
              {coll.description && <p className="text-gray-500">{coll.description}</p>}
              <p className="text-sm text-gray-400 mt-2">{quizzes.length} quiz{quizzes.length !== 1 ? 'zes' : ''}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setEditing(true)}
                className="p-2.5 rounded-xl border border-gray-200 text-gray-500 hover:text-brand hover:border-brand/20 transition-colors"
                title="Edit"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                onClick={handleDeleteCollection}
                className="p-2.5 rounded-xl border border-gray-200 text-gray-500 hover:text-danger hover:border-danger/20 transition-colors"
                title="Delete collection"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Quiz Grid */}
      {quizzes.length === 0 ? (
        <div className="text-center py-16">
          <EmptyCollection />
          <p className="text-gray-400 mt-4">No quizzes in this collection yet.</p>
          <p className="text-sm text-gray-400 mt-1">Assign quizzes from the Dashboard or Quiz Editor.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger-children">
          {quizzes.map((quiz) => (
            <div
              key={quiz.id}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-brand/10 transition-all group animate-fade-in"
            >
              <div className="p-6">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-gray-900 group-hover:text-brand transition-colors line-clamp-1">
                    {quiz.title || 'Untitled Quiz'}
                  </h3>
                  <button
                    onClick={() => handleRemoveQuiz(quiz.id)}
                    className="p-1 rounded-lg text-gray-300 hover:text-danger hover:bg-danger/5 transition-colors shrink-0 ml-2"
                    title="Remove from collection"
                  >
                    <XIcon className="w-4 h-4" />
                  </button>
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
                  onClick={() => navigate(`/quiz/${quiz.id}/host`)}
                  className="flex-1 py-2 text-sm font-medium text-white bg-brand hover:bg-brand-dark rounded-lg transition-colors flex items-center justify-center gap-1"
                >
                  <Play className="w-3 h-3" /> Host
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
