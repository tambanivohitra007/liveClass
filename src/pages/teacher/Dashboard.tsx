import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuthStore } from '../../stores/authStore';
import { useNavigate } from 'react-router-dom';
import type { Quiz } from '../../types/models';

export default function Dashboard() {
  const { user } = useAuthStore();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'quizzes'),
      where('ownerId', '==', user.id)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Quiz[];
      setQuizzes(data);
    });

    return unsubscribe;
  }, [user]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Quizzes</h1>
          <p className="text-gray-500 mt-1">Create, manage, and host your quizzes</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => navigate('/assignment/new')}
            className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-medium hover:bg-gray-50 transition-colors"
          >
            Create Assignment
          </button>
          <button
            onClick={() => navigate('/quiz/new')}
            className="px-5 py-2.5 bg-brand text-white font-semibold rounded-xl hover:bg-brand-dark transition-colors shadow-sm"
          >
            + New Quiz
          </button>
        </div>
      </div>

      {/* Quiz Grid */}
      {quizzes.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-20 h-20 bg-brand/10 rounded-3xl flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">&#128218;</span>
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
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {quizzes.map((quiz) => (
            <div
              key={quiz.id}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all group"
            >
              <div className="p-6">
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-semibold text-gray-900 group-hover:text-brand transition-colors line-clamp-1">
                    {quiz.title || 'Untitled Quiz'}
                  </h3>
                  <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full shrink-0 ml-2">
                    {quiz.visibility}
                  </span>
                </div>
                <p className="text-sm text-gray-400 line-clamp-2 mb-4">
                  {quiz.description || 'No description'}
                </p>
              </div>
              <div className="px-6 py-3 border-t border-gray-50 flex gap-2">
                <button
                  onClick={() => navigate(`/quiz/${quiz.id}`)}
                  className="flex-1 py-2 text-sm font-medium text-gray-600 hover:text-brand hover:bg-brand/5 rounded-lg transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => navigate(`/quiz/${quiz.id}/host`)}
                  className="flex-1 py-2 text-sm font-medium text-white bg-brand hover:bg-brand-dark rounded-lg transition-colors"
                >
                  Host Live
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
