import { useEffect, useState } from 'react';
import { collection, query, where, getDocs, addDoc, orderBy, limit as fbLimit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthStore } from '../stores/authStore';
import { useToastStore } from '../stores/toastStore';
import { Search, Copy, HelpCircle, Globe } from 'lucide-react';
import WaveBackground from '../components/ui/WaveBackground';
import type { Quiz } from '../types/models';
import boy3 from '../assets/optimized/boy_3.png';
import boy4 from '../assets/optimized/boy_4.png';

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
  const [error, setError] = useState('');

  useEffect(() => {
    const loadPublicQuizzes = async () => {
      try {
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
            try {
              const qSnap = await getDocs(query(collection(db, 'questions'), where('quizId', '==', quiz.id)));
              return { ...quiz, questionCount: qSnap.size };
            } catch {
              return { ...quiz, questionCount: 0 };
            }
          })
        );

        setQuizzes(enriched);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to load quizzes';
        setError(msg);
        addToast('error', 'Failed to load public quizzes');
      } finally {
        setLoading(false);
      }
    };
    loadPublicQuizzes();
  }, [addToast]);

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
    <div className="relative min-h-screen bg-linear-to-b from-[#E8EAF0] to-surface dark:from-surface-dark dark:to-surface-dark overflow-hidden">
      <WaveBackground variant="light" position="bottom" />

      <div className="relative z-10 max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-5 py-2 bg-white dark:bg-white/10 text-brand rounded-full text-sm font-bold border-2 border-gray-200 dark:border-white/20 shadow-sm mb-5">
            <Globe className="w-4 h-4" />
            Public Library
          </div>
          <h1 className="text-4xl font-black text-gray-900 dark:text-white">Discover Quizzes</h1>
          <p className="text-gray-500 dark:text-white/50 mt-2 font-medium">Browse and clone public quizzes created by the community</p>
          <div className="mt-5 flex items-center justify-center gap-4">
            {[boy3, boy4].map((photo, index) => (
              <div key={photo} className="card-night px-3 py-2 flex items-center gap-3">
                <img
                  src={photo}
                  alt={`Learner showcase ${index + 1}`}
                  className="w-11 h-11 rounded-xl object-cover border border-gray-200 dark:border-white/20 opacity-75 dark:opacity-60 mix-blend-multiply dark:mix-blend-screen"
                />
                <span className="text-xs font-semibold text-gray-500 dark:text-white/60">Community favorite</span>
              </div>
            ))}
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-10 max-w-lg mx-auto group">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-white/40 group-focus-within:text-brand transition-colors" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search public quizzes..."
            className="w-full pl-12 pr-4 py-3.5 rounded-2xl border border-gray-200 dark:border-white/10 focus:border-brand focus:ring-4 focus:ring-brand/20 outline-none transition-all text-gray-800 dark:text-white bg-white dark:bg-white/5 font-medium"
          />
        </div>

        {/* Content */}
        {error ? (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full border border-danger/20 bg-danger/10 shadow-sm mb-5">
              <Globe className="w-7 h-7 text-danger" />
            </div>
            <p className="text-gray-500 dark:text-white/50 mb-4 font-medium">Something went wrong loading quizzes.</p>
            <button
              onClick={() => window.location.reload()}
              className="btn-3d-gold btn-3d-sm"
            >
              Try again
            </button>
          </div>
        ) : loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white dark:bg-white/5 rounded-2xl border-2 border-gray-200 dark:border-white/10 p-6 animate-pulse">
                <div className="h-5 bg-gray-200 dark:bg-white/15 rounded-lg w-3/4 mb-3" />
                <div className="h-4 bg-gray-100 dark:bg-white/10 rounded-lg w-full mb-2" />
                <div className="h-4 bg-gray-100 dark:bg-white/10 rounded-lg w-1/2 mb-4" />
                <div className="h-9 bg-gray-100 dark:bg-white/10 rounded-xl w-full" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/10 shadow-sm mb-5">
              <Globe className="w-7 h-7 text-gray-400 dark:text-white/40" />
            </div>
            <p className="text-gray-500 dark:text-white/50 font-medium">
              {searchQuery ? `No quizzes match "${searchQuery}"` : 'No public quizzes available yet'}
            </p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 stagger-children">
            {filtered.map((quiz) => (
              <div
                key={quiz.id}
                className="group card-night card-night-hover animate-fade-in overflow-hidden flex flex-col"
              >
                {/* Color accent bar */}
                <div className="h-1.5" />

                {/* Body */}
                <div className="p-6 flex-1">
                  <h3 className="font-bold text-gray-900 dark:text-white line-clamp-1 mb-1.5">{quiz.title}</h3>
                  <p className="text-sm text-gray-500 dark:text-white/50 line-clamp-2 mb-4">{quiz.description || 'No description'}</p>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-gray-400 dark:text-white/40">
                    <HelpCircle className="w-3.5 h-3.5" />
                    {quiz.questionCount} question{quiz.questionCount !== 1 ? 's' : ''}
                  </div>
                </div>

                {/* Clone action */}
                <div className="px-6 py-4 border-t-2 border-gray-100 dark:border-white/10">
                  <button
                    onClick={() => handleClone(quiz)}
                    disabled={cloning === quiz.id}
                    className="btn-3d-gold btn-3d-sm w-full flex items-center justify-center gap-2 disabled:opacity-50"
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
    </div>
  );
}
