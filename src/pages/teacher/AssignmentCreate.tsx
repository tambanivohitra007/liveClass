import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuthStore } from '../../stores/authStore';
import type { Quiz } from '../../types/models';

export default function AssignmentCreate() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [selectedQuizId, setSelectedQuizId] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [attemptsAllowed, setAttemptsAllowed] = useState(1);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    const loadQuizzes = async () => {
      const q = query(collection(db, 'quizzes'), where('ownerId', '==', user.id));
      const snapshot = await getDocs(q);
      setQuizzes(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Quiz[]);
    };
    loadQuizzes();
  }, [user]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedQuizId) return;
    setSaving(true);

    try {
      await addDoc(collection(db, 'assignments'), {
        quizId: selectedQuizId,
        ownerId: user.id,
        startAt: new Date(startAt).getTime(),
        endAt: new Date(endAt).getTime(),
        attemptsAllowed,
        createdAt: serverTimestamp(),
      });
      navigate('/dashboard');
    } catch (err) {
      console.error('Failed to create assignment:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h1>Create Assignment</h1>
      <form onSubmit={handleCreate}>
        <div>
          <label>Select Quiz</label>
          <select value={selectedQuizId} onChange={(e) => setSelectedQuizId(e.target.value)} required>
            <option value="">-- Choose a quiz --</option>
            {quizzes.map((q) => (
              <option key={q.id} value={q.id}>{q.title}</option>
            ))}
          </select>
        </div>
        <div>
          <label>Start Date/Time</label>
          <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} required />
        </div>
        <div>
          <label>End Date/Time</label>
          <input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} required />
        </div>
        <div>
          <label>Attempts Allowed</label>
          <input type="number" min={1} value={attemptsAllowed} onChange={(e) => setAttemptsAllowed(parseInt(e.target.value) || 1)} />
        </div>
        <button type="submit" disabled={saving}>
          {saving ? 'Creating...' : 'Create Assignment'}
        </button>
      </form>
    </div>
  );
}
