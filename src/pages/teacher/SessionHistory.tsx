import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, doc, getDoc, deleteDoc, orderBy, limit, startAfter, QueryDocumentSnapshot } from 'firebase/firestore';
import type { DocumentData, QueryConstraint } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuthStore } from '../../stores/authStore';
import { useToastStore } from '../../stores/toastStore';
import { SkeletonCard } from '../../components/Skeleton';
import { Users, Target, Calendar, Hash, SortAsc, Filter, Trash2, Gamepad2, Mic, Award, Loader2 } from 'lucide-react';
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

interface LiveGradingRecord {
  id: string;
  rubricId: string;
  rubricName: string;
  pinCode: string;
  endedAt: number;
  playerCount: number;
  gradedCount: number;
  avgScore: number;
  avgPercentage: number;
}

type Tab = 'quiz' | 'grading';
type DateFilter = '7d' | '30d' | 'all';
type SortField = 'date' | 'players' | 'accuracy';

const PAGE_SIZE = 12;

export default function SessionHistory() {
  const { user } = useAuthStore();
  const { addToast } = useToastStore();
  const navigate = useNavigate();

  const [tab, setTab] = useState<Tab>('quiz');

  // Quiz sessions state
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [quizFilter, setQuizFilter] = useState<string>('all');
  const [quizOptions, setQuizOptions] = useState<{ id: string; title: string }[]>([]);
  const sessionsLastDocRef = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [sessionsHasMore, setSessionsHasMore] = useState(false);
  const [sessionsLoadingMore, setSessionsLoadingMore] = useState(false);
  const quizTitleCacheRef = useRef<Map<string, string>>(new Map());

  // Live grading state
  const [gradings, setGradings] = useState<LiveGradingRecord[]>([]);
  const [gradingLoading, setGradingLoading] = useState(false);
  const [gradingsInitialized, setGradingsInitialized] = useState(false);
  const [rubricFilter, setRubricFilter] = useState<string>('all');
  const [rubricOptions, setRubricOptions] = useState<{ id: string; name: string }[]>([]);
  const gradingsLastDocRef = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [gradingsHasMore, setGradingsHasMore] = useState(false);
  const [gradingsLoadingMore, setGradingsLoadingMore] = useState(false);

  // Shared state
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [sortField, setSortField] = useState<SortField>('date');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const toMillis = (value: unknown): number => {
    if (typeof value === 'number') return value;
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'object' && value !== null) {
      const maybeTimestamp = value as { toMillis?: () => number; seconds?: number; nanoseconds?: number };
      if (typeof maybeTimestamp.toMillis === 'function') return maybeTimestamp.toMillis();
      if (typeof maybeTimestamp.seconds === 'number') {
        const nanos = typeof maybeTimestamp.nanoseconds === 'number' ? maybeTimestamp.nanoseconds : 0;
        return maybeTimestamp.seconds * 1000 + Math.floor(nanos / 1_000_000);
      }
    }
    return 0;
  };

  // ─── Load quiz sessions (paginated) ───
  const loadSessions = async (isLoadMore: boolean) => {
    if (!user) return;

    if (isLoadMore) {
      setSessionsLoadingMore(true);
    } else {
      setLoading(true);
      setSessions([]);
      sessionsLastDocRef.current = null;
      setSessionsHasMore(false);
    }

    try {
      const constraints: QueryConstraint[] = [
        where('hostId', '==', user.id),
        where('status', '==', 'ended'),
      ];
      if (dateFilter === '7d') constraints.push(where('endedAt', '>', Date.now() - 7 * 86400000));
      else if (dateFilter === '30d') constraints.push(where('endedAt', '>', Date.now() - 30 * 86400000));
      constraints.push(orderBy('endedAt', 'desc'));
      if (isLoadMore && sessionsLastDocRef.current) {
        constraints.push(startAfter(sessionsLastDocRef.current));
      }
      constraints.push(limit(PAGE_SIZE));

      const snap = await getDocs(query(collection(db, 'sessions'), ...constraints));

      setSessionsHasMore(snap.docs.length === PAGE_SIZE);
      if (snap.docs.length > 0) {
        sessionsLastDocRef.current = snap.docs[snap.docs.length - 1];
      }

      // Fetch quiz titles for IDs not already cached
      const newQuizIds = [...new Set(snap.docs.map((d) => d.data().quizId))]
        .filter((id) => !quizTitleCacheRef.current.has(id));
      await Promise.all(
        newQuizIds.map(async (qid) => {
          const quizSnap = await getDoc(doc(db, 'quizzes', qid));
          quizTitleCacheRef.current.set(qid, quizSnap.data()?.title || 'Untitled Quiz');
        })
      );

      // Fetch subcollections in parallel
      const newRecords = await Promise.all(
        snap.docs.map(async (sDoc) => {
          const sData = sDoc.data();
          const quizId = sData.quizId;

          const [playersSnap, analyticsSnap] = await Promise.all([
            getDocs(collection(db, `sessions/${sDoc.id}/players`)),
            getDocs(collection(db, `sessions/${sDoc.id}/analytics`)),
          ]);

          const analyticsData = analyticsSnap.docs.map((d) => d.data());
          const totalCorrectPct = analyticsData.reduce((sum, a) => sum + (a.correctPercent || 0), 0);
          const avgAccuracy = analyticsData.length > 0
            ? parseFloat((totalCorrectPct / analyticsData.length).toFixed(1))
            : 0;

          const top10 = sData.top10Snapshot || [];
          const avgScore = top10.length > 0
            ? Math.round(top10.reduce((sum: number, p: { totalPoints: number }) => sum + p.totalPoints, 0) / top10.length)
            : 0;

          return {
            id: sDoc.id,
            quizId,
            quizTitle: quizTitleCacheRef.current.get(quizId) || 'Untitled Quiz',
            pinCode: sData.pinCode || '',
            endedAt: toMillis(sData.endedAt),
            playerCount: playersSnap.size,
            avgAccuracy,
            avgScore,
          };
        })
      );

      if (isLoadMore) {
        setSessions((prev) => [...prev, ...newRecords]);
      } else {
        setSessions(newRecords);
      }

      // Update quiz filter options from all cached titles
      setQuizOptions(
        [...quizTitleCacheRef.current.entries()].map(([id, title]) => ({ id, title }))
      );
    } catch {
      addToast('error', 'Failed to load sessions');
    } finally {
      setLoading(false);
      setSessionsLoadingMore(false);
    }
  };

  // Initial load + reload on dateFilter change
  useEffect(() => {
    loadSessions(false);
  }, [user, dateFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Load live grading sessions (paginated, lazy) ───
  const loadGradings = async (isLoadMore: boolean) => {
    if (!user) return;

    if (isLoadMore) {
      setGradingsLoadingMore(true);
    } else {
      setGradingLoading(true);
      setGradings([]);
      gradingsLastDocRef.current = null;
      setGradingsHasMore(false);
    }

    try {
      const constraints: QueryConstraint[] = [
        where('ownerId', '==', user.id),
        where('status', '==', 'ended'),
      ];
      if (dateFilter === '7d') constraints.push(where('endedAt', '>', Date.now() - 7 * 86400000));
      else if (dateFilter === '30d') constraints.push(where('endedAt', '>', Date.now() - 30 * 86400000));
      constraints.push(orderBy('endedAt', 'desc'));
      if (isLoadMore && gradingsLastDocRef.current) {
        constraints.push(startAfter(gradingsLastDocRef.current));
      }
      constraints.push(limit(PAGE_SIZE));

      const snap = await getDocs(query(collection(db, 'live_gradings'), ...constraints));

      setGradingsHasMore(snap.docs.length === PAGE_SIZE);
      if (snap.docs.length > 0) {
        gradingsLastDocRef.current = snap.docs[snap.docs.length - 1];
      }

      // Fetch subcollections in parallel
      const newRecords = await Promise.all(
        snap.docs.map(async (lgDoc) => {
          const data = lgDoc.data();

          const [playersSnap, evalsSnap] = await Promise.all([
            getDocs(collection(db, `live_gradings/${lgDoc.id}/players`)),
            getDocs(collection(db, `live_gradings/${lgDoc.id}/evaluations`)),
          ]);

          const evals = evalsSnap.docs.map((d) => d.data());
          const totalPct = evals.reduce((sum, e) => sum + (e.percentage || 0), 0);
          const totalScore = evals.reduce((sum, e) => sum + (e.totalScore || 0), 0);

          return {
            id: lgDoc.id,
            rubricId: data.rubricId,
            rubricName: data.rubricName || 'Untitled Rubric',
            pinCode: data.pinCode || '',
            endedAt: toMillis(data.endedAt),
            playerCount: playersSnap.size,
            gradedCount: evals.length,
            avgScore: evals.length > 0 ? parseFloat((totalScore / evals.length).toFixed(1)) : 0,
            avgPercentage: evals.length > 0 ? parseFloat((totalPct / evals.length).toFixed(1)) : 0,
          };
        })
      );

      const allRecords = isLoadMore ? [...gradings, ...newRecords] : newRecords;
      if (isLoadMore) {
        setGradings((prev) => [...prev, ...newRecords]);
      } else {
        setGradings(newRecords);
      }

      const rubricIds = [...new Set(allRecords.map((r) => r.rubricId))];
      setRubricOptions(
        rubricIds.map((id) => {
          const rec = allRecords.find((r) => r.rubricId === id);
          return { id, name: rec?.rubricName || 'Untitled' };
        })
      );
      setGradingsInitialized(true);
    } catch {
      addToast('error', 'Failed to load grading sessions');
    } finally {
      setGradingLoading(false);
      setGradingsLoadingMore(false);
    }
  };

  // Lazy load on first tab switch
  useEffect(() => {
    if (tab === 'grading' && !gradingsInitialized) {
      loadGradings(false);
    }
  }, [tab, gradingsInitialized]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset gradings when dateFilter changes
  useEffect(() => {
    if (gradingsInitialized) {
      setGradingsInitialized(false);
    }
  }, [dateFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDeleteSession = async (sessionId: string) => {
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

  const handleDeleteGrading = async (gradingId: string) => {
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'live_gradings', gradingId));
      setGradings((prev) => prev.filter((g) => g.id !== gradingId));
      addToast('success', 'Grading session deleted');
    } catch {
      addToast('error', 'Failed to delete grading session');
    } finally {
      setDeleting(false);
      setConfirmDeleteId(null);
    }
  };

  // Apply client-side filters & sort (date filter is now server-side)
  const filteredSessions = sessions
    .filter((s) => {
      if (quizFilter !== 'all' && s.quizId !== quizFilter) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortField === 'date') return b.endedAt - a.endedAt;
      if (sortField === 'players') return b.playerCount - a.playerCount;
      return b.avgAccuracy - a.avgAccuracy;
    });

  const filteredGradings = gradings
    .filter((g) => {
      if (rubricFilter !== 'all' && g.rubricId !== rubricFilter) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortField === 'date') return b.endedAt - a.endedAt;
      if (sortField === 'players') return b.playerCount - a.playerCount;
      return b.avgPercentage - a.avgPercentage;
    });

  const isLoading = tab === 'quiz' ? loading : gradingLoading;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 text-gray-900 dark:text-white">
      {/* Header */}
      <div className="mb-8">
        <BackButton to="/dashboard" label="Back to Dashboard" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Session History</h1>
        <p className="text-gray-500 dark:text-white/50 mt-1">Review past game sessions and grading results</p>
      </div>

      {/* Tab Toggle */}
      <div className="flex bg-white dark:bg-white/5 rounded-xl border border-gray-200 dark:border-white/10 p-1 mb-6 w-fit">
        <button
          onClick={() => setTab('quiz')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            tab === 'quiz'
              ? 'bg-brand text-white shadow-sm'
              : 'text-gray-500 dark:text-white/50 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-white/5'
          }`}
        >
          <Gamepad2 className="w-4 h-4" />
          Quiz Sessions
        </button>
        <button
          onClick={() => setTab('grading')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            tab === 'grading'
              ? 'bg-brand text-white shadow-sm'
              : 'text-gray-500 dark:text-white/50 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-white/5'
          }`}
        >
          <Mic className="w-4 h-4" />
          Live Gradings
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-white/50">
          <Filter className="w-4 h-4" />
          <span className="font-medium">Filters:</span>
        </div>

        {/* Date filter */}
        <div className="flex bg-white dark:bg-white/5 rounded-lg border border-gray-200 dark:border-white/10 overflow-hidden">
          {(['7d', '30d', 'all'] as DateFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setDateFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                dateFilter === f ? 'bg-brand text-white' : 'text-gray-600 dark:text-white/70 hover:bg-gray-50 dark:hover:bg-white/10'
              }`}
            >
              {f === '7d' ? '7 Days' : f === '30d' ? '30 Days' : 'All Time'}
            </button>
          ))}
        </div>

        {/* Quiz filter (quiz tab) */}
        {tab === 'quiz' && quizOptions.length > 1 && (
          <select
            value={quizFilter}
            onChange={(e) => setQuizFilter(e.target.value)}
            aria-label="Filter by quiz"
            className="text-xs px-3 py-1.5 border border-gray-200 dark:border-white/20 rounded-lg bg-white dark:bg-slate-800 text-gray-700 dark:text-white/80 focus:ring-2 focus:ring-brand/20 focus:border-brand"
          >
            <option value="all" className="bg-white dark:bg-slate-800 text-gray-700 dark:text-white">All Quizzes</option>
            {quizOptions.map((q) => (
              <option key={q.id} value={q.id} className="bg-white dark:bg-slate-800 text-gray-700 dark:text-white">{q.title}</option>
            ))}
          </select>
        )}

        {/* Rubric filter (grading tab) */}
        {tab === 'grading' && rubricOptions.length > 1 && (
          <select
            value={rubricFilter}
            onChange={(e) => setRubricFilter(e.target.value)}
            aria-label="Filter by rubric"
            className="text-xs px-3 py-1.5 border border-gray-200 dark:border-white/20 rounded-lg bg-white dark:bg-slate-800 text-gray-700 dark:text-white/80 focus:ring-2 focus:ring-brand/20 focus:border-brand"
          >
            <option value="all" className="bg-white dark:bg-slate-800 text-gray-700 dark:text-white">All Rubrics</option>
            {rubricOptions.map((r) => (
              <option key={r.id} value={r.id} className="bg-white dark:bg-slate-800 text-gray-700 dark:text-white">{r.name}</option>
            ))}
          </select>
        )}

        {/* Sort */}
        <div className="flex items-center gap-1.5 ml-auto">
          <SortAsc className="w-4 h-4 text-gray-400 dark:text-white/40" />
          <select
            value={sortField}
            onChange={(e) => setSortField(e.target.value as SortField)}
            aria-label="Sort sessions by"
            className="text-xs px-3 py-1.5 border border-gray-200 dark:border-white/20 rounded-lg bg-white dark:bg-slate-800 text-gray-700 dark:text-white/80 focus:ring-2 focus:ring-brand/20 focus:border-brand"
          >
            <option value="date" className="bg-white dark:bg-slate-800 text-gray-700 dark:text-white">Sort by Date</option>
            <option value="players" className="bg-white dark:bg-slate-800 text-gray-700 dark:text-white">Sort by Players</option>
            <option value="accuracy" className="bg-white dark:bg-slate-800 text-gray-700 dark:text-white">
              {tab === 'quiz' ? 'Sort by Accuracy' : 'Sort by Avg %'}
            </option>
          </select>
        </div>
      </div>

      {/* ═══════════ QUIZ SESSIONS TAB ═══════════ */}
      {tab === 'quiz' && (
        <>
          {isLoading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-20 h-20 bg-gray-100 dark:bg-white/10 rounded-3xl flex items-center justify-center mx-auto mb-4">
                <Calendar className="w-10 h-10 text-gray-300 dark:text-white/30" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">No sessions found</h3>
              <p className="text-gray-500 dark:text-white/50">
                {sessions.length === 0 ? 'Host a game to see results here' : 'Try adjusting your filters'}
              </p>
            </div>
          ) : (
            <>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger-children">
                {filteredSessions.map((s) => (
                  <div key={s.id} className="relative animate-fade-in">
                    <div
                      onClick={() => navigate(`/session/${s.id}/results`)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate(`/session/${s.id}/results`); }}
                      className="w-full bg-white dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/10 shadow-sm hover:shadow-md hover:border-brand/20 transition-all p-6 text-left group cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold text-gray-900 dark:text-white group-hover:text-brand transition-colors mb-1 truncate">
                          {s.quizTitle}
                        </h3>
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(s.id); }}
                          className="p-1.5 rounded-lg text-gray-300 dark:text-white/30 hover:text-danger hover:bg-danger/10 transition-colors shrink-0"
                          title="Delete session"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-white/40 mb-4">
                        <Calendar className="w-3 h-3" />
                        {s.endedAt > 0
                          ? new Date(s.endedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                          : 'Unknown date'}
                        <span className="text-gray-300 dark:text-white/30">|</span>
                        <Hash className="w-3 h-3" />
                        {s.pinCode}
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <div className="flex items-center gap-1 text-gray-400 dark:text-white/40 mb-1">
                            <Users className="w-3 h-3" />
                            <span className="text-[10px] uppercase tracking-wider font-medium">Players</span>
                          </div>
                          <p className="text-lg font-bold text-gray-900 dark:text-white">{s.playerCount}</p>
                        </div>
                        <div>
                          <div className="flex items-center gap-1 text-gray-400 dark:text-white/40 mb-1">
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
                          <div className="flex items-center gap-1 text-gray-400 dark:text-white/40 mb-1">
                            <span className="text-[10px] uppercase tracking-wider font-medium">Avg Score</span>
                          </div>
                          <p className="text-lg font-bold text-gray-900 dark:text-white">{s.avgScore.toLocaleString()}</p>
                        </div>
                      </div>
                    </div>

                    {confirmDeleteId === s.id && (
                      <div className="absolute inset-0 bg-white/95 dark:bg-surface-dark/95 backdrop-blur-sm rounded-2xl border border-danger/20 flex flex-col items-center justify-center gap-3 z-10 animate-fade-in">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">Delete this session?</p>
                        <p className="text-xs text-gray-500 dark:text-white/50">This action cannot be undone.</p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            disabled={deleting}
                            className="px-4 py-1.5 text-xs font-medium text-gray-600 dark:text-white/70 bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/20 rounded-lg transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleDeleteSession(s.id)}
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

              {sessionsHasMore && (
                <div className="flex justify-center mt-8">
                  <button
                    onClick={() => loadSessions(true)}
                    disabled={sessionsLoadingMore}
                    className="btn-3d-ghost px-8 py-3 text-sm flex items-center gap-2 disabled:opacity-50"
                  >
                    {sessionsLoadingMore ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Loading...</>
                    ) : 'Load More'}
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ═══════════ LIVE GRADINGS TAB ═══════════ */}
      {tab === 'grading' && (
        <>
          {gradingLoading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : filteredGradings.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-20 h-20 bg-gray-100 dark:bg-white/10 rounded-3xl flex items-center justify-center mx-auto mb-4">
                <Mic className="w-10 h-10 text-gray-300 dark:text-white/30" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">No grading sessions found</h3>
              <p className="text-gray-500 dark:text-white/50">
                {gradings.length === 0 ? 'Host a live grading session to see results here' : 'Try adjusting your filters'}
              </p>
            </div>
          ) : (
            <>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger-children">
                {filteredGradings.map((g) => (
                  <div key={g.id} className="relative animate-fade-in">
                    <div
                      onClick={() => navigate(`/live-grading/${g.id}/results`)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate(`/live-grading/${g.id}/results`); }}
                      className="w-full bg-white dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/10 shadow-sm hover:shadow-md hover:border-emerald-500/20 transition-all p-6 text-left group cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                            <Award className="w-4 h-4 text-emerald-500" />
                          </div>
                          <h3 className="font-semibold text-gray-900 dark:text-white group-hover:text-emerald-500 transition-colors mb-0 truncate">
                            {g.rubricName}
                          </h3>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(g.id); }}
                          className="p-1.5 rounded-lg text-gray-300 dark:text-white/30 hover:text-danger hover:bg-danger/10 transition-colors shrink-0"
                          title="Delete grading session"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-white/40 mt-2 mb-4">
                        <Calendar className="w-3 h-3" />
                        {g.endedAt > 0
                          ? new Date(g.endedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                          : 'Unknown date'}
                        <span className="text-gray-300 dark:text-white/30">|</span>
                        <Hash className="w-3 h-3" />
                        {g.pinCode}
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <div className="flex items-center gap-1 text-gray-400 dark:text-white/40 mb-1">
                            <Users className="w-3 h-3" />
                            <span className="text-[10px] uppercase tracking-wider font-medium">Students</span>
                          </div>
                          <p className="text-lg font-bold text-gray-900 dark:text-white">
                            {g.gradedCount}<span className="text-sm font-normal text-gray-400 dark:text-white/30">/{g.playerCount}</span>
                          </p>
                        </div>
                        <div>
                          <div className="flex items-center gap-1 text-gray-400 dark:text-white/40 mb-1">
                            <Target className="w-3 h-3" />
                            <span className="text-[10px] uppercase tracking-wider font-medium">Avg %</span>
                          </div>
                          <p className={`text-lg font-bold ${
                            g.avgPercentage >= 70 ? 'text-success' :
                            g.avgPercentage >= 40 ? 'text-warning' :
                            'text-danger'
                          }`}>
                            {g.avgPercentage}%
                          </p>
                        </div>
                        <div>
                          <div className="flex items-center gap-1 text-gray-400 dark:text-white/40 mb-1">
                            <span className="text-[10px] uppercase tracking-wider font-medium">Avg Score</span>
                          </div>
                          <p className="text-lg font-bold text-gray-900 dark:text-white">{g.avgScore}</p>
                        </div>
                      </div>
                    </div>

                    {confirmDeleteId === g.id && (
                      <div className="absolute inset-0 bg-white/95 dark:bg-surface-dark/95 backdrop-blur-sm rounded-2xl border border-danger/20 flex flex-col items-center justify-center gap-3 z-10 animate-fade-in">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">Delete this grading session?</p>
                        <p className="text-xs text-gray-500 dark:text-white/50">This action cannot be undone.</p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            disabled={deleting}
                            className="px-4 py-1.5 text-xs font-medium text-gray-600 dark:text-white/70 bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/20 rounded-lg transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleDeleteGrading(g.id)}
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

              {gradingsHasMore && (
                <div className="flex justify-center mt-8">
                  <button
                    onClick={() => loadGradings(true)}
                    disabled={gradingsLoadingMore}
                    className="btn-3d-ghost px-8 py-3 text-sm flex items-center gap-2 disabled:opacity-50"
                  >
                    {gradingsLoadingMore ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Loading...</>
                    ) : 'Load More'}
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
