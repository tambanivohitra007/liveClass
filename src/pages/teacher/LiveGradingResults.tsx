import { useState, useEffect, useMemo, Fragment } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, collection, getDocs, getDoc, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useToastStore } from '../../stores/toastStore';
import {
  ArrowLeft, Download, Users, BarChart3, Award, TrendingUp,
  ChevronDown, ChevronUp, ArrowUpDown, Mic,
} from 'lucide-react';
import { exportGradingExcel } from '../../lib/gradingExcelExport';
import WaveBackground from '../../components/ui/WaveBackground';
import { SkeletonStats, SkeletonTable } from '../../components/Skeleton';
import type { LiveGrading, Criterion, Evaluation, EvaluationScore } from '../../types/models';

type TabId = 'overview' | 'students' | 'criteria';

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'students', label: 'Students' },
  { id: 'criteria', label: 'Criteria' },
];

type SortField = 'name' | 'totalScore' | 'percentage';

const DISTRIBUTION_BUCKETS = [
  { label: '0-20%', min: 0, max: 20, color: 'bg-danger' },
  { label: '21-40%', min: 21, max: 40, color: 'bg-amber-500' },
  { label: '41-60%', min: 41, max: 60, color: 'bg-warning' },
  { label: '61-80%', min: 61, max: 80, color: 'bg-success' },
  { label: '81-100%', min: 81, max: 100, color: 'bg-brand' },
];

function percentageColorClass(pct: number): string {
  if (pct >= 70) return 'text-success';
  if (pct >= 40) return 'text-amber-500';
  return 'text-danger';
}

