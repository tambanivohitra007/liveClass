import { useEffect, useState } from 'react';
import { collection, query, where, getDocs, addDoc, orderBy, limit as fbLimit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthStore } from '../stores/authStore';
import { useToastStore } from '../stores/toastStore';
import { Search, Copy, HelpCircle, Globe } from 'lucide-react';
import type { Quiz } from '../types/models';

interface PublicQuiz extends Quiz {
  questionCount: number;
  ownerName?: string;
}

export default function Discover() {
  const { user } = useAuthStore();
  const { addToast } = useToastStore();
  const [quizzes, setQuizzes] = useState<PublicQuiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [cloning, setCloning] = useState<string | null>(null);

  useEffect(() => {
    const loadPublicQuizzes = async () => {
      const q = query(
        collection(db, 'quizzes'),
        where('visibility', '==', 'public'),
        orderBy('updatedAt', 'desc'),
        fbLimit(50)
      );
      const snapshot = await getDocs(q);
      const quizzesData = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as PublicQuiz[];

      const enriched = await Promise.all(
        quizzesData.map(async (quiz) => {
          const qSnap = await getDocs(query(collection(db, 'questions'), where('quizId', '==', quiz.id)));
          return { ...quiz, questionCount: qSnap.size };
        })
      );

      setQuizzes(enriched);
      setLoading(false);
    };
    loadPublicQuizzes();
  }, []);

  const handleClone = async (quiz: PublicQuiz) => {
    if (!user) {
      addToast('error', 'Please log in to clone quizzes');
      return;
    }
    setCloning(quiz.id);
    try {
      const newQuizRef = await addDoc(collection(db, 'quizzes'), {
        ownerId: user.id,
        title: `${quiz.title} (Clone)`,
        description: quiz.description,
        visibility: 'private',
        collectionId: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const questionsSnap = await getDocs(query(collection(db, 'questions'), where('quizId', '==', quiz.id)));
      await Promise.all(questionsSnap.docs.map((d) => {
        const qData = d.data();
        return addDoc(collection(db, 'questions'), { ...qData, quizId: newQuizRef.id });
      }));
      addToast('success', `"${quiz.title}" cloned to your library`);
    } catch {
      addToast('error', 'Failed to clone quiz');
    } finally {
      setCloning(null);
    }
  };

  const filtered = quizzes.filter((q) =>
    q.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    q.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-brand/10 text-brand rounded-full text-sm font-medium mb-4">
          <Globe className="w-4 h-4" />
          Public Library
        </div>
        <h1 className="text-3xl font-bold text-gray-900">Discover Quizzes</h1>
        <p className="text-gray-500 mt-2">Browse and clone public quizzes created by the community</p>
      </div>

      <div className="relative mb-8 max-w-md mx-auto">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search public quizzes..."
          className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none transition-all text-gray-800 bg-white"
        />
      </div>

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 p-6 animate-pulse">
              <div className="h-5 bg-gray-200 rounded w-3/4 mb-3" />
              <div className="h-4 bg-gray-100 rounded w-full mb-2" />
              <div className="h-4 bg-gray-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Globe className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">{searchQuery ? `No quizzes match "${searchQuery}"` : 'No public quizzes available yet'}</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger-children">
          {filtered.map((quiz) => (
            <div key={quiz.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all animate-fade-in overflow-hidden">
              <div className="h-1.5 bg-brand" />
              <div className="p-6">
                <h3 className="font-semibold text-gray-900 line-clamp-1 mb-1">{quiz.title}</h3>
                <p className="text-sm text-gray-400 line-clamp-2 mb-3">{quiz.description || 'No description'}</p>
                <div className="flex items-center gap-3 text-xs text-gray-400">
                  <span className="flex items-center gap-1">
                    <HelpCircle className="w-3 h-3" />
                    {quiz.questionCount} question{quiz.questionCount !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>
              <div className="px-6 py-3 border-t border-gray-50">
                <button
                  onClick={() => handleClone(quiz)}
                  disabled={cloning === quiz.id}
                  className="w-full py-2 text-sm font-medium text-brand hover:text-white hover:bg-brand rounded-lg transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <Copy className="w-3.5 h-3.5" />
                  {cloning === quiz.id ? 'Cloning...' : 'Clone to My Library'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
