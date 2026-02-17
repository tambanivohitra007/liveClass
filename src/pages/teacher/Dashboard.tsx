import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, doc, deleteDoc, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuthStore } from '../../stores/authStore';
import { useToastStore } from '../../stores/toastStore';
import { confirmDelete } from '../../lib/swal';
import { useNavigate } from 'react-router-dom';
import { SkeletonCard, SkeletonStats } from '../../components/Skeleton';
import { BookOpen, Trash2, Search, FileText, Users, HelpCircle, Play, Plus, ClipboardList, Eye } from 'lucide-react';
import type { Quiz } from '../../types/models';

interface QuizWithMeta extends Quiz {
  questionCount?: number;
}

export default function Dashboard() {
  const { user } = useAuthStore();
  const { addToast } = useToastStore();
  const [quizzes, setQuizzes] = useState<QuizWithMeta[]>([]);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [stats, setStats] = useState({ totalQuizzes: 0, totalQuestions: 0, totalSessions: 0 });
  const navigate = useNavigate();

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

  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, 'quizzes'), where('ownerId', '==', user.id));

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const quizzesData = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as QuizWithMeta[];

      // Fetch question counts for each quiz
      let totalQ = 0;
      const enriched = await Promise.all(
        quizzesData.map(async (quiz) => {
          const qSnap = await getDocs(query(collection(db, 'questions'), where('quizId', '==', quiz.id)));
          totalQ += qSnap.size;
          return { ...quiz, questionCount: qSnap.size };
        })
      );

      // Fetch session count
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
        <div className="text-center py-20">
          <div className="w-20 h-20 bg-brand/10 rounded-3xl flex items-center justify-center mx-auto mb-4">
            <BookOpen className="w-10 h-10 text-brand" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No quizzes yet</h3>
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
          <Search className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No quizzes match "{searchQuery}"</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger-children">
          {filtered.map((quiz) => (
            <div
              key={quiz.id}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-brand/10 transition-all group animate-fade-in"
            >
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
