import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useToastStore } from '../../stores/toastStore';
import { CheckCircle, XCircle, Clock, UserX, ChevronLeft, ChevronRight } from 'lucide-react';
import type { User } from '../../types/models';

type Tab = 'pending' | 'approved' | 'rejected';

const PAGE_SIZE = 10;

export default function AdminDashboard() {
  const [teachers, setTeachers] = useState<User[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('pending');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const { addToast } = useToastStore();

  useEffect(() => {
    const q = query(collection(db, 'users'), where('role', '==', 'teacher'));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as User));
      setTeachers(list);
      setLoading(false);
    });
    return unsub;
  }, []);

  const updateStatus = async (userId: string, status: 'approved' | 'rejected' | 'pending') => {
    try {
      await updateDoc(doc(db, 'users', userId), { approvalStatus: status });
      addToast('success', `Teacher ${status} successfully.`);
    } catch {
      addToast('error', 'Failed to update teacher status.');
    }
  };

  // Reset page when switching tabs
  useEffect(() => {
    setPage(1);
  }, [activeTab]);

  const filtered = teachers.filter((t) => {
    if (activeTab === 'pending') return !t.approvalStatus || t.approvalStatus === 'pending';
    return t.approvalStatus === activeTab;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const counts = {
    pending: teachers.filter((t) => !t.approvalStatus || t.approvalStatus === 'pending').length,
    approved: teachers.filter((t) => t.approvalStatus === 'approved').length,
    rejected: teachers.filter((t) => t.approvalStatus === 'rejected').length,
  };

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'pending', label: 'Pending', icon: <Clock className="w-4 h-4" /> },
    { key: 'approved', label: 'Approved', icon: <CheckCircle className="w-4 h-4" /> },
    { key: 'rejected', label: 'Rejected', icon: <XCircle className="w-4 h-4" /> },
  ];

  return (
    <div>
      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              activeTab === tab.key
                ? 'bg-rose-500 text-white shadow-sm border-2 border-rose-400'
                : 'bg-white dark:bg-white/5 text-gray-600 dark:text-white/70 border-2 border-gray-200 dark:border-white/10 hover:border-gray-300 dark:hover:border-white/20'
            }`}
          >
            {tab.icon}
            {tab.label}
            <span className={`ml-1 px-1.5 py-0.5 rounded-full text-xs ${
              activeTab === tab.key ? 'bg-white/20' : 'bg-gray-100 dark:bg-white/10'
            }`}>
              {counts[tab.key]}
            </span>
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-rose-400/30 border-t-rose-500 rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/10">
          <UserX className="w-10 h-10 text-gray-300 dark:text-white/30 mx-auto mb-3" />
          <p className="text-gray-400 dark:text-white/40">No {activeTab} teachers</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/10 shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 dark:border-white/10">
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 dark:text-white/40 uppercase tracking-wider">Teacher</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 dark:text-white/40 uppercase tracking-wider hidden sm:table-cell">Signed Up</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-gray-400 dark:text-white/40 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-white/10">
              {paged.map((teacher) => (
                <tr key={teacher.id} className="hover:bg-gray-50/50 dark:hover:bg-white/10 transition-colors">
                  <td className="px-5 py-4">
                    <p className="font-medium text-gray-900 dark:text-white text-sm">{teacher.displayName}</p>
                    <p className="text-xs text-gray-400 dark:text-white/40">{teacher.email}</p>
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-500 dark:text-white/50 hidden sm:table-cell">
                    {teacher.createdAt ? new Date(teacher.createdAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-end gap-2">
                      {activeTab === 'pending' && (
                        <>
                          <button
                            onClick={() => updateStatus(teacher.id, 'approved')}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-success/10 text-success hover:bg-success/20 transition-colors"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => updateStatus(teacher.id, 'rejected')}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-danger/10 text-danger hover:bg-danger/20 transition-colors"
                          >
                            Reject
                          </button>
                        </>
                      )}
                      {activeTab === 'approved' && (
                        <button
                          onClick={() => updateStatus(teacher.id, 'pending')}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-warning/10 text-warning hover:bg-warning/20 transition-colors"
                        >
                          Revoke
                        </button>
                      )}
                      {activeTab === 'rejected' && (
                        <button
                          onClick={() => updateStatus(teacher.id, 'approved')}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-success/10 text-success hover:bg-success/20 transition-colors"
                        >
                          Approve
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 dark:border-white/10">
              <span className="text-xs text-gray-400 dark:text-white/40">
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1.5 rounded-lg text-gray-500 dark:text-white/50 hover:bg-gray-100 dark:hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                      p === page
                        ? 'bg-rose-500 text-white'
                        : 'text-gray-500 dark:text-white/50 hover:bg-gray-100 dark:hover:bg-white/10'
                    }`}
                  >
                    {p}
                  </button>
                ))}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-1.5 rounded-lg text-gray-500 dark:text-white/50 hover:bg-gray-100 dark:hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
