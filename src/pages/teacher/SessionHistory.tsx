import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, doc, getDoc, deleteDoc, orderBy } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuthStore } from '../../stores/authStore';
import { useToastStore } from '../../stores/toastStore';
import { SkeletonCard } from '../../components/Skeleton';
import { Users, Target, Calendar, Hash, SortAsc, Filter, Trash2 } from 'lucide-react';
import BackButton from '../../components/BackButton';

interface SessionRecord {
  id: string;
  quizId: string;
  quizTitle: string;
  pinCode: string;
  endedAt: number;
  playerCount: number;
  avgAccuracy: number;
  avgScore: number;
}

type DateFilter = '7d' | '30d' | 'all';
type SortField = 'date' | 'players' | 'accuracy';

export default function SessionHistory() {
  const { user } = useAuthStore();
  const { addToast } = useToastStore();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [quizFilter, setQuizFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('date');
  const [quizOptions, setQuizOptions] = useState<{ id: string; title: string }[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!user) return;

    const load = async () => {
      setLoading(true);

      // Query ended sessions for this host
      const sessionsSnap = await getDocs(
        query(
          collection(db, 'sessions'),
          where('hostId', '==', user.id),
          where('status', '==', 'ended'),
          orderBy('endedAt', 'desc')
        )
      );

      // Cache quiz titles
      const quizTitleCache = new Map<string, string>();
      const quizSet = new Set<string>();

      const records: SessionRecord[] = [];

      for (const sDoc of sessionsSnap.docs) {
        const sData = sDoc.data();
        const quizId = sData.quizId;
        quizSet.add(quizId);

        // Fetch quiz title if not cached
        if (!quizTitleCache.has(quizId)) {
          const quizSnap = await getDoc(doc(db, 'quizzes', quizId));
          quizTitleCache.set(quizId, quizSnap.data()?.title || 'Untitled Quiz');
        }

        // Fetch players and analytics for stats
        const [playersSnap, analyticsSnap] = await Promise.all([
          getDocs(collection(db, `sessions/${sDoc.id}/players`)),
          getDocs(collection(db, `sessions/${sDoc.id}/analytics`)),
        ]);

        const analyticsData = analyticsSnap.docs.map((d) => d.data());
        const totalCorrectPct = analyticsData.reduce((sum, a) => sum + (a.correctPercent || 0), 0);
        const avgAccuracy = analyticsData.length > 0
          ? parseFloat((totalCorrectPct / analyticsData.length).toFixed(1))
          : 0;

        // Approximate avg score from top10Snapshot
        const top10 = sData.top10Snapshot || [];
        const avgScore = top10.length > 0
          ? Math.round(top10.reduce((sum: number, p: { totalPoints: number }) => sum + p.totalPoints, 0) / top10.length)
          : 0;

        records.push({
          id: sDoc.id,
          quizId,
          quizTitle: quizTitleCache.get(quizId) || 'Untitled Quiz',
          pinCode: sData.pinCode || '',
          endedAt: sData.endedAt || 0,
          playerCount: playersSnap.size,
          avgAccuracy,
          avgScore,
        });
      }

      setSessions(records);
      setQuizOptions(
        Array.from(quizSet).map((id) => ({ id, title: quizTitleCache.get(id) || 'Untitled' }))
      );
      setLoading(false);
    };

    load();
  }, [user]);

  const handleDelete = async (sessionId: string) => {
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'sessions', sessionId));
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      addToast('success', 'Session deleted');
    } catch {
      addToast('error', 'Failed to delete session');
    } finally {
      setDeleting(false);
      setConfirmDeleteId(null);
    }
  };

  // Apply filters & sort
  const now = Date.now();
  const filteredSessions = sessions
    .filter((s) => {
      if (dateFilter === '7d' && now - s.endedAt > 7 * 86400000) return false;
      if (dateFilter === '30d' && now - s.endedAt > 30 * 86400000) return false;
      if (quizFilter !== 'all' && s.quizId !== quizFilter) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortField === 'date') return b.endedAt - a.endedAt;
      if (sortField === 'players') return b.playerCount - a.playerCount;
      return b.avgAccuracy - a.avgAccuracy;
    });

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <BackButton to="/dashboard" label="Back to Dashboard" />
        <h1 className="text-2xl font-bold text-gray-900">Session History</h1>
        <p className="text-gray-500 mt-1">Review past game sessions and results</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex items-center gap-1.5 text-sm text-gray-500">
          <Filter className="w-4 h-4" />
          <span className="font-medium">Filters:</span>
        </div>

        {/* Date filter */}
        <div className="flex bg-white rounded-lg border border-gray-200 overflow-hidden">
          {(['7d', '30d', 'all'] as DateFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setDateFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                dateFilter === f ? 'bg-brand text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {f === '7d' ? '7 Days' : f === '30d' ? '30 Days' : 'All Time'}
            </button>
          ))}
        </div>

        {/* Quiz filter */}
        {quizOptions.length > 1 && (
          <select
            value={quizFilter}
            onChange={(e) => setQuizFilter(e.target.value)}
            className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg bg-white text-gray-700 focus:ring-2 focus:ring-brand/20 focus:border-brand"
          >
            <option value="all">All Quizzes</option>
            {quizOptions.map((q) => (
              <option key={q.id} value={q.id}>{q.title}</option>
            ))}
          </select>
        )}

        {/* Sort */}
        <div className="flex items-center gap-1.5 ml-auto">
          <SortAsc className="w-4 h-4 text-gray-400" />
          <select
            value={sortField}
            onChange={(e) => setSortField(e.target.value as SortField)}
            className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg bg-white text-gray-700 focus:ring-2 focus:ring-brand/20 focus:border-brand"
          >
            <option value="date">Sort by Date</option>
            <option value="players">Sort by Players</option>
            <option value="accuracy">Sort by Accuracy</option>
          </select>
        </div>
      </div>

      {/* Session Cards */}
      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : filteredSessions.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-20 h-20 bg-gray-100 rounded-3xl flex items-center justify-center mx-auto mb-4">
            <Calendar className="w-10 h-10 text-gray-300" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No sessions found</h3>
          <p className="text-gray-500">
            {sessions.length === 0 ? 'Host a game to see results here' : 'Try adjusting your filters'}
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger-children">
          {filteredSessions.map((s) => (
            <div key={s.id} className="relative animate-fade-in">
              <button
                onClick={() => navigate(`/session/${s.id}/results`)}
                className="w-full bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-brand/20 transition-all p-6 text-left group"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-gray-900 group-hover:text-brand transition-colors mb-1 truncate">
                    {s.quizTitle}
                  </h3>
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(s.id); }}
                    className="p-1.5 rounded-lg text-gray-300 hover:text-danger hover:bg-danger/10 transition-colors shrink-0"
                    title="Delete session"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-400 mb-4">
                  <Calendar className="w-3 h-3" />
                  {new Date(s.endedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  <span className="text-gray-300">|</span>
                  <Hash className="w-3 h-3" />
                  {s.pinCode}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <div className="flex items-center gap-1 text-gray-400 mb-1">
                      <Users className="w-3 h-3" />
                      <span className="text-[10px] uppercase tracking-wider font-medium">Players</span>
                    </div>
                    <p className="text-lg font-bold text-gray-900">{s.playerCount}</p>
                  </div>
                  <div>
                    <div className="flex items-center gap-1 text-gray-400 mb-1">
                      <Target className="w-3 h-3" />
                      <span className="text-[10px] uppercase tracking-wider font-medium">Accuracy</span>
                    </div>
                    <p className={`text-lg font-bold ${
                      s.avgAccuracy >= 70 ? 'text-success' :
                      s.avgAccuracy >= 40 ? 'text-warning' :
                      'text-danger'
                    }`}>
                      {s.avgAccuracy}%
                    </p>
                  </div>
                  <div>
                    <div className="flex items-center gap-1 text-gray-400 mb-1">
                      <span className="text-[10px] uppercase tracking-wider font-medium">Avg Score</span>
                    </div>
                    <p className="text-lg font-bold text-gray-900">{s.avgScore.toLocaleString()}</p>
                  </div>
                </div>
              </button>

              {/* Delete confirmation overlay */}
              {confirmDeleteId === s.id && (
                <div className="absolute inset-0 bg-white/95 backdrop-blur-sm rounded-2xl border border-danger/20 flex flex-col items-center justify-center gap-3 z-10 animate-fade-in">
                  <p className="text-sm font-medium text-gray-900">Delete this session?</p>
                  <p className="text-xs text-gray-500">This action cannot be undone.</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      disabled={deleting}
                      className="px-4 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleDelete(s.id)}
                      disabled={deleting}
                      className="px-4 py-1.5 text-xs font-medium text-white bg-danger hover:bg-danger/90 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {deleting ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
