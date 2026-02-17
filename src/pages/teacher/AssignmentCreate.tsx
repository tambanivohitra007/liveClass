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
      setQuizzes((await getDocs(q)).docs.map((d) => ({ id: d.id, ...d.data() })) as Quiz[]);
    };
    loadQuizzes();
  }, [user]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedQuizId) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'assignments'), {
        quizId: selectedQuizId, ownerId: user.id,
        startAt: new Date(startAt).getTime(), endAt: new Date(endAt).getTime(),
        attemptsAllowed, createdAt: serverTimestamp(),
      });
      navigate('/dashboard');
    } catch (err) {
      console.error('Failed to create assignment:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <button onClick={() => navigate('/dashboard')} className="text-sm text-gray-400 hover:text-brand mb-4 block">&larr; Back</button>
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Create Assignment</h1>

      <form onSubmit={handleCreate} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Select Quiz</label>
          <select
            value={selectedQuizId}
            onChange={(e) => setSelectedQuizId(e.target.value)}
            required
            className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand/30 focus:border-brand outline-none text-gray-900"
          >
            <option value="">-- Choose a quiz --</option>
            {quizzes.map((q) => (
              <option key={q.id} value={q.id}>{q.title}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Start</label>
            <input
              type="datetime-local"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand/30 focus:border-brand outline-none text-gray-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">End</label>
            <input
              type="datetime-local"
              value={endAt}
              onChange={(e) => setEndAt(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand/30 focus:border-brand outline-none text-gray-900"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Attempts Allowed</label>
          <input
            type="number"
            min={1}
            value={attemptsAllowed}
            onChange={(e) => setAttemptsAllowed(parseInt(e.target.value) || 1)}
            className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand/30 focus:border-brand outline-none text-gray-900"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="w-full py-3 bg-brand text-white font-semibold rounded-xl hover:bg-brand-dark transition-colors disabled:opacity-50"
        >
          {saving ? 'Creating...' : 'Create Assignment'}
        </button>
      </form>
    </div>
  );
}
