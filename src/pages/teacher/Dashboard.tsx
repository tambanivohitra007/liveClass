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
    <div>
      <h1>Teacher Dashboard</h1>
      <button onClick={() => navigate('/quiz/new')}>Create New Quiz</button>
      <button onClick={() => navigate('/assignment/new')}>Create Assignment</button>
      <h2>My Quizzes</h2>
      {quizzes.length === 0 ? (
        <p>No quizzes yet. Create your first one!</p>
      ) : (
        <ul>
          {quizzes.map((quiz) => (
            <li key={quiz.id}>
              <span>{quiz.title}</span>
              <button onClick={() => navigate(`/quiz/${quiz.id}`)}>Edit</button>
              <button onClick={() => navigate(`/quiz/${quiz.id}/host`)}>Host Live</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
