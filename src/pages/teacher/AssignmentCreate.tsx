import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { collection, addDoc, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuthStore } from '../../stores/authStore';
import { useToastStore } from '../../stores/toastStore';
import { ArrowLeft } from 'lucide-react';
import type { Quiz } from '../../types/models';

export default function AssignmentCreate() {
  const { user } = useAuthStore();
  const { addToast } = useToastStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [classrooms, setClassrooms] = useState<{id: string; name: string}[]>([]);
  const [selectedQuizId, setSelectedQuizId] = useState('');
  const [selectedClassroomId, setSelectedClassroomId] = useState(searchParams.get('classroomId') || '');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [attemptsAllowed, setAttemptsAllowed] = useState(1);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    const loadData = async () => {
      const q = query(collection(db, 'quizzes'), where('ownerId', '==', user.id));
      setQuizzes((await getDocs(q)).docs.map((d) => ({ id: d.id, ...d.data() })) as Quiz[]);

      const classSnap = await getDocs(
        query(collection(db, 'classrooms'), where('ownerId', '==', user.id))
      );
      setClassrooms(classSnap.docs.map((d) => ({ id: d.id, name: d.data().name })));
    };
    loadData();
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
        classroomId: selectedClassroomId || null,
      });
      navigate('/dashboard');
    } catch {
      addToast('error', 'Failed to create assignment. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#E8EAF0] to-surface">
    <div className="max-w-2xl mx-auto px-4 py-8">
      <button onClick={() => navigate('/dashboard')} className="text-sm text-gray-400 hover:text-brand mb-4 flex items-center gap-1"><ArrowLeft className="w-3 h-3" /> Back</button>
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Create Assignment</h1>

      <form onSubmit={handleCreate} className="bg-white rounded-2xl border border-gray-200 shadow-[3px_3px_0px_0px_rgba(212,86,107,0.15)] p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Select Quiz</label>
          <select
            value={selectedQuizId}
            onChange={(e) => setSelectedQuizId(e.target.value)}
            required
            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none text-gray-900"
          >
            <option value="">-- Choose a quiz --</option>
            {quizzes.map((q) => (
              <option key={q.id} value={q.id}>{q.title}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Assign to Class (optional)</label>
          <select
            value={selectedClassroomId}
            onChange={(e) => setSelectedClassroomId(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none text-gray-900"
          >
            <option value="">All students (no class)</option>
            {classrooms.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
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
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none text-gray-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">End</label>
            <input
              type="datetime-local"
              value={endAt}
              onChange={(e) => setEndAt(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none text-gray-900"
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
            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none text-gray-900"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="w-full py-3 bg-brand text-white font-semibold rounded-xl shadow-[3px_3px_0px_0px_rgba(212,86,107,0.3)] hover:shadow-[5px_5px_0px_0px_rgba(212,86,107,0.35)] hover:translate-x-[-2px] hover:translate-y-[-2px] transition-all duration-200 disabled:opacity-50"
        >
          {saving ? 'Creating...' : 'Create Assignment'}
        </button>
      </form>
    </div>
    </div>
  );
}
