import { useEffect, useState } from 'react';
import { collection, query, where, getDocs, orderBy, limit as fbLimit } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuthStore } from '../../stores/authStore';
import { SkeletonCard } from '../../components/Skeleton';
import BackButton from '../../components/BackButton';
import { TrendingUp, Users, Target, Clock, BarChart3, Trophy, ChevronDown } from 'lucide-react';

interface SessionSummary {
  id: string;
  quizId: string;
  quizTitle: string;
  endedAt: number;
  playerCount: number;
  avgAccuracy: number;
  avgScore: number;
}

interface QuestionStat {
  questionId: string;
  questionText: string;
  questionType: string;
  correctPercent: number;
  avgTimeMs: number;
  totalAnswers: number;
  sessionsAppeared: number;
}

type DateRange = '7d' | '30d' | '90d' | 'all';

function toMs(v: unknown): number {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'object' && v !== null && 'seconds' in v) return (v as { seconds: number }).seconds * 1000;
  return 0;
}

export default function Analytics() {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [questionStats, setQuestionStats] = useState<QuestionStat[]>([]);
  const [dateRange, setDateRange] = useState<DateRange>('30d');
  const [tab, setTab] = useState<'overview' | 'questions' | 'trends'>('overview');

  useEffect(() => {
    if (!user) return;
    loadAnalytics();
  }, [user, dateRange]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadAnalytics = async () => {
    if (!user) return;
    setLoading(true);

    const cutoff = dateRange === 'all' ? 0
      : dateRange === '7d' ? Date.now() - 7 * 86400000
      : dateRange === '30d' ? Date.now() - 30 * 86400000
      : Date.now() - 90 * 86400000;

    // Fetch ended sessions
    const sessQ = query(
      collection(db, 'sessions'),
      where('hostId', '==', user.id),
      where('status', '==', 'ended'),
      orderBy('endedAt', 'desc'),
      fbLimit(50)
    );
    const sessSnap = await getDocs(sessQ);

    const quizIds = new Set<string>();
    const rawSessions: { id: string; quizId: string; endedAt: number; top10: { totalPoints: number }[] }[] = [];

    sessSnap.docs.forEach((d) => {
      const data = d.data();
      const endedAt = toMs(data.endedAt);
      if (cutoff > 0 && endedAt < cutoff) return;
      quizIds.add(data.quizId);
      rawSessions.push({
        id: d.id,
        quizId: data.quizId,
        endedAt,
        top10: Array.isArray(data.top10Snapshot) ? data.top10Snapshot : [],
      });
    });

    // Fetch quiz titles
    const quizTitles: Record<string, string> = {};
    const quizIdArr = Array.from(quizIds);
    for (let i = 0; i < quizIdArr.length; i += 10) {
      const batch = quizIdArr.slice(i, i + 10);
      const docs = await getDocs(query(collection(db, 'quizzes'), where('__name__', 'in', batch)));
      docs.forEach((d) => { quizTitles[d.id] = d.data().title || 'Untitled'; });
    }

    // Fetch analytics + answers for each session (parallel, limited)
    const qStatsMap = new Map<string, QuestionStat>();
    const sessionsWithStats: SessionSummary[] = [];

    await Promise.all(rawSessions.slice(0, 30).map(async (sess) => {
      // Fetch analytics subcollection
      const analyticsSnap = await getDocs(collection(db, `sessions/${sess.id}/analytics`));
      const answersSnap = await getDocs(collection(db, `sessions/${sess.id}/answers`));

      // Compute session-level stats
      const playerIds = new Set<string>();
      let totalCorrect = 0;
      let totalAnswers = 0;
      answersSnap.docs.forEach((d) => {
        const a = d.data();
        playerIds.add(a.playerId);
        totalAnswers++;
        if (a.correct) totalCorrect++;
      });

      const playerCount = sess.top10.length > 0 ? sess.top10.length : playerIds.size;
      const avgAccuracy = totalAnswers > 0 ? Math.round((totalCorrect / totalAnswers) * 100) : 0;
      const avgScore = sess.top10.length > 0
        ? Math.round(sess.top10.reduce((s, p) => s + p.totalPoints, 0) / sess.top10.length)
        : 0;

      sessionsWithStats.push({
        id: sess.id,
        quizId: sess.quizId,
        quizTitle: quizTitles[sess.quizId] || 'Untitled',
        endedAt: sess.endedAt,
        playerCount,
        avgAccuracy,
        avgScore,
      });

      // Aggregate question stats
      // First get questions for this quiz
      const questionsSnap = await getDocs(query(collection(db, 'questions'), where('quizId', '==', sess.quizId)));
      const questionMap: Record<string, { text: string; type: string }> = {};
      questionsSnap.docs.forEach((d) => {
        const data = d.data();
        questionMap[d.id] = { text: data.text || '', type: data.type || 'mcq' };
      });

      analyticsSnap.docs.forEach((d) => {
        const data = d.data();
        const qId = d.id;
        const existing = qStatsMap.get(qId);
        const qInfo = questionMap[qId];
        if (existing) {
          existing.correctPercent = (existing.correctPercent * existing.sessionsAppeared + (data.correctPercent || 0)) / (existing.sessionsAppeared + 1);
          existing.avgTimeMs = (existing.avgTimeMs * existing.sessionsAppeared + (data.avgTimeMs || 0)) / (existing.sessionsAppeared + 1);
          existing.totalAnswers += data.totalAnswers || 0;
          existing.sessionsAppeared += 1;
        } else {
          qStatsMap.set(qId, {
            questionId: qId,
            questionText: qInfo?.text || 'Unknown',
            questionType: qInfo?.type || 'mcq',
            correctPercent: data.correctPercent || 0,
            avgTimeMs: data.avgTimeMs || 0,
            totalAnswers: data.totalAnswers || 0,
            sessionsAppeared: 1,
          });
        }
      });
    }));

    sessionsWithStats.sort((a, b) => b.endedAt - a.endedAt);
    setSessions(sessionsWithStats);
    setQuestionStats(Array.from(qStatsMap.values()).sort((a, b) => a.correctPercent - b.correctPercent));
    setLoading(false);
  };

  // Computed metrics
  const totalSessions = sessions.length;
  const totalPlayers = sessions.reduce((s, sess) => s + sess.playerCount, 0);
  const overallAccuracy = totalSessions > 0
    ? Math.round(sessions.reduce((s, sess) => s + sess.avgAccuracy, 0) / totalSessions)
    : 0;
  const overallAvgScore = totalSessions > 0
    ? Math.round(sessions.reduce((s, sess) => s + sess.avgScore, 0) / totalSessions)
    : 0;

  // Hardest and easiest questions
  const hardestQuestions = questionStats.slice(0, 5);
  const easiestQuestions = [...questionStats].sort((a, b) => b.correctPercent - a.correctPercent).slice(0, 5);

  // Trend data (group sessions by week)
  const weeklyTrends = (() => {
    const weeks: { label: string; accuracy: number; players: number; count: number }[] = [];
    const sorted = [...sessions].sort((a, b) => a.endedAt - b.endedAt);
    if (sorted.length === 0) return weeks;

    let weekStart = new Date(sorted[0].endedAt);
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());

    let bucket = { label: '', accuracy: 0, players: 0, count: 0 };

    sorted.forEach((s) => {
      const d = new Date(s.endedAt);
      const wStart = new Date(d);
      wStart.setHours(0, 0, 0, 0);
      wStart.setDate(wStart.getDate() - wStart.getDay());

      if (wStart.getTime() !== weekStart.getTime()) {
        if (bucket.count > 0) {
          bucket.accuracy = Math.round(bucket.accuracy / bucket.count);
          bucket.label = weekStart.toLocaleDateString('en', { month: 'short', day: 'numeric' });
          weeks.push({ ...bucket });
        }
        weekStart = wStart;
        bucket = { label: '', accuracy: 0, players: 0, count: 0 };
      }
      bucket.accuracy += s.avgAccuracy;
      bucket.players += s.playerCount;
      bucket.count++;
    });

    if (bucket.count > 0) {
      bucket.accuracy = Math.round(bucket.accuracy / bucket.count);
      bucket.label = weekStart.toLocaleDateString('en', { month: 'short', day: 'numeric' });
      weeks.push(bucket);
    }
    return weeks;
  })();

  const maxPlayers = Math.max(...weeklyTrends.map((w) => w.players), 1);

  if (loading) {
    return (
      <div className="p-4 sm:p-6 max-w-6xl mx-auto">
        <BackButton to="/dashboard" label="Dashboard" />
        <h1 className="text-2xl font-bold mb-6">Analytics</h1>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
          {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <BackButton to="/dashboard" label="Dashboard" />
          <h1 className="text-2xl font-bold">Analytics</h1>
        </div>
        <div className="relative">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as DateRange)}
            className="appearance-none pl-3 pr-8 py-2 rounded-xl bg-white dark:bg-white/10 border border-gray-200 dark:border-white/10 text-sm font-medium cursor-pointer"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="all">All time</option>
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-gray-400" />
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <StatCard icon={<BarChart3 className="w-5 h-5 text-brand" />} label="Sessions" value={totalSessions} />
        <StatCard icon={<Users className="w-5 h-5 text-purple-400" />} label="Total Players" value={totalPlayers} />
        <StatCard icon={<Target className="w-5 h-5 text-success" />} label="Avg Accuracy" value={`${overallAccuracy}%`} />
        <StatCard icon={<Trophy className="w-5 h-5 text-warning" />} label="Avg Score" value={overallAvgScore.toLocaleString()} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-white/5 p-1 rounded-xl w-fit">
        {(['overview', 'questions', 'trends'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
              tab === t ? 'bg-brand text-white' : 'text-gray-500 dark:text-white/50 hover:text-gray-700 dark:hover:text-white/70'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {tab === 'overview' && (
        <div className="grid lg:grid-cols-2 gap-4 sm:gap-6">
          {/* Hardest Questions */}
          <div className="card-night p-4 sm:p-5">
            <h3 className="text-sm font-bold text-white/60 uppercase tracking-wide mb-4 flex items-center gap-2">
              <Target className="w-4 h-4 text-danger" />
              Hardest Questions
            </h3>
            {hardestQuestions.length === 0 ? (
              <p className="text-white/30 text-sm">No question data yet</p>
            ) : (
              <div className="space-y-3">
                {hardestQuestions.map((q) => (
                  <div key={q.questionId} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white/80 truncate">{q.questionText}</p>
                      <p className="text-xs text-white/40">{q.questionType.toUpperCase()} &middot; {q.totalAnswers} answers</p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`text-sm font-bold ${q.correctPercent < 40 ? 'text-danger' : q.correctPercent < 60 ? 'text-warning' : 'text-success'}`}>
                        {Math.round(q.correctPercent)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Easiest Questions */}
          <div className="card-night p-4 sm:p-5">
            <h3 className="text-sm font-bold text-white/60 uppercase tracking-wide mb-4 flex items-center gap-2">
              <Target className="w-4 h-4 text-success" />
              Easiest Questions
            </h3>
            {easiestQuestions.length === 0 ? (
              <p className="text-white/30 text-sm">No question data yet</p>
            ) : (
              <div className="space-y-3">
                {easiestQuestions.map((q) => (
                  <div key={q.questionId} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white/80 truncate">{q.questionText}</p>
                      <p className="text-xs text-white/40">{q.questionType.toUpperCase()} &middot; {q.totalAnswers} answers</p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-sm font-bold text-success">{Math.round(q.correctPercent)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Sessions */}
          <div className="card-night p-4 sm:p-5 lg:col-span-2">
            <h3 className="text-sm font-bold text-white/60 uppercase tracking-wide mb-4 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Recent Sessions
            </h3>
            {sessions.length === 0 ? (
              <p className="text-white/30 text-sm">No sessions in this period</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-white/40 text-xs uppercase border-b border-white/10">
                      <th className="text-left py-2 font-medium">Quiz</th>
                      <th className="text-center py-2 font-medium">Players</th>
                      <th className="text-center py-2 font-medium">Accuracy</th>
                      <th className="text-center py-2 font-medium">Avg Score</th>
                      <th className="text-right py-2 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.slice(0, 10).map((s) => (
                      <tr key={s.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td className="py-2.5 text-white/80 max-w-48 truncate">{s.quizTitle}</td>
                        <td className="py-2.5 text-center text-white/60">{s.playerCount}</td>
                        <td className="py-2.5 text-center">
                          <span className={`font-medium ${s.avgAccuracy >= 70 ? 'text-success' : s.avgAccuracy >= 50 ? 'text-warning' : 'text-danger'}`}>
                            {s.avgAccuracy}%
                          </span>
                        </td>
                        <td className="py-2.5 text-center text-white/60">{s.avgScore.toLocaleString()}</td>
                        <td className="py-2.5 text-right text-white/40 text-xs">
                          {new Date(s.endedAt).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Questions Tab */}
      {tab === 'questions' && (
        <div className="card-night p-4 sm:p-5">
          <h3 className="text-sm font-bold text-white/60 uppercase tracking-wide mb-4">
            All Questions by Difficulty
          </h3>
          {questionStats.length === 0 ? (
            <p className="text-white/30 text-sm">No question data yet</p>
          ) : (
            <div className="space-y-2">
              {questionStats.map((q) => (
                <div key={q.questionId} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
                  <div className="w-12 text-center shrink-0">
                    <span className={`text-sm font-bold ${q.correctPercent < 40 ? 'text-danger' : q.correctPercent < 60 ? 'text-warning' : 'text-success'}`}>
                      {Math.round(q.correctPercent)}%
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="h-1.5 rounded-full bg-white/10 overflow-hidden mb-1">
                      <div
                        className={`h-full rounded-full transition-all ${q.correctPercent < 40 ? 'bg-danger' : q.correctPercent < 60 ? 'bg-warning' : 'bg-success'}`}
                        style={{ width: `${q.correctPercent}%` }}
                      />
                    </div>
                    <p className="text-sm text-white/80 truncate">{q.questionText}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs text-white/40 uppercase">{q.questionType}</span>
                    <p className="text-xs text-white/30">{(q.avgTimeMs / 1000).toFixed(1)}s avg</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Trends Tab */}
      {tab === 'trends' && (
        <div className="grid lg:grid-cols-2 gap-4 sm:gap-6">
          {/* Weekly Accuracy Chart */}
          <div className="card-night p-4 sm:p-5">
            <h3 className="text-sm font-bold text-white/60 uppercase tracking-wide mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Weekly Accuracy Trend
            </h3>
            {weeklyTrends.length < 2 ? (
              <p className="text-white/30 text-sm">Need at least 2 weeks of data</p>
            ) : (
              <div className="flex items-end gap-1 h-40">
                {weeklyTrends.map((w, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[10px] text-white/50 font-medium">{w.accuracy}%</span>
                    <div
                      className="w-full rounded-t-md bg-gradient-to-t from-brand/60 to-brand transition-all"
                      style={{ height: `${Math.max(w.accuracy, 5)}%` }}
                    />
                    <span className="text-[9px] text-white/30 truncate max-w-full">{w.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Weekly Player Count */}
          <div className="card-night p-4 sm:p-5">
            <h3 className="text-sm font-bold text-white/60 uppercase tracking-wide mb-4 flex items-center gap-2">
              <Users className="w-4 h-4" />
              Weekly Participation
            </h3>
            {weeklyTrends.length < 2 ? (
              <p className="text-white/30 text-sm">Need at least 2 weeks of data</p>
            ) : (
              <div className="flex items-end gap-1 h-40">
                {weeklyTrends.map((w, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[10px] text-white/50 font-medium">{w.players}</span>
                    <div
                      className="w-full rounded-t-md bg-gradient-to-t from-purple-500/60 to-purple-400 transition-all"
                      style={{ height: `${Math.max((w.players / maxPlayers) * 100, 5)}%` }}
                    />
                    <span className="text-[9px] text-white/30 truncate max-w-full">{w.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Question Type Breakdown */}
          <div className="card-night p-4 sm:p-5 lg:col-span-2">
            <h3 className="text-sm font-bold text-white/60 uppercase tracking-wide mb-4">
              Accuracy by Question Type
            </h3>
            {(() => {
              const typeMap = new Map<string, { correct: number; total: number }>();
              questionStats.forEach((q) => {
                const t = typeMap.get(q.questionType) || { correct: 0, total: 0 };
                t.correct += q.correctPercent * q.totalAnswers / 100;
                t.total += q.totalAnswers;
                typeMap.set(q.questionType, t);
              });
              const types = Array.from(typeMap.entries()).map(([type, data]) => ({
                type,
                accuracy: data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0,
                total: data.total,
              })).sort((a, b) => a.accuracy - b.accuracy);

              if (types.length === 0) return <p className="text-white/30 text-sm">No data</p>;

              return (
                <div className="space-y-3">
                  {types.map((t) => (
                    <div key={t.type} className="flex items-center gap-3">
                      <span className="w-20 text-xs text-white/60 uppercase font-medium shrink-0">{t.type}</span>
                      <div className="flex-1 h-3 rounded-full bg-white/10 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${t.accuracy < 40 ? 'bg-danger' : t.accuracy < 60 ? 'bg-warning' : 'bg-success'}`}
                          style={{ width: `${t.accuracy}%` }}
                        />
                      </div>
                      <span className="text-sm font-bold text-white/70 w-12 text-right">{t.accuracy}%</span>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="card-night p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs text-white/50 font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}
