import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';
import { useToastStore } from '../../stores/toastStore';
import { useSessionAnalytics } from '../../hooks/useSessionAnalytics';
import { exportSessionExcel } from '../../lib/excelExport';
import Leaderboard from '../../components/Leaderboard';
import BarChart from '../../components/charts/BarChart';
import LineChart from '../../components/charts/LineChart';
// import HorizontalBarChart from '../../components/charts/HorizontalBarChart';
import {
  Download, FileSpreadsheet, ArrowLeft, Users, Target, Trophy, Clock,
  ChevronDown, ChevronUp, ShieldAlert,
  HelpCircle, Tag, CheckCircle2, XCircle, ListOrdered, AlignLeft,
  ArrowLeftRight, PenLine, MessageSquare, Presentation,
  Printer, Mail, Share2, Trash2, MoreVertical, Check, X,
  Eye, Zap, Search, Filter, ArrowUpDown
} from 'lucide-react';

type TabId = 'overview' | 'participants' | 'questions' | 'tags' | 'anti-cheating';

const TABS: { id: TabId; label: string; count?: number; hasBadge?: boolean }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'participants', label: 'Participants' },
  { id: 'questions', label: 'Questions' },
  { id: 'tags', label: 'Tags', hasBadge: true },
  { id: 'anti-cheating', label: 'Anti-cheating', count: 0 }, // count updated in component
];

const TYPE_LABELS: Record<string, string> = {
  mcq: 'Multiple Choice',
  tf: 'True / False',
  short: 'Short Answer',
  matching: 'Matching',
  fill_blank: 'Fill in the Blank',
  ordering: 'Ordering',
  poll: 'Poll',
  slide: 'Slide',
};

const TYPE_ICONS: Record<string, React.ReactNode> = {
  mcq: <CheckCircle2 className="w-5 h-5" />,
  tf: <XCircle className="w-5 h-5" />,
  short: <AlignLeft className="w-5 h-5" />,
  matching: <ArrowLeftRight className="w-5 h-5" />,
  fill_blank: <PenLine className="w-5 h-5" />,
  ordering: <ListOrdered className="w-5 h-5" />,
  poll: <MessageSquare className="w-5 h-5" />,
  slide: <Presentation className="w-5 h-5" />,
};

// Colors matching the screenshot design
const COLORS = {
  correct: '#00C985', // Green
  incorrect: '#FF3B5C', // Red
  partial: '#FF9500', // Orange
  unattempted: '#E2E8F0', // Grey
};

