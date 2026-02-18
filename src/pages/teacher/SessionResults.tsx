import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';
import { useToastStore } from '../../stores/toastStore';
import { useSessionAnalytics } from '../../hooks/useSessionAnalytics';
import Leaderboard from '../../components/Leaderboard';
import BarChart from '../../components/charts/BarChart';
import LineChart from '../../components/charts/LineChart';
import HorizontalBarChart from '../../components/charts/HorizontalBarChart';
import { Download, ArrowLeft, Users, Target, Trophy, Clock, ChevronDown, ChevronUp, ShieldAlert } from 'lucide-react';

export default function SessionResults() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [exporting, setExporting] = useState(false);
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
    responseTimeTrend,
    violations,
  } = useSessionAnalytics(sessionId);

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
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
        <button
          onClick={handleExportCsv}
          disabled={exporting}
          className="px-5 py-2.5 bg-brand text-white font-semibold rounded-xl hover:bg-brand-dark transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          <Download className="w-4 h-4" />
          {exporting ? 'Exporting...' : 'Export CSV'}
        </button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 stagger-children">
        {[
          { icon: <Users className="w-5 h-5" />, label: 'Players', value: playerCount, color: 'text-brand bg-brand/10' },
          { icon: <Trophy className="w-5 h-5" />, label: 'Avg Score', value: avgScore.toLocaleString(), color: 'text-warning bg-warning/10' },
          { icon: <Target className="w-5 h-5" />, label: 'Avg Accuracy', value: `${avgAccuracy}%`, color: 'text-success bg-success/10' },
          { icon: <Clock className="w-5 h-5" />, label: 'Duration', value: sessionDuration ? formatDuration(sessionDuration) : 'N/A', color: 'text-info bg-info/10' },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 animate-fade-in">
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

      {/* Integrity Alerts */}
      {violations.length > 0 && (
        <div className="bg-white rounded-2xl border border-danger/20 shadow-sm overflow-hidden mb-8 animate-fade-in">
          <div className="px-6 py-4 border-b border-danger/10 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-danger" />
            <h2 className="font-bold text-gray-900">Integrity Alerts</h2>
            <span className="ml-auto text-xs text-gray-400">{violations.length} player{violations.length !== 1 ? 's' : ''} flagged</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-sm text-gray-500 border-b border-gray-100">
                  <th className="text-left px-6 py-3 font-medium">Player</th>
                  <th className="text-right px-6 py-3 font-medium">Violations</th>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Question Performance Bar Chart */}
      {analytics.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-8 animate-fade-in">
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
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-8 animate-fade-in">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-bold text-gray-900">Response Time Trend</h2>
            <p className="text-sm text-gray-400 mt-0.5">Average response time per question</p>
          </div>
          <div className="px-6 py-6">
            <LineChart data={responseTimeTrend} height={200} color="#6366f1" unit="s" />
          </div>
        </div>
      )}

      {/* Answer Distribution (Collapsible) */}
      {answerDistributions.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-8 animate-fade-in">
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

      {/* Analytics Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-8">
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

      {/* Leaderboard */}
      <div className="bg-surface-dark rounded-2xl shadow-sm p-6">
        <Leaderboard sessionId={sessionId} />
      </div>
    </div>
  );
}
