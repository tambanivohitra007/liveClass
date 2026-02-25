import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, doc, updateDoc, deleteDoc, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useToastStore } from '../../stores/toastStore';
import { confirmDelete, confirmAction } from '../../lib/swal';
import { Search, Trash2, ExternalLink, StopCircle, Radio } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { User, Quiz, Session } from '../../types/models';

type StatusFilter = 'all' | 'lobby' | 'live' | 'ended';

export default function AdminSessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [playerCounts, setPlayerCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const { addToast } = useToastStore();
  const navigate = useNavigate();

  useEffect(() => {
    let loaded = 0;
    const check = () => { loaded++; if (loaded >= 3) setLoading(false); };

    const unsubs = [
      onSnapshot(collection(db, 'sessions'), (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Session));
        setSessions(list);
        // Fetch player counts for each session
        Promise.all(
          list.map(async (s) => {
            const playersSnap = await getDocs(collection(db, 'sessions', s.id, 'players'));
            return [s.id, playersSnap.size] as [string, number];
          })
        ).then((counts) => {
          const map: Record<string, number> = {};
          for (const [id, count] of counts) map[id] = count;
          setPlayerCounts(map);
        });
        check();
      }),
      onSnapshot(collection(db, 'users'), (snap) => {
        setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as User)));
        check();
      }),
      onSnapshot(collection(db, 'quizzes'), (snap) => {
        setQuizzes(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Quiz)));
        check();
      }),
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

  const counts = useMemo(() => ({
    all: sessions.length,
    lobby: sessions.filter((s) => s.status === 'lobby').length,
    live: sessions.filter((s) => s.status === 'live').length,
    ended: sessions.filter((s) => s.status === 'ended').length,
  }), [sessions]);

  const filtered = useMemo(() => {
    let list = sessions;

    // Status filter
    if (statusFilter !== 'all') {
      list = list.filter((s) => s.status === statusFilter);
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((s) => {
        const quiz = quizMap[s.quizId];
        const host = userMap[s.hostId];
        return (
          quiz?.title.toLowerCase().includes(q) ||
          host?.displayName.toLowerCase().includes(q) ||
          s.pinCode.includes(q)
        );
      });
    }

    // Sort: active sessions first, then by startedAt desc
    return list.sort((a, b) => {
      const aActive = a.status !== 'ended' ? 1 : 0;
      const bActive = b.status !== 'ended' ? 1 : 0;
      if (aActive !== bActive) return bActive - aActive;
      return (b.startedAt ?? 0) - (a.startedAt ?? 0);
    });
  }, [sessions, statusFilter, searchQuery, quizMap, userMap]);

  const handleForceEnd = async (session: Session) => {
    const quiz = quizMap[session.quizId];
    const { isConfirmed } = await confirmAction(
      'Force End Session',
      `Force end "${quiz?.title || 'Unknown Quiz'}" (PIN: ${session.pinCode})?`,
      'Yes, end it',
    );
    if (!isConfirmed) return;
    try {
      await updateDoc(doc(db, 'sessions', session.id), { status: 'ended', endedAt: Date.now() });
      addToast('success', 'Session ended successfully.');
    } catch {
      addToast('error', 'Failed to end session.');
    }
  };

  const handleDelete = async (session: Session) => {
    const quiz = quizMap[session.quizId];
    const { isConfirmed } = await confirmDelete(quiz?.title || 'Session');
    if (!isConfirmed) return;
    try {
      await deleteDoc(doc(db, 'sessions', session.id));
      addToast('success', 'Session deleted successfully.');
    } catch {
      addToast('error', 'Failed to delete session.');
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'lobby': return 'bg-warning/10 text-warning';
      case 'live': return 'bg-success/10 text-success';
      default: return 'bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-white/50';
    }
  };

  const filterTabs: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'lobby', label: 'Lobby' },
    { key: 'live', label: 'Live' },
    { key: 'ended', label: 'Ended' },
  ];

  return (
    <div>
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white dark:bg-white/5 rounded-xl border border-gray-100 dark:border-white/10 px-4 py-3 text-center">
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{counts.all}</p>
          <p className="text-xs text-gray-500 dark:text-white/50">Total Sessions</p>
        </div>
        <div className="bg-white dark:bg-white/5 rounded-xl border border-gray-100 dark:border-white/10 px-4 py-3 text-center">
          <p className="text-2xl font-bold text-success">{counts.lobby + counts.live}</p>
          <p className="text-xs text-gray-500 dark:text-white/50">Active</p>
        </div>
        <div className="bg-white dark:bg-white/5 rounded-xl border border-gray-100 dark:border-white/10 px-4 py-3 text-center">
          <p className="text-2xl font-bold text-gray-400 dark:text-white/40">{counts.ended}</p>
          <p className="text-xs text-gray-500 dark:text-white/50">Ended</p>
        </div>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex gap-2 mb-4">
        {filterTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              statusFilter === tab.key
                ? 'bg-brand text-white shadow-sm border-2 border-gray-200'
                : 'bg-white dark:bg-white/5 text-gray-600 dark:text-white/70 border-2 border-gray-200 dark:border-white/10 hover:border-gray-300 dark:hover:border-white/20'
            }`}
          >
            {tab.label}
            <span className={`ml-1 px-1.5 py-0.5 rounded-full text-xs ${
              statusFilter === tab.key ? 'bg-white/20' : 'bg-gray-100 dark:bg-white/10'
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
          placeholder="Search by quiz title, host name, or PIN..."
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
          <Radio className="w-10 h-10 text-gray-300 dark:text-white/30 mx-auto mb-3" />
          <p className="text-gray-400 dark:text-white/40">
            {searchQuery ? 'No sessions match your search' : 'No sessions found'}
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/10 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 dark:border-white/10">
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 dark:text-white/40 uppercase tracking-wider">Quiz</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 dark:text-white/40 uppercase tracking-wider hidden md:table-cell">Host</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 dark:text-white/40 uppercase tracking-wider">Status</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 dark:text-white/40 uppercase tracking-wider hidden sm:table-cell">Players</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 dark:text-white/40 uppercase tracking-wider hidden lg:table-cell">PIN</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 dark:text-white/40 uppercase tracking-wider hidden lg:table-cell">Started</th>
                  <th className="text-right px-5 py-3 text-xs font-medium text-gray-400 dark:text-white/40 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-white/10">
                {filtered.map((session) => {
                  const quiz = quizMap[session.quizId];
                  const host = userMap[session.hostId];
                  return (
                    <tr key={session.id} className="hover:bg-gray-50/50 dark:hover:bg-white/5 transition-colors">
                      <td className="px-5 py-4">
                        <p className="font-medium text-gray-900 dark:text-white text-sm">{quiz?.title || 'Unknown Quiz'}</p>
                        <p className="text-xs text-gray-400 dark:text-white/40 md:hidden">
                          {host?.displayName || 'Unknown'}
                        </p>
                      </td>
                      <td className="px-5 py-4 hidden md:table-cell">
                        <p className="text-sm text-gray-900 dark:text-white">{host?.displayName || 'Unknown'}</p>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(session.status)}`}>
                          {session.status}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm text-gray-500 dark:text-white/50 hidden sm:table-cell">
                        {playerCounts[session.id] ?? '—'}
                      </td>
                      <td className="px-5 py-4 text-sm text-gray-500 dark:text-white/50 font-mono hidden lg:table-cell">
                        {session.pinCode}
                      </td>
                      <td className="px-5 py-4 text-sm text-gray-500 dark:text-white/50 hidden lg:table-cell">
                        {session.startedAt ? new Date(session.startedAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-1.5">
                          {session.status === 'ended' && (
                            <button
                              onClick={() => navigate(`/session/${session.id}/results`)}
                              className="p-2 rounded-lg text-gray-400 dark:text-white/40 hover:bg-gray-100 dark:hover:bg-white/10 hover:text-brand transition-colors"
                              title="View results"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </button>
                          )}
                          {session.status !== 'ended' && (
                            <button
                              onClick={() => handleForceEnd(session)}
                              className="p-2 rounded-lg text-gray-400 dark:text-white/40 hover:bg-warning/10 hover:text-warning transition-colors"
                              title="Force end"
                            >
                              <StopCircle className="w-4 h-4" />
                            </button>
                          )}
                          {session.status === 'ended' && (
                            <button
                              onClick={() => handleDelete(session)}
                              className="p-2 rounded-lg text-gray-400 dark:text-white/40 hover:bg-danger/10 hover:text-danger transition-colors"
                              title="Delete session"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
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
    </div>
  );
}