export default function LiveGradingResults() {
  const { liveGradingId } = useParams<{ liveGradingId: string }>();
  const navigate = useNavigate();
  const { addToast } = useToastStore();

  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  const [liveGrading, setLiveGrading] = useState<LiveGrading | null>(null);
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);

  const [sortField, setSortField] = useState<SortField>('percentage');
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null);

  // Fetch live grading session and criteria
  useEffect(() => {
    if (!liveGradingId) return;
    let cancelled = false;

    async function fetchData() {
      try {
        const lgSnap = await getDoc(doc(db, 'live_gradings', liveGradingId!));
        if (!lgSnap.exists()) {
          addToast('error', 'Live grading session not found.');
          navigate('/rubrics');
          return;
        }
        const lgData = { id: lgSnap.id, ...lgSnap.data() } as LiveGrading;
        if (!cancelled) setLiveGrading(lgData);

        const criteriaSnap = await getDocs(
          query(collection(db, 'rubrics', lgData.rubricId, 'criteria'), orderBy('order'))
        );
        if (!cancelled) {
          setCriteria(criteriaSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Criterion));
          if (criteriaSnap.empty) {
            addToast('warning', 'Rubric criteria not found — the rubric may have been deleted.');
          }
        }
      } catch {
        if (!cancelled) addToast('error', 'Failed to load session data.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, [liveGradingId, addToast, navigate]);

  // Subscribe to evaluations
  useEffect(() => {
    if (!liveGradingId) return;
    const unsub = onSnapshot(
      collection(db, 'live_gradings', liveGradingId, 'evaluations'),
      (snap) => {
        setEvaluations(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Evaluation));
      },
      () => addToast('error', 'Failed to listen to evaluations.'),
    );
    return unsub;
  }, [liveGradingId, addToast]);

  // Stats
  const gradedCount = evaluations.length;
  const studentCount = liveGrading?.studentOrder.length || 0;

  const avgScore = useMemo(() => {
    if (evaluations.length === 0) return 0;
    return evaluations.reduce((sum, e) => sum + e.totalScore, 0) / evaluations.length;
  }, [evaluations]);

  const avgPercentage = useMemo(() => {
    if (evaluations.length === 0) return 0;
    return evaluations.reduce((sum, e) => sum + e.percentage, 0) / evaluations.length;
  }, [evaluations]);

  const highestScore = useMemo(() => {
    if (evaluations.length === 0) return 0;
    return Math.max(...evaluations.map((e) => e.totalScore));
  }, [evaluations]);

  const scoreDistribution = useMemo(() => {
    return DISTRIBUTION_BUCKETS.map((bucket) => ({
      ...bucket,
      count: evaluations.filter((e) => e.percentage >= bucket.min && e.percentage <= bucket.max).length,
    }));
  }, [evaluations]);

  const maxBucketCount = useMemo(() => Math.max(1, ...scoreDistribution.map((b) => b.count)), [scoreDistribution]);

  const sortedEvaluations = useMemo(() => {
    const sorted = [...evaluations].sort((a, b) => {
      switch (sortField) {
        case 'name': return a.studentName.localeCompare(b.studentName);
        case 'totalScore': return b.totalScore - a.totalScore;
        case 'percentage':
        default: return b.percentage - a.percentage;
      }
    });
    return sortAsc ? sorted.reverse() : sorted;
  }, [evaluations, sortField, sortAsc]);

  const criteriaStats = useMemo(() => {
    const gradedEvals = evaluations.filter((e) => e.totalScore > 0 || e.comment);
    return criteria.map((criterion) => {
      const scores = gradedEvals.map((e) => e.scores[criterion.id]?.score ?? 0);
      const avg = scores.length > 0 ? scores.reduce((s, v) => s + v, 0) / scores.length : 0;
      const min = scores.length > 0 ? Math.min(...scores) : 0;
      const max = scores.length > 0 ? Math.max(...scores) : 0;

      const q1 = criterion.maxScore * 0.25;
      const q2 = criterion.maxScore * 0.5;
      const q3 = criterion.maxScore * 0.75;
      const quartiles = [0, 0, 0, 0];
      for (const s of scores) {
        if (s <= q1) quartiles[0]++;
        else if (s <= q2) quartiles[1]++;
        else if (s <= q3) quartiles[2]++;
        else quartiles[3]++;
      }
      const total = scores.length || 1;

      return {
        criterion,
        avg: Math.round(avg * 10) / 10,
        min, max,
        quartiles: quartiles.map((q) => Math.round((q / total) * 100)),
      };
    });
  }, [criteria, evaluations]);

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortAsc((prev) => !prev);
    else { setSortField(field); setSortAsc(false); }
  };

  const handleExportExcel = async () => {
    if (!liveGrading) return;
    setExporting(true);
    try {
      // Build a compatible GradingSession-like object for the export function
      await exportGradingExcel({
        gradingSession: {
          id: liveGrading.id,
          ownerId: liveGrading.ownerId,
          name: `Live Grading - ${liveGrading.rubricName}`,
          rubricId: liveGrading.rubricId,
          sourceType: 'session',
          sourceId: liveGrading.id,
          status: liveGrading.status === 'ended' ? 'completed' : 'active',
          studentCount,
          gradedCount,
          avgScore: Math.round(avgScore * 10) / 10,
          avgPercentage: Math.round(avgPercentage),
          createdAt: liveGrading.createdAt,
          updatedAt: liveGrading.endedAt || liveGrading.createdAt,
        },
        rubricName: liveGrading.rubricName,
        criteria,
        evaluations,
      });
      addToast('success', 'Excel exported successfully.');
    } catch {
      addToast('error', 'Excel export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const toggleExpand = (id: string) => setExpandedStudentId((prev) => (prev === id ? null : id));

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3.5 h-3.5 text-gray-300 dark:text-white/30" />;
    return sortAsc
      ? <ChevronUp className="w-3.5 h-3.5 text-brand" />
      : <ChevronDown className="w-3.5 h-3.5 text-brand" />;
  };

  if (!liveGradingId) return null;

  if (loading) {
    return (
      <div className="min-h-screen bg-surface relative">
        <WaveBackground />
        <div className="pattern-stars absolute inset-0 pointer-events-none" />
        <div className="relative z-10 max-w-7xl mx-auto px-4 py-8 space-y-6 animate-fade-in">
          <div className="h-8 w-48 bg-gray-100 dark:bg-white/10 rounded-lg animate-pulse" />
          <SkeletonStats />
          <div className="card-night p-6"><SkeletonTable rows={6} /></div>
        </div>
      </div>
    );
  }

  if (!liveGrading) return null;

  return (
    <div className="min-h-screen bg-surface relative text-gray-900 dark:text-white">
      <WaveBackground />
      <div className="pattern-stars absolute inset-0 pointer-events-none" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 py-8 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/rubrics')}
              className="p-2 rounded-lg bg-gray-50 dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-white/70" />
            </button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold">Live Grading Results</h1>
                <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full border bg-emerald-500/15 text-emerald-400 border-emerald-500/20 flex items-center gap-1">
                  <Mic className="w-3 h-3" />
                  {liveGrading.status === 'ended' ? 'Completed' : 'Active'}
                </span>
              </div>
              <p className="text-sm text-gray-500 dark:text-white/50 mt-0.5">
                Rubric: {liveGrading.rubricName}
              </p>
            </div>
          </div>

          <button
            onClick={handleExportExcel}
            disabled={exporting}
            className="btn-3d-ghost text-sm px-4 py-2 flex items-center gap-2 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {exporting ? 'Exporting...' : 'Export Excel'}
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-2 rounded-full text-sm font-semibold transition-colors ${
                activeTab === tab.id
                  ? 'bg-brand text-white'
                  : 'bg-gray-50 dark:bg-white/5 text-gray-500 dark:text-white/60 hover:bg-gray-100 dark:hover:bg-white/10'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6 animate-fade-in">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="card-night p-5 flex items-center gap-4">
                <div className="w-12 h-12 bg-gray-100 dark:bg-white/10 rounded-lg flex items-center justify-center text-gray-600 dark:text-white/70">
                  <Users className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-sm text-gray-500 dark:text-white/50 font-medium">Students Graded</div>
                  <div className="text-3xl font-bold">
                    {gradedCount}
                    <span className="text-lg text-gray-400 dark:text-white/40 font-normal ml-1">/ {studentCount}</span>
                  </div>
                </div>
              </div>

              <div className="card-night p-5 flex items-center gap-4">
                <div className="w-12 h-12 bg-gray-100 dark:bg-white/10 rounded-lg flex items-center justify-center text-gray-600 dark:text-white/70">
                  <BarChart3 className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-sm text-gray-500 dark:text-white/50 font-medium">Average Score</div>
                  <div className="text-3xl font-bold">{Math.round(avgScore * 10) / 10}</div>
                </div>
              </div>

              <div className="card-night p-5 flex items-center gap-4">
                <div className="w-12 h-12 bg-gray-100 dark:bg-white/10 rounded-lg flex items-center justify-center text-gray-600 dark:text-white/70">
                  <TrendingUp className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-sm text-gray-500 dark:text-white/50 font-medium">Average Percentage</div>
                  <div className="text-3xl font-bold">
                    {Math.round(avgPercentage)}<span className="text-lg text-gray-400 dark:text-white/40 font-normal">%</span>
                  </div>
                </div>
              </div>

              <div className="card-night p-5 flex items-center gap-4">
                <div className="w-12 h-12 bg-gray-100 dark:bg-white/10 rounded-lg flex items-center justify-center text-gray-600 dark:text-white/70">
                  <Award className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-sm text-gray-500 dark:text-white/50 font-medium">Highest Score</div>
                  <div className="text-3xl font-bold">{highestScore}</div>
                </div>
              </div>
            </div>

            {/* Score Distribution */}
            <div className="card-night p-6">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-brand" />
                Score Distribution
              </h3>
              {evaluations.length === 0 ? (
                <div className="text-center py-12 text-gray-400 dark:text-white/40">No evaluations yet.</div>
              ) : (
                <div className="space-y-3">
                  {scoreDistribution.map((bucket) => (
                    <div key={bucket.label} className="flex items-center gap-4">
                      <span className="text-sm text-gray-500 dark:text-white/60 w-20 text-right font-medium shrink-0">{bucket.label}</span>
                      <div className="flex-1 h-8 bg-gray-50 dark:bg-white/5 rounded-lg overflow-hidden relative">
                        <div className={`h-full ${bucket.color} rounded-lg transition-all duration-500`} style={{ width: `${(bucket.count / maxBucketCount) * 100}%` }} />
                      </div>
                      <span className="text-sm font-bold w-10 text-right shrink-0">{bucket.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Students Tab */}
        {activeTab === 'students' && (
          <div className="animate-fade-in">
            {evaluations.length === 0 ? (
              <div className="card-night p-12 text-center text-gray-400 dark:text-white/40">
                <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p className="text-lg font-medium">No evaluations yet</p>
              </div>
            ) : (
              <div className="card-night overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[540px]">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-white/10">
                        <th className="text-left py-3 px-4 text-sm font-semibold text-gray-500 dark:text-white/50 w-12">#</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-gray-500 dark:text-white/50 cursor-pointer select-none" onClick={() => handleSort('name')}>
                          <span className="flex items-center gap-1.5">Student <SortIcon field="name" /></span>
                        </th>
                        <th className="text-center py-3 px-4 text-sm font-semibold text-gray-500 dark:text-white/50 cursor-pointer select-none" onClick={() => handleSort('totalScore')}>
                          <span className="flex items-center justify-center gap-1.5">Score <SortIcon field="totalScore" /></span>
                        </th>
                        <th className="text-center py-3 px-4 text-sm font-semibold text-gray-500 dark:text-white/50 cursor-pointer select-none" onClick={() => handleSort('percentage')}>
                          <span className="flex items-center justify-center gap-1.5">% <SortIcon field="percentage" /></span>
                        </th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-gray-500 dark:text-white/50">Comment</th>
                        <th className="w-10" />
                      </tr>
                    </thead>
                    <tbody>
                      {sortedEvaluations.map((evaluation, idx) => {
                        const isExpanded = expandedStudentId === evaluation.id;
                        return (
                          <Fragment key={evaluation.id}>
                            <tr
                              className="border-b border-gray-100 dark:border-white/5 hover:bg-gray-50 dark:hover:bg-white/5 cursor-pointer transition-colors"
                              onClick={() => toggleExpand(evaluation.id)}
                            >
                              <td className="py-3 px-4 text-sm text-gray-400 dark:text-white/40">{idx + 1}</td>
                              <td className="py-3 px-4 font-medium">{evaluation.studentName}</td>
                              <td className="py-3 px-4 text-center font-bold">
                                {evaluation.totalScore}
                                <span className="text-gray-400 dark:text-white/40 font-normal text-sm ml-1">/ {evaluation.maxPossibleScore}</span>
                              </td>
                              <td className="py-3 px-4 text-center">
                                <span className={`font-bold ${percentageColorClass(evaluation.percentage)}`}>
                                  {Math.round(evaluation.percentage)}%
                                </span>
                              </td>
                              <td className="py-3 px-4 text-sm text-gray-500 dark:text-white/60 max-w-xs truncate">
                                {evaluation.comment || '--'}
                              </td>
                              <td className="py-3 px-2">
                                {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400 dark:text-white/40" /> : <ChevronDown className="w-4 h-4 text-gray-400 dark:text-white/40" />}
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr className="bg-gray-50/50 dark:bg-white/[0.02]">
                                <td colSpan={6} className="px-4 py-4">
                                  <div className="pl-8 space-y-3">
                                    <h4 className="text-sm font-semibold text-gray-600 dark:text-white/70 mb-2">Per-Criterion Breakdown</h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                      {criteria.map((criterion) => {
                                        const evalScore: EvaluationScore | undefined = evaluation.scores[criterion.id];
                                        const score = evalScore?.score ?? 0;
                                        const pct = criterion.maxScore > 0 ? (score / criterion.maxScore) * 100 : 0;
                                        return (
                                          <div key={criterion.id} className="bg-gray-50 dark:bg-white/5 rounded-lg p-3 border border-gray-100 dark:border-white/5">
                                            <div className="flex justify-between items-start mb-1">
                                              <span className="text-sm font-medium text-gray-700 dark:text-white/80 truncate mr-2">{criterion.name}</span>
                                              <span className={`text-sm font-bold shrink-0 ${percentageColorClass(pct)}`}>{score} / {criterion.maxScore}</span>
                                            </div>
                                            {evalScore?.levelLabel && (
                                              <span className="text-xs text-gray-400 dark:text-white/40">{evalScore.levelLabel}</span>
                                            )}
                                            <div className="mt-2 h-1.5 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
                                              <div
                                                className={`h-full rounded-full ${pct >= 70 ? 'bg-success' : pct >= 40 ? 'bg-amber-500' : 'bg-danger'}`}
                                                style={{ width: `${pct}%` }}
                                              />
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                    {evaluation.comment && (
                                      <div className="mt-3 bg-gray-50 dark:bg-white/5 rounded-lg p-3 border border-gray-100 dark:border-white/5">
                                        <span className="text-xs font-semibold text-gray-500 dark:text-white/50 uppercase tracking-wide">Comment</span>
                                        <p className="text-sm text-gray-600 dark:text-white/70 mt-1">{evaluation.comment}</p>
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Criteria Tab */}
        {activeTab === 'criteria' && (
          <div className="space-y-4 animate-fade-in">
            {criteria.length === 0 ? (
              <div className="card-night p-12 text-center text-gray-400 dark:text-white/40">
                <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p className="text-lg font-medium">No criteria found</p>
              </div>
            ) : (
              criteriaStats.map(({ criterion, avg, min, max, quartiles }) => (
                <div key={criterion.id} className="card-night p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                    <div>
                      <h3 className="text-lg font-bold">{criterion.name}</h3>
                      <div className="flex items-center gap-3 mt-1 text-sm text-gray-500 dark:text-white/50">
                        <span className="capitalize">Type: {criterion.type}</span>
                        <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-white/20" />
                        <span>Max: {criterion.maxScore}</span>
                        <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-white/20" />
                        <span>Weight: {criterion.weight}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-brand">{avg}</div>
                        <div className="text-xs text-gray-400 dark:text-white/40">Avg</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-danger">{min}</div>
                        <div className="text-xs text-gray-400 dark:text-white/40">Min</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-success">{max}</div>
                        <div className="text-xs text-gray-400 dark:text-white/40">Max</div>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-gray-400 dark:text-white/40 uppercase tracking-wide">Score Distribution</div>
                    <div className="flex h-6 rounded-lg overflow-hidden bg-gray-50 dark:bg-white/5">
                      {quartiles.map((pct, qi) => {
                        const colors = ['bg-danger', 'bg-amber-500', 'bg-warning', 'bg-success'];
                        const labels = ['0-25%', '25-50%', '50-75%', '75-100%'];
                        if (pct === 0) return null;
                        return (
                          <div
                            key={qi}
                            className={`${colors[qi]} flex items-center justify-center text-[10px] font-bold text-white transition-all duration-500`}
                            style={{ width: `${pct}%` }}
                            title={`${labels[qi]}: ${pct}% of students`}
                          >
                            {pct >= 10 ? `${pct}%` : ''}
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex justify-between text-[10px] text-gray-300 dark:text-white/30">
                      <span>0-25%</span><span>25-50%</span><span>50-75%</span><span>75-100%</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
