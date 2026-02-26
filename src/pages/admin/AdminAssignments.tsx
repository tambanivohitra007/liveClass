import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useToastStore } from '../../stores/toastStore';
import { confirmDelete, confirmAction } from '../../lib/swal';
import { Search, Trash2, Clock, ClipboardList, X } from 'lucide-react';
import type { User, Quiz, Assignment, Classroom } from '../../types/models';

type StatusFilter = 'all' | 'active' | 'upcoming' | 'expired';

function deriveStatus(assignment: Assignment): 'active' | 'upcoming' | 'expired' {
  const now = Date.now();
  if (now < assignment.startAt) return 'upcoming';
  if (now <= assignment.endAt) return 'active';
  return 'expired';
}

export default function AdminAssignments() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [extendId, setExtendId] = useState<string | null>(null);
  const [extendDate, setExtendDate] = useState('');
  const { addToast } = useToastStore();

  useEffect(() => {
    let loaded = 0;
    const check = () => { loaded++; if (loaded >= 4) setLoading(false); };

    const unsubs = [
      onSnapshot(collection(db, 'assignments'), (snap) => { setAssignments(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Assignment))); check(); }),
      onSnapshot(collection(db, 'users'), (snap) => { setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as User))); check(); }),
      onSnapshot(collection(db, 'quizzes'), (snap) => { setQuizzes(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Quiz))); check(); }),
      onSnapshot(collection(db, 'classrooms'), (snap) => { setClassrooms(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Classroom))); check(); }),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  const userMap = useMemo(() => {
    const map: Record<string, User> = {};
    for (const u of users) map[u.id] = u;
    return map;
  }, [users]);

  const quizMap = useMemo(() => {
    const map: Record<string, Quiz> = {};
    for (const q of quizzes) map[q.id] = q;
    return map;
  }, [quizzes]);

  const classroomMap = useMemo(() => {
    const map: Record<string, Classroom> = {};
    for (const c of classrooms) map[c.id] = c;
    return map;
  }, [classrooms]);

  const counts = useMemo(() => ({
    all: assignments.length,
    active: assignments.filter((a) => deriveStatus(a) === 'active').length,
    upcoming: assignments.filter((a) => deriveStatus(a) === 'upcoming').length,
    expired: assignments.filter((a) => deriveStatus(a) === 'expired').length,
  }), [assignments]);

  const filtered = useMemo(() => {
    let list = assignments;

    if (statusFilter !== 'all') {
      list = list.filter((a) => deriveStatus(a) === statusFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((a) => {
        const quiz = quizMap[a.quizId];
        const owner = userMap[a.ownerId];
        return (
          quiz?.title.toLowerCase().includes(q) ||
          owner?.displayName.toLowerCase().includes(q)
        );
      });
    }

    return list.sort((a, b) => b.endAt - a.endAt);
  }, [assignments, statusFilter, searchQuery, quizMap, userMap]);

  const handleDelete = async (assignment: Assignment) => {
    const quiz = quizMap[assignment.quizId];
    const { isConfirmed } = await confirmDelete(quiz?.title || 'Assignment');
    if (!isConfirmed) return;
    try {
      await deleteDoc(doc(db, 'assignments', assignment.id));
      addToast('success', 'Assignment deleted successfully.');
    } catch {
      addToast('error', 'Failed to delete assignment.');
    }
  };

  const handleExtend = async () => {
    if (!extendId || !extendDate) return;
    const newEndAt = new Date(extendDate).getTime();
    if (isNaN(newEndAt)) {
      addToast('error', 'Invalid date.');
      return;
    }
    const assignment = assignments.find((a) => a.id === extendId);
    const quiz = quizMap[assignment?.quizId ?? ''];
    const { isConfirmed } = await confirmAction(
      'Extend Deadline',
      `Extend "${quiz?.title || 'Assignment'}" deadline to ${new Date(newEndAt).toLocaleString()}?`,
      'Yes, extend',
    );
    if (!isConfirmed) return;
    try {
      await updateDoc(doc(db, 'assignments', extendId), { endAt: newEndAt });
      addToast('success', 'Deadline extended successfully.');
      setExtendId(null);
      setExtendDate('');
    } catch {
      addToast('error', 'Failed to extend deadline.');
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-success/10 text-success';
      case 'upcoming': return 'bg-warning/10 text-warning';
      default: return 'bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-white/50';
    }
  };

  const filterTabs: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'active', label: 'Active' },
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'expired', label: 'Expired' },
  ];

  return (
    <div>
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white dark:bg-white/5 rounded-xl border border-gray-100 dark:border-white/10 px-4 py-3 text-center">
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{counts.all}</p>
          <p className="text-xs text-gray-500 dark:text-white/50">Total Assignments</p>
        </div>
        <div className="bg-white dark:bg-white/5 rounded-xl border border-gray-100 dark:border-white/10 px-4 py-3 text-center">
          <p className="text-2xl font-bold text-success">{counts.active}</p>
          <p className="text-xs text-gray-500 dark:text-white/50">Active</p>
        </div>
        <div className="bg-white dark:bg-white/5 rounded-xl border border-gray-100 dark:border-white/10 px-4 py-3 text-center">
          <p className="text-2xl font-bold text-gray-400 dark:text-white/40">{counts.expired}</p>
          <p className="text-xs text-gray-500 dark:text-white/50">Expired</p>
        </div>
      </div>

      {/* Status Filter Tabs — segmented control */}
      <div className="flex bg-gray-100 dark:bg-white/5 rounded-xl p-1 mb-4">
        {filterTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all ${
              statusFilter === tab.key
                ? 'bg-brand text-white shadow-sm'
                : 'text-gray-600 dark:text-white/70 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <span className="hidden sm:inline">{tab.label}</span>
            <span className="sm:hidden">{tab.label.slice(0, 3)}</span>
            <span className={`px-1.5 py-0.5 rounded-full text-xs ${
              statusFilter === tab.key ? 'bg-white/20' : 'bg-gray-200 dark:bg-white/10'
            }`}>
              {counts[tab.key]}
            </span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-white/40" />
        <input
          type="text"
          placeholder="Search by quiz title or owner..."
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
          <ClipboardList className="w-10 h-10 text-gray-300 dark:text-white/30 mx-auto mb-3" />
          <p className="text-gray-400 dark:text-white/40">
            {searchQuery ? 'No assignments match your search' : 'No assignments found'}
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/10 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 dark:border-white/10">
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 dark:text-white/40 uppercase tracking-wider">Quiz</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 dark:text-white/40 uppercase tracking-wider hidden md:table-cell">Owner</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 dark:text-white/40 uppercase tracking-wider hidden lg:table-cell">Classroom</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 dark:text-white/40 uppercase tracking-wider hidden sm:table-cell">Start</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 dark:text-white/40 uppercase tracking-wider hidden sm:table-cell">End</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 dark:text-white/40 uppercase tracking-wider hidden lg:table-cell">Attempts</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 dark:text-white/40 uppercase tracking-wider">Status</th>
                  <th className="text-right px-5 py-3 text-xs font-medium text-gray-400 dark:text-white/40 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-white/10">
                {filtered.map((assignment) => {
                  const quiz = quizMap[assignment.quizId];
                  const owner = userMap[assignment.ownerId];
                  const classroom = assignment.classroomId ? classroomMap[assignment.classroomId] : null;
                  const status = deriveStatus(assignment);
                  return (
                    <tr key={assignment.id} className="hover:bg-gray-50/50 dark:hover:bg-white/5 transition-colors">
                      <td className="px-5 py-4">
                        <p className="font-medium text-gray-900 dark:text-white text-sm">{quiz?.title || 'Unknown Quiz'}</p>
                        <p className="text-xs text-gray-400 dark:text-white/40 md:hidden">
                          {owner?.displayName || 'Unknown'}
                        </p>
                      </td>
                      <td className="px-5 py-4 hidden md:table-cell">
                        <p className="text-sm text-gray-900 dark:text-white">{owner?.displayName || 'Unknown'}</p>
                      </td>
                      <td className="px-5 py-4 text-sm text-gray-500 dark:text-white/50 hidden lg:table-cell">
                        {classroom?.name || '—'}
                      </td>
                      <td className="px-5 py-4 text-sm text-gray-500 dark:text-white/50 hidden sm:table-cell">
                        {new Date(assignment.startAt).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-4 text-sm text-gray-500 dark:text-white/50 hidden sm:table-cell">
                        {new Date(assignment.endAt).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-4 text-sm text-gray-500 dark:text-white/50 hidden lg:table-cell">
                        {assignment.attemptsAllowed}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(status)}`}>
                          {status}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => {
                              setExtendId(assignment.id);
                              // Pre-fill with current end date
                              const d = new Date(assignment.endAt);
                              const offset = d.getTimezoneOffset();
                              const local = new Date(d.getTime() - offset * 60000);
                              setExtendDate(local.toISOString().slice(0, 16));
                            }}
                            className="p-2 rounded-lg text-gray-400 dark:text-white/40 hover:bg-gray-100 dark:hover:bg-white/10 hover:text-warning transition-colors"
                            title="Extend deadline"
                          >
                            <Clock className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(assignment)}
                            className="p-2 rounded-lg text-gray-400 dark:text-white/40 hover:bg-danger/10 hover:text-danger transition-colors"
                            title="Delete assignment"
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

      {/* Extend Deadline Modal */}
      {extendId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-[#162033] rounded-2xl border border-gray-200 dark:border-white/10 shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Extend Deadline</h3>
              <button
                onClick={() => { setExtendId(null); setExtendDate(''); }}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4 text-gray-400 dark:text-white/40" />
              </button>
            </div>
            <p className="text-sm text-gray-500 dark:text-white/50 mb-4">
              Set a new deadline for "{quizMap[assignments.find((a) => a.id === extendId)?.quizId ?? '']?.title || 'Assignment'}":
            </p>
            <input
              type="datetime-local"
              value={extendDate}
              onChange={(e) => setExtendDate(e.target.value)}
              className="w-full px-3 py-2.5 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand/30 mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setExtendId(null); setExtendDate(''); }}
                className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 dark:text-white/70 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleExtend}
                disabled={!extendDate}
                className="px-4 py-2 rounded-xl text-sm font-medium bg-brand text-white hover:bg-brand/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Extend
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
