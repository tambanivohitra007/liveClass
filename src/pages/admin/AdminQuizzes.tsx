import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, doc, deleteDoc, updateDoc, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useToastStore } from '../../stores/toastStore';
import { confirmDelete, confirmAction } from '../../lib/swal';
import { Search, Trash2, ArrowRightLeft, ExternalLink, Eye, EyeOff, FileText, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Quiz, User } from '../../types/models';

export default function AdminQuizzes() {
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [transferQuizId, setTransferQuizId] = useState<string | null>(null);
  const [transferTargetId, setTransferTargetId] = useState('');
  const { addToast } = useToastStore();
  const navigate = useNavigate();

  // Fetch all quizzes
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'quizzes'), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Quiz));
      setQuizzes(list);
      setLoading(false);
    });
    return unsub;
  }, []);

  // Fetch all users
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as User));
      setUsers(list);
    });
    return unsub;
  }, []);

  const userMap = useMemo(() => {
    const map: Record<string, User> = {};
    for (const u of users) map[u.id] = u;
    return map;
  }, [users]);

  const approvedTeachers = useMemo(
    () => users.filter((u) => u.role === 'teacher' && u.approvalStatus === 'approved'),
    [users],
  );

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return quizzes;
    const q = searchQuery.toLowerCase();
    return quizzes.filter((quiz) => {
      const owner = userMap[quiz.ownerId];
      return (
        quiz.title.toLowerCase().includes(q) ||
        owner?.displayName.toLowerCase().includes(q) ||
        owner?.email.toLowerCase().includes(q)
      );
    });
  }, [quizzes, searchQuery, userMap]);

  const stats = useMemo(() => ({
    total: quizzes.length,
    public: quizzes.filter((q) => q.visibility === 'public').length,
    private: quizzes.filter((q) => q.visibility === 'private').length,
  }), [quizzes]);

  const handleDelete = async (quiz: Quiz) => {
    const { isConfirmed } = await confirmDelete(quiz.title || 'Untitled Quiz');
    if (!isConfirmed) return;
    setDeleting(quiz.id);
    try {
      const questionsSnap = await getDocs(query(collection(db, 'questions'), where('quizId', '==', quiz.id)));
      await Promise.all(questionsSnap.docs.map((d) => deleteDoc(d.ref)));
      await deleteDoc(doc(db, 'quizzes', quiz.id));
      addToast('success', `"${quiz.title}" deleted successfully`);
    } catch {
      addToast('error', 'Failed to delete quiz.');
    } finally {
      setDeleting(null);
    }
  };

  const handleTransfer = async () => {
    if (!transferQuizId || !transferTargetId) return;
    const quiz = quizzes.find((q) => q.id === transferQuizId);
    const target = userMap[transferTargetId];
    if (!quiz || !target) return;

    const { isConfirmed } = await confirmAction(
      'Transfer Quiz',
      `Transfer "${quiz.title}" to ${target.displayName}?`,
      'Yes, transfer',
    );
    if (!isConfirmed) return;

    try {
      await updateDoc(doc(db, 'quizzes', transferQuizId), { ownerId: transferTargetId });
      addToast('success', `Quiz transferred to ${target.displayName}`);
      setTransferQuizId(null);
      setTransferTargetId('');
    } catch {
      addToast('error', 'Failed to transfer quiz.');
    }
  };

  return (
    <div>
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <div className="bg-white dark:bg-white/5 rounded-xl border border-gray-100 dark:border-white/10 px-4 py-3 text-center">
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
          <p className="text-xs text-gray-500 dark:text-white/50">Total Quizzes</p>
        </div>
        <div className="bg-white dark:bg-white/5 rounded-xl border border-gray-100 dark:border-white/10 px-4 py-3 text-center">
          <p className="text-2xl font-bold text-success">{stats.public}</p>
          <p className="text-xs text-gray-500 dark:text-white/50">Public</p>
        </div>
        <div className="bg-white dark:bg-white/5 rounded-xl border border-gray-100 dark:border-white/10 px-4 py-3 text-center">
          <p className="text-2xl font-bold text-gray-400 dark:text-white/40">{stats.private}</p>
          <p className="text-xs text-gray-500 dark:text-white/50">Private</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-white/40" />
        <input
          type="text"
          placeholder="Search by title or owner..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-brand/30 border-t-brand rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/10">
          <FileText className="w-10 h-10 text-gray-300 dark:text-white/30 mx-auto mb-3" />
          <p className="text-gray-400 dark:text-white/40">
            {searchQuery ? 'No quizzes match your search' : 'No quizzes found'}
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/10 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 dark:border-white/10">
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 dark:text-white/40 uppercase tracking-wider">Title</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 dark:text-white/40 uppercase tracking-wider hidden md:table-cell">Owner</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 dark:text-white/40 uppercase tracking-wider hidden sm:table-cell">Visibility</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 dark:text-white/40 uppercase tracking-wider hidden lg:table-cell">Updated</th>
                  <th className="text-right px-5 py-3 text-xs font-medium text-gray-400 dark:text-white/40 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-white/10">
                {filtered.map((quiz) => {
                  const owner = userMap[quiz.ownerId];
                  return (
                    <tr key={quiz.id} className="hover:bg-gray-50/50 dark:hover:bg-white/5 transition-colors">
                      <td className="px-5 py-4">
                        <p className="font-medium text-gray-900 dark:text-white text-sm">{quiz.title || 'Untitled Quiz'}</p>
                        <p className="text-xs text-gray-400 dark:text-white/40 md:hidden">
                          {owner?.displayName || 'Unknown'}
                        </p>
                      </td>
                      <td className="px-5 py-4 hidden md:table-cell">
                        <p className="text-sm text-gray-900 dark:text-white">{owner?.displayName || 'Unknown'}</p>
                        <p className="text-xs text-gray-400 dark:text-white/40">{owner?.email || ''}</p>
                      </td>
                      <td className="px-5 py-4 hidden sm:table-cell">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                          quiz.visibility === 'public'
                            ? 'bg-success/10 text-success'
                            : 'bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-white/50'
                        }`}>
                          {quiz.visibility === 'public' ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                          {quiz.visibility}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm text-gray-500 dark:text-white/50 hidden lg:table-cell">
                        {quiz.updatedAt ? new Date(quiz.updatedAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => navigate(`/quiz/${quiz.id}`)}
                            className="p-2 rounded-lg text-gray-400 dark:text-white/40 hover:bg-gray-100 dark:hover:bg-white/10 hover:text-brand transition-colors"
                            title="Edit quiz"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => { setTransferQuizId(quiz.id); setTransferTargetId(''); }}
                            className="p-2 rounded-lg text-gray-400 dark:text-white/40 hover:bg-gray-100 dark:hover:bg-white/10 hover:text-warning transition-colors"
                            title="Transfer ownership"
                          >
                            <ArrowRightLeft className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(quiz)}
                            disabled={deleting === quiz.id}
                            className="p-2 rounded-lg text-gray-400 dark:text-white/40 hover:bg-danger/10 hover:text-danger transition-colors disabled:opacity-50"
                            title="Delete quiz"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Transfer Modal */}
      {transferQuizId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-[#162033] rounded-2xl border border-gray-200 dark:border-white/10 shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Transfer Quiz</h3>
              <button
                onClick={() => { setTransferQuizId(null); setTransferTargetId(''); }}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4 text-gray-400 dark:text-white/40" />
              </button>
            </div>
            <p className="text-sm text-gray-500 dark:text-white/50 mb-4">
              Transfer "{quizzes.find((q) => q.id === transferQuizId)?.title}" to a new owner:
            </p>
            <select
              value={transferTargetId}
              onChange={(e) => setTransferTargetId(e.target.value)}
              className="w-full px-3 py-2.5 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand/30 mb-4 [&>option]:bg-white [&>option]:dark:bg-[#162033] [&>option]:text-gray-900 [&>option]:dark:text-white"
            >
              <option value="">Select a teacher...</option>
              {approvedTeachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.displayName} ({t.email})
                </option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setTransferQuizId(null); setTransferTargetId(''); }}
                className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 dark:text-white/70 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleTransfer}
                disabled={!transferTargetId}
                className="px-4 py-2 rounded-xl text-sm font-medium bg-brand text-white hover:bg-brand/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Transfer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
