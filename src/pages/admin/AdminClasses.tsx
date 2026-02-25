import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, doc, deleteDoc, updateDoc, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useToastStore } from '../../stores/toastStore';
import { confirmDelete, confirmAction } from '../../lib/swal';
import { Search, Trash2, ArrowRightLeft, ExternalLink, GraduationCap, X, Users as UsersIcon, UserPlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Classroom, User } from '../../types/models';

export default function AdminClasses() {
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [transferClassId, setTransferClassId] = useState<string | null>(null);
  const [transferTargetId, setTransferTargetId] = useState('');
  const { addToast } = useToastStore();
  const navigate = useNavigate();

  // Fetch all classrooms
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'classrooms'), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Classroom));
      setClassrooms(list);
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
    if (!searchQuery.trim()) return classrooms;
    const q = searchQuery.toLowerCase();
    return classrooms.filter((c) => {
      const owner = userMap[c.ownerId];
      return (
        c.name.toLowerCase().includes(q) ||
        owner?.displayName.toLowerCase().includes(q) ||
        owner?.email.toLowerCase().includes(q)
      );
    });
  }, [classrooms, searchQuery, userMap]);

  const stats = useMemo(() => ({
    total: classrooms.length,
    totalStudents: classrooms.reduce((sum, c) => sum + (c.studentCount || 0), 0),
    totalCoTeachers: classrooms.reduce((sum, c) => sum + (c.coTeacherCount || 0), 0),
  }), [classrooms]);

  const handleDelete = async (classroom: Classroom) => {
    const { isConfirmed } = await confirmDelete(classroom.name);
    if (!isConfirmed) return;
    setDeleting(classroom.id);
    try {
      // Delete members subcollection
      const membersSnap = await getDocs(collection(db, 'classrooms', classroom.id, 'members'));
      await Promise.all(membersSnap.docs.map((d) => deleteDoc(d.ref)));
      await deleteDoc(doc(db, 'classrooms', classroom.id));
      addToast('success', `"${classroom.name}" deleted successfully`);
    } catch {
      addToast('error', 'Failed to delete classroom.');
    } finally {
      setDeleting(null);
    }
  };

  const handleTransfer = async () => {
    if (!transferClassId || !transferTargetId) return;
    const classroom = classrooms.find((c) => c.id === transferClassId);
    const target = userMap[transferTargetId];
    if (!classroom || !target) return;

    const { isConfirmed } = await confirmAction(
      'Transfer Classroom',
      `Transfer "${classroom.name}" to ${target.displayName}?`,
      'Yes, transfer',
    );
    if (!isConfirmed) return;

    try {
      await updateDoc(doc(db, 'classrooms', transferClassId), { ownerId: transferTargetId });
      addToast('success', `Classroom transferred to ${target.displayName}`);
      setTransferClassId(null);
      setTransferTargetId('');
    } catch {
      addToast('error', 'Failed to transfer classroom.');
    }
  };

  return (
    <div>
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white dark:bg-white/5 rounded-xl border border-gray-100 dark:border-white/10 px-4 py-3 text-center">
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
          <p className="text-xs text-gray-500 dark:text-white/50">Total Classes</p>
        </div>
        <div className="bg-white dark:bg-white/5 rounded-xl border border-gray-100 dark:border-white/10 px-4 py-3 text-center">
          <p className="text-2xl font-bold text-brand">{stats.totalStudents}</p>
          <p className="text-xs text-gray-500 dark:text-white/50">Total Students</p>
        </div>
        <div className="bg-white dark:bg-white/5 rounded-xl border border-gray-100 dark:border-white/10 px-4 py-3 text-center">
          <p className="text-2xl font-bold text-accent">{stats.totalCoTeachers}</p>
          <p className="text-xs text-gray-500 dark:text-white/50">Co-teachers</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-white/40" />
        <input
          type="text"
          placeholder="Search by name or owner..."
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
          <GraduationCap className="w-10 h-10 text-gray-300 dark:text-white/30 mx-auto mb-3" />
          <p className="text-gray-400 dark:text-white/40">
            {searchQuery ? 'No classrooms match your search' : 'No classrooms found'}
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/10 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 dark:border-white/10">
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 dark:text-white/40 uppercase tracking-wider">Name</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 dark:text-white/40 uppercase tracking-wider hidden md:table-cell">Owner</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 dark:text-white/40 uppercase tracking-wider hidden sm:table-cell">Members</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 dark:text-white/40 uppercase tracking-wider hidden lg:table-cell">Join Code</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 dark:text-white/40 uppercase tracking-wider hidden lg:table-cell">Created</th>
                  <th className="text-right px-5 py-3 text-xs font-medium text-gray-400 dark:text-white/40 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-white/10">
                {filtered.map((classroom) => {
                  const owner = userMap[classroom.ownerId];
                  return (
                    <tr key={classroom.id} className="hover:bg-gray-50/50 dark:hover:bg-white/5 transition-colors">
                      <td className="px-5 py-4">
                        <p className="font-medium text-gray-900 dark:text-white text-sm">{classroom.name}</p>
                        <p className="text-xs text-gray-400 dark:text-white/40 md:hidden">
                          {owner?.displayName || 'Unknown'}
                        </p>
                      </td>
                      <td className="px-5 py-4 hidden md:table-cell">
                        <p className="text-sm text-gray-900 dark:text-white">{owner?.displayName || 'Unknown'}</p>
                        <p className="text-xs text-gray-400 dark:text-white/40">{owner?.email || ''}</p>
                      </td>
                      <td className="px-5 py-4 hidden sm:table-cell">
                        <div className="flex items-center gap-3">
                          <span className="inline-flex items-center gap-1 text-sm text-gray-600 dark:text-white/60">
                            <UsersIcon className="w-3.5 h-3.5" />
                            {classroom.studentCount || 0}
                          </span>
                          <span className="inline-flex items-center gap-1 text-sm text-gray-600 dark:text-white/60">
                            <UserPlus className="w-3.5 h-3.5" />
                            {classroom.coTeacherCount || 0}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-4 hidden lg:table-cell">
                        <code className="text-sm text-brand font-mono bg-brand/10 px-2 py-0.5 rounded">
                          {classroom.joinCode}
                        </code>
                      </td>
                      <td className="px-5 py-4 text-sm text-gray-500 dark:text-white/50 hidden lg:table-cell">
                        {classroom.createdAt ? new Date(classroom.createdAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => navigate(`/classroom/${classroom.id}`)}
                            className="p-2 rounded-lg text-gray-400 dark:text-white/40 hover:bg-gray-100 dark:hover:bg-white/10 hover:text-brand transition-colors"
                            title="View classroom"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => { setTransferClassId(classroom.id); setTransferTargetId(''); }}
                            className="p-2 rounded-lg text-gray-400 dark:text-white/40 hover:bg-gray-100 dark:hover:bg-white/10 hover:text-warning transition-colors"
                            title="Transfer ownership"
                          >
                            <ArrowRightLeft className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(classroom)}
                            disabled={deleting === classroom.id}
                            className="p-2 rounded-lg text-gray-400 dark:text-white/40 hover:bg-danger/10 hover:text-danger transition-colors disabled:opacity-50"
                            title="Delete classroom"
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
      {transferClassId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-[#162033] rounded-2xl border border-gray-200 dark:border-white/10 shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Transfer Classroom</h3>
              <button
                onClick={() => { setTransferClassId(null); setTransferTargetId(''); }}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4 text-gray-400 dark:text-white/40" />
              </button>
            </div>
            <p className="text-sm text-gray-500 dark:text-white/50 mb-4">
              Transfer "{classrooms.find((c) => c.id === transferClassId)?.name}" to a new owner:
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
                onClick={() => { setTransferClassId(null); setTransferTargetId(''); }}
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