export default function SessionResults() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [exporting, setExporting] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [expandedQuestion, setExpandedQuestion] = useState<number | null>(null);
  const { addToast } = useToastStore();

  const {
    loading,
    sessionPin,
    quizTitle,
    analytics,
    playerCount,
    avgScore,
    avgAccuracy,
    sessionDuration,
    answerDistributions,
    violations,
    playerStats,
  } = useSessionAnalytics(sessionId);

  // Update tabs with violation count
  const tabs = useMemo(() => TABS.map(t => 
    t.id === 'anti-cheating' ? { ...t, count: violations.length } : t
  ), [violations.length]);

  const completionRate = useMemo(() => {
    if (!playerStats.length || !analytics.length) return 0;
    const totalExpected = playerStats.length * analytics.length;
    let totalAnswered = 0;
    playerStats.forEach(p => {
       totalAnswered += p.totalAnswers;
    });
    return Math.round((totalAnswered / totalExpected) * 100) || 0;
  }, [playerStats, analytics]);

  // Group answer distributions by question type for Tags tab
  const typeGroups = useMemo(() => {
    const groups = new Map<string, {
      questions: typeof answerDistributions;
      totalCorrect: number;
      totalAnswers: number;
      totalTimeMs: number;
    }>();

    for (const dist of answerDistributions) {
      const type = dist.questionType || 'mcq';
      const existing = groups.get(type) || { questions: [], totalCorrect: 0, totalAnswers: 0, totalTimeMs: 0 };
      existing.questions.push(dist);

      // Aggregate stats from analytics
      const analytic = analytics.find((a) => a.questionIndex === dist.questionIndex);
      if (analytic) {
        existing.totalCorrect += analytic.correctCount;
        existing.totalAnswers += analytic.totalAnswers;
        existing.totalTimeMs += analytic.avgTimeMs * analytic.totalAnswers;
      }

      groups.set(type, existing);
    }

    return groups;
  }, [answerDistributions, analytics]);

  const handleExportCsv = async () => {
    if (!sessionId) return;
    setExporting(true);
    try {
      const fn = httpsCallable<{ sessionId: string }, { csv: string }>(functions, 'exportCsv');
      const result = await fn({ sessionId });
      const blob = new Blob([result.data.csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `session_${sessionId}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      addToast('error', 'CSV export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const handleExportExcel = async () => {
    setExportingExcel(true);
    try {
      await exportSessionExcel({
        quizTitle,
        sessionPin,
        playerStats,
        analytics,
        playerCount,
        avgScore,
        avgAccuracy,
      });
    } catch {
      addToast('error', 'Excel export failed. Please try again.');
    } finally {
      setExportingExcel(false);
    }
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  if (!sessionId) return null;

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-48 bg-gray-200 rounded-lg" />
          <div className="flex gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 w-28 bg-gray-200 rounded-full" />
            ))}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 bg-gray-100 rounded-2xl" />
            ))}
          </div>
          <div className="h-64 bg-gray-100 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <button onClick={() => navigate('/history')} className="text-sm text-gray-400 hover:text-brand flex items-center gap-1">
              <ArrowLeft className="w-3 h-3" /> History
            </button>
            <span className="text-gray-300">|</span>
            <button onClick={() => navigate('/dashboard')} className="text-sm text-gray-400 hover:text-brand">
              Dashboard
            </button>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{quizTitle}</h1>
          {sessionPin && <p className="text-gray-500 mt-1">PIN: {sessionPin}</p>}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExportCsv}
            disabled={exporting}
            className="px-5 py-2.5 bg-brand text-white font-semibold rounded-xl border-2 border-gray-800 dark:border-gray-300 hover:shadow-[6px_6px_0px_0px_#D4566B] hover:translate-x-[-2px] hover:translate-y-[-2px] transition-all duration-300 disabled:opacity-50 flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            {exporting ? 'Exporting...' : 'Export CSV'}
          </button>
          <button
            onClick={handleExportExcel}
            disabled={exportingExcel}
            className="px-5 py-2.5 bg-success text-white font-semibold rounded-xl border-2 border-gray-800 dark:border-gray-300 shadow-[4px_4px_0px_0px_#4A6331] hover:shadow-[6px_6px_0px_0px_#4A6331] hover:translate-x-[-2px] hover:translate-y-[-2px] transition-all duration-300 disabled:opacity-50 flex items-center gap-2"
          >
            <FileSpreadsheet className="w-4 h-4" />
            {exportingExcel ? 'Exporting...' : 'Export Excel'}
          </button>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="overflow-x-auto no-scrollbar mb-8">
        <div className="flex border-b border-gray-200 min-w-max">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative px-5 py-3 text-sm font-semibold whitespace-nowrap flex items-center gap-2 transition-colors duration-200 ${
                activeTab === tab.id
                  ? 'text-brand'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.icon}
              {tab.label}
              {activeTab === tab.id && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand rounded-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-8 animate-fade-in">
          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 stagger-children">
            {[
              { icon: <Users className="w-5 h-5" />, label: 'Players', value: playerCount, color: 'text-brand bg-brand/10' },
              { icon: <Trophy className="w-5 h-5" />, label: 'Avg Score', value: avgScore.toLocaleString(), color: 'text-warning bg-warning/10' },
              { icon: <Target className="w-5 h-5" />, label: 'Avg Accuracy', value: `${avgAccuracy}%`, color: 'text-success bg-success/10' },
              { icon: <Clock className="w-5 h-5" />, label: 'Duration', value: sessionDuration ? formatDuration(sessionDuration) : 'N/A', color: 'text-info bg-info/10' },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-2xl border-2 border-gray-800 dark:border-gray-300  p-5 animate-fade-in">
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-9 h-9 rounded-xl ${s.color} flex items-center justify-center`}>
                    {s.icon}
                  </div>
                  <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">{s.label}</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{s.value}</p>
              </div>
            ))}
          </div>

          {/* Question Performance Bar Chart */}
          {analytics.length > 0 && (
            <div className="bg-white rounded-2xl border-2 border-gray-800 dark:border-gray-300 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="font-bold text-gray-900">Question Performance</h2>
                <p className="text-sm text-gray-400 mt-0.5">Accuracy per question</p>
              </div>
              <div className="px-6 py-6">
                <BarChart
                  data={analytics.map((a) => ({
                    label: `Q${a.questionIndex + 1}`,
                    value: Math.round(a.correctPercent),
                  }))}
                  maxValue={100}
                  height={220}
                  unit="%"
                />
              </div>
            </div>
          )}

          {/* Response Time Trend */}
          {responseTimeTrend.length > 0 && (
            <div className="bg-white rounded-2xl border-2 border-gray-800 dark:border-gray-300 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="font-bold text-gray-900">Response Time Trend</h2>
                <p className="text-sm text-gray-400 mt-0.5">Average response time per question</p>
              </div>
              <div className="px-6 py-6">
                <LineChart data={responseTimeTrend} height={200} color="#6366f1" unit="s" />
              </div>
            </div>
          )}

          {/* Compact Leaderboard */}
          <div className="bg-surface-dark rounded-2xl shadow-sm p-6">
            <Leaderboard sessionId={sessionId} compact currentQuestion={analytics.length} totalQuestions={analytics.length} />
          </div>
        </div>
      )}

      {activeTab === 'participants' && (
        <div className="space-y-8 animate-fade-in">
          {/* Player count summary */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand/10 text-brand flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{playerCount}</p>
              <p className="text-sm text-gray-400">Total participants</p>
            </div>
          </div>

          {/* Player Stats Table */}
          {playerStats.length > 0 ? (
            <div className="bg-white rounded-2xl border-2 border-gray-800 dark:border-gray-300 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="font-bold text-gray-900">Player Accuracy</h2>
                <p className="text-sm text-gray-400 mt-0.5">Correct answers percentage per participant</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-sm text-gray-500 border-b border-gray-100">
                      <th className="text-left px-6 py-3 font-medium">#</th>
                      <th className="text-left px-6 py-3 font-medium">Player</th>
                      <th className="text-right px-6 py-3 font-medium">Correct</th>
                      <th className="text-right px-6 py-3 font-medium">Accuracy</th>
                      <th className="text-right px-6 py-3 font-medium">Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {playerStats.map((p, i) => (
                      <tr key={p.playerId} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-3 text-gray-400 font-medium">{i + 1}</td>
                        <td className="px-6 py-3 font-medium text-gray-800">{p.nickname}</td>
                        <td className="px-6 py-3 text-right text-gray-600">{p.correctAnswers}/{p.totalAnswers}</td>
                        <td className="px-6 py-3 text-right">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-sm font-medium ${
                            p.accuracyPercent >= 70 ? 'bg-success/10 text-success' :
                            p.accuracyPercent >= 40 ? 'bg-warning/10 text-warning' :
                            'bg-danger/10 text-danger'
                          }`}>
                            {p.accuracyPercent}%
                          </span>
                        </td>
                        <td className="px-6 py-3 text-right font-semibold text-gray-800">{p.totalPoints.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border-2 border-gray-800 dark:border-gray-300 px-6 py-12 text-center text-gray-400">
              No participant data available
            </div>
          )}

          {/* Full Leaderboard */}
          <div className="bg-surface-dark rounded-2xl shadow-sm p-6">
            <Leaderboard sessionId={sessionId} currentQuestion={analytics.length} totalQuestions={analytics.length} />
          </div>
        </div>
      )}

      {activeTab === 'questions' && (
        <div className="space-y-8 animate-fade-in">
          {/* Per-Question Analytics Table */}
          <div className="bg-white rounded-2xl border-2 border-gray-800 dark:border-gray-300 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">Per-Question Analytics</h2>
            </div>
            {analytics.length === 0 ? (
              <div className="px-6 py-12 text-center text-gray-400">No analytics data available</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-sm text-gray-500 border-b border-gray-100">
                      <th className="text-left px-6 py-3 font-medium">Question</th>
                      <th className="text-right px-6 py-3 font-medium">Responses</th>
                      <th className="text-right px-6 py-3 font-medium">Correct %</th>
                      <th className="text-right px-6 py-3 font-medium">Avg Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.map((a) => (
                      <tr key={a.questionIndex} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 font-medium text-gray-800">Q{a.questionIndex + 1}</td>
                        <td className="px-6 py-4 text-right text-gray-600">{a.totalAnswers}</td>
                        <td className="px-6 py-4 text-right">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-sm font-medium ${
                            a.correctPercent >= 70 ? 'bg-success/10 text-success' :
                            a.correctPercent >= 40 ? 'bg-warning/10 text-warning' :
                            'bg-danger/10 text-danger'
                          }`}>
                            {a.correctPercent.toFixed(0)}%
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right text-gray-600">{(a.avgTimeMs / 1000).toFixed(1)}s</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Answer Distribution Accordion */}
          {answerDistributions.length > 0 && (
            <div className="bg-white rounded-2xl border-2 border-gray-800 dark:border-gray-300 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="font-bold text-gray-900">Answer Distribution</h2>
                <p className="text-sm text-gray-400 mt-0.5">Click a question to see how students answered</p>
              </div>
              <div className="divide-y divide-gray-50">
                {answerDistributions.map((dist) => (
                  <div key={dist.questionIndex}>
                    <button
                      onClick={() => setExpandedQuestion(expandedQuestion === dist.questionIndex ? null : dist.questionIndex)}
                      className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-sm font-semibold text-brand w-8 flex-shrink-0">Q{dist.questionIndex + 1}</span>
                        <span className="text-sm text-gray-700 truncate">{dist.questionText}</span>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className="text-xs text-gray-400">{dist.total} responses</span>
                        {expandedQuestion === dist.questionIndex
                          ? <ChevronUp className="w-4 h-4 text-gray-400" />
                          : <ChevronDown className="w-4 h-4 text-gray-400" />}
                      </div>
                    </button>
                    {expandedQuestion === dist.questionIndex && (
                      <div className="px-6 pb-5 pt-1 animate-slide-down">
                        <HorizontalBarChart data={dist.distribution} total={dist.total} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'tags' && (
        <div className="space-y-6 animate-fade-in">
          {typeGroups.size === 0 ? (
            <div className="bg-white rounded-2xl border-2 border-gray-800 dark:border-gray-300 px-6 py-12 text-center">
              <Tag className="w-10 h-10 mx-auto mb-3 text-gray-300" />
              <p className="text-gray-400">No question type data available</p>
            </div>
          ) : (
            Array.from(typeGroups.entries()).map(([type, group]) => {
              const avgAcc = group.totalAnswers > 0
                ? ((group.totalCorrect / group.totalAnswers) * 100).toFixed(1)
                : '0.0';
              const avgTime = group.totalAnswers > 0
                ? (group.totalTimeMs / group.totalAnswers / 1000).toFixed(1)
                : '0.0';

              return (
                <div key={type} className="bg-white rounded-2xl border-2 border-gray-800 dark:border-gray-300 overflow-hidden">
                  {/* Type Header */}
                  <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-brand/10 text-brand flex items-center justify-center">
                        {TYPE_ICONS[type] || <HelpCircle className="w-5 h-5" />}
                      </div>
                      <div>
                        <h2 className="font-bold text-gray-900">{TYPE_LABELS[type] || type}</h2>
                        <p className="text-sm text-gray-400">{group.questions.length} question{group.questions.length !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <div className="text-right">
                        <p className="font-semibold text-gray-900">{avgAcc}%</p>
                        <p className="text-xs text-gray-400">Avg accuracy</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-gray-900">{avgTime}s</p>
                        <p className="text-xs text-gray-400">Avg time</p>
                      </div>
                    </div>
                  </div>

                  {/* Questions list */}
                  <div className="divide-y divide-gray-50">
                    {group.questions.map((dist) => {
                      const analytic = analytics.find((a) => a.questionIndex === dist.questionIndex);
                      const acc = analytic ? analytic.correctPercent.toFixed(0) : '–';
                      return (
                        <div key={dist.questionIndex} className="px-6 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="text-sm font-semibold text-brand w-8 flex-shrink-0">Q{dist.questionIndex + 1}</span>
                            <span className="text-sm text-gray-700 truncate">{dist.questionText}</span>
                          </div>
                          <span className={`inline-block px-2 py-0.5 rounded-full text-sm font-medium flex-shrink-0 ${
                            Number(acc) >= 70 ? 'bg-success/10 text-success' :
                            Number(acc) >= 40 ? 'bg-warning/10 text-warning' :
                            'bg-danger/10 text-danger'
                          }`}>
                            {acc}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {activeTab === 'anti-cheating' && (
        <div className="space-y-6 animate-fade-in">
          {violations.length === 0 ? (
            <div className="bg-white rounded-2xl border-2 border-gray-800 dark:border-gray-300 px-6 py-16 text-center">
              <ShieldAlert className="w-12 h-12 mx-auto mb-4 text-success/40" />
              <h3 className="text-lg font-bold text-gray-900 mb-1">No suspicious activity detected</h3>
              <p className="text-sm text-gray-400">All participants appear to have played fairly.</p>
            </div>
          ) : (
            <>
              {/* Summary header */}
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-danger/10 text-danger flex items-center justify-center">
                    <ShieldAlert className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{violations.length}</p>
                    <p className="text-sm text-gray-400">Flagged player{violations.length !== 1 ? 's' : ''}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-warning/10 text-warning flex items-center justify-center">
                    <BarChart3 className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">
                      {violations.reduce((sum, v) => sum + v.totalViolations, 0)}
                    </p>
                    <p className="text-sm text-gray-400">Total violations</p>
                  </div>
                </div>
              </div>

              {/* Violations Table */}
              <div className="bg-white rounded-2xl border-2 border-danger/40 overflow-hidden">
                <div className="px-6 py-4 border-b border-danger/10 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-danger" />
                  <h2 className="font-bold text-gray-900">Integrity Alerts</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-sm text-gray-500 border-b border-gray-100">
                        <th className="text-left px-6 py-3 font-medium">Player</th>
                        <th className="text-right px-6 py-3 font-medium">Violations</th>
                        <th className="text-right px-6 py-3 font-medium">Severity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {violations.map((v) => (
                        <tr key={v.playerId} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-3 font-medium text-gray-800">{v.nickname}</td>
                          <td className="px-6 py-3 text-right">
                            <span className="inline-block px-2 py-0.5 rounded-full text-sm font-medium bg-danger/10 text-danger">
                              {v.totalViolations}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-right">
                            <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold uppercase ${
                              v.totalViolations >= 5
                                ? 'bg-danger/10 text-danger'
                                : v.totalViolations >= 3
                                  ? 'bg-warning/10 text-warning'
                                  : 'bg-info/10 text-info'
                            }`}>
                              {v.totalViolations >= 5 ? 'High' : v.totalViolations >= 3 ? 'Medium' : 'Low'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
