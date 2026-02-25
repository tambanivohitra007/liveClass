import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, orderBy, limit, doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuthStore } from '../../stores/authStore';
import { useStudentStats } from '../../hooks/useStudentStats';
import { SkeletonCard, SkeletonStats } from '../../components/Skeleton';
import WaveBackground from '../../components/ui/WaveBackground';
import { Gamepad2, Trophy, Flame, Target, Clock, ArrowRight, ChevronDown, ChevronUp, Check, X } from 'lucide-react';

interface AvailableAssignment {
  id: string;
  quizId: string;
  quizTitle: string;
  startAt: number;
  endAt: number;
  attemptsAllowed: number;
  classroomName?: string;
}

export default function StudentDashboard() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [assignments, setAssignments] = useState<AvailableAssignment[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(true);
  const [expandedGame, setExpandedGame] = useState<string | null>(null);

  const { loading: statsLoading, gamesPlayed, totalPoints, bestStreak, avgAccuracy, recentGames } =
    useStudentStats(user?.id);

  useEffect(() => {
    if (!user) return;
    const loadAssignments = async () => {
      setAssignmentsLoading(true);
      try {
        const assignSnap = await getDocs(
          query(collection(db, 'assignments'), orderBy('startAt', 'desc'), limit(20))
        );

        const assignmentsData: AvailableAssignment[] = [];
        const classroomCache: Record<string, string> = {};
        for (const d of assignSnap.docs) {
          const data = d.data();
          const quizSnap = await getDocs(query(collection(db, 'quizzes'), where('__name__', '==', data.quizId)));
          const quizTitle = quizSnap.docs[0]?.data()?.title || 'Untitled Quiz';

          let classroomName: string | undefined;
          if (data.classroomId) {
            if (classroomCache[data.classroomId]) {
              classroomName = classroomCache[data.classroomId];
            } else {
              try {
                const cDoc = await getDoc(doc(db, 'classrooms', data.classroomId));
                if (cDoc.exists()) {
                  classroomName = cDoc.data().name;
                  classroomCache[data.classroomId] = classroomName!;
                }
              } catch {
                // ignore
              }
            }
          }

          assignmentsData.push({
            id: d.id,
            quizId: data.quizId,
            quizTitle,
            startAt: data.startAt,
            endAt: data.endAt,
            attemptsAllowed: data.attemptsAllowed,
            classroomName,
          });
        }

        setAssignments(assignmentsData);
      } catch {
        // Query failed — show empty state rather than infinite loading
      }
      setAssignmentsLoading(false);
    };
    loadAssignments();
  }, [user]);

  const now = Date.now();
  const activeAssignments = assignments.filter((a) => now >= a.startAt && now <= a.endAt);
  const upcomingAssignments = assignments.filter((a) => now < a.startAt);
  const pastAssignments = assignments.filter((a) => now > a.endAt);

  const loading = statsLoading || assignmentsLoading;

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        <div className="h-8 w-48 bg-gray-200 dark:bg-white/10 rounded-lg animate-pulse" />
        <SkeletonStats />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-linear-to-b from-[#E8EAF0] to-surface dark:from-surface-dark dark:to-surface-dark overflow-hidden">
      <WaveBackground variant="light" position="bottom" />

      <div className="relative z-10 max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-black text-gray-900 dark:text-white">
              Welcome back, {user?.displayName?.split(' ')[0] || 'Student'}
            </h1>
            <p className="text-gray-500 dark:text-white/50 mt-1 font-medium">Your game scores and assignments</p>
          </div>
          <button
            onClick={() => navigate('/join')}
            className="btn-3d-cyan flex items-center gap-2"
          >
            <Gamepad2 className="w-4 h-4" />
            Join a Game
          </button>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 stagger-children">
          {[
            { icon: <Gamepad2 className="w-5 h-5" />, label: 'Games Played', value: gamesPlayed, color: 'text-brand bg-brand/10', shadow: '#D4566B' },
            { icon: <Trophy className="w-5 h-5" />, label: 'Total Points', value: totalPoints.toLocaleString(), color: 'text-warning bg-warning/10', shadow: '#D97706' },
            { icon: <Flame className="w-5 h-5" />, label: 'Best Streak', value: bestStreak, color: 'text-answer-red bg-answer-red/10', shadow: '#EF4444' },
            { icon: <Target className="w-5 h-5" />, label: 'Avg Accuracy', value: `${avgAccuracy}%`, color: 'text-success bg-success/10', shadow: '#22C55E' },
          ].map((s) => (
            <div
              key={s.label}
              className="bg-white dark:bg-white/5 rounded-2xl border-2 border-gray-800 dark:border-white/20 p-5 animate-fade-in"
              style={{ boxShadow: `3px 3px 0px 0px ${s.shadow}` }}
            >
              <div className="flex items-center gap-2 mb-3">
                <div className={`w-9 h-9 rounded-xl ${s.color} flex items-center justify-center`}>
                  {s.icon}
                </div>
                <span className="text-xs font-bold text-gray-400 dark:text-white/40 uppercase tracking-wider">{s.label}</span>
              </div>
              <p className="text-2xl font-black text-gray-900 dark:text-white">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Recent Games */}
        {recentGames.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xl font-black text-gray-900 dark:text-white mb-4">Recent Games</h2>
            <div className="space-y-3">
              {recentGames.map((game) => (
                <div
                  key={game.sessionId}
                  className="card-night card-night-hover overflow-hidden animate-fade-in"
                >
                  <button
                    onClick={() => setExpandedGame(expandedGame === game.sessionId ? null : game.sessionId)}
                    className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50/50 dark:hover:bg-white/10 transition-colors text-left"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="shrink-0 w-10 h-10 bg-brand/10 rounded-xl border-2 border-gray-800 dark:border-white/20 flex items-center justify-center">
                        <Gamepad2 className="w-5 h-5 text-brand" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-gray-900 dark:text-white truncate">{game.quizTitle}</h3>
                        <p className="text-xs text-gray-400 dark:text-white/40 mt-0.5 font-medium">
                          {new Date(game.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <div className="hidden sm:flex items-center gap-3 text-sm">
                        <span className={`font-bold ${
                          game.accuracy >= 70 ? 'text-success' :
                          game.accuracy >= 40 ? 'text-warning' :
                          'text-danger'
                        }`}>
                          {game.accuracy}%
                        </span>
                        <span className="text-gray-600 dark:text-white/70 font-bold">{game.totalPoints.toLocaleString()} pts</span>
                        {game.rank && (
                          <span className="text-xs px-2.5 py-1 bg-brand/10 text-brand rounded-full font-bold border border-brand/20">
                            #{game.rank}
                          </span>
                        )}
                      </div>
                      {expandedGame === game.sessionId
                        ? <ChevronUp className="w-4 h-4 text-gray-400 dark:text-white/40" />
                        : <ChevronDown className="w-4 h-4 text-gray-400 dark:text-white/40" />}
                    </div>
                  </button>

                  {/* Mobile stats row */}
                  <div className="sm:hidden px-5 pb-2 flex items-center gap-3 text-sm">
                    <span className={`font-bold ${
                      game.accuracy >= 70 ? 'text-success' :
                      game.accuracy >= 40 ? 'text-warning' :
                      'text-danger'
                    }`}>
                      {game.accuracy}%
                    </span>
                    <span className="text-gray-600 dark:text-white/70 font-bold">{game.totalPoints.toLocaleString()} pts</span>
                    {game.rank && (
                      <span className="text-xs px-2.5 py-1 bg-brand/10 text-brand rounded-full font-bold border border-brand/20">
                        #{game.rank}
                      </span>
                    )}
                  </div>

                  {/* Expanded drill-down */}
                  {expandedGame === game.sessionId && (
                    <div className="border-t-2 border-gray-200 dark:border-white/10 animate-slide-down">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-xs text-gray-400 dark:text-white/40 border-b-2 border-gray-100 dark:border-white/10">
                              <th className="text-left px-5 py-2.5 font-bold">#</th>
                              <th className="text-left px-3 py-2.5 font-bold">Question</th>
                              <th className="text-left px-3 py-2.5 font-bold">Your Answer</th>
                              <th className="text-left px-3 py-2.5 font-bold">Correct</th>
                              <th className="text-right px-3 py-2.5 font-bold">Time</th>
                              <th className="text-right px-5 py-2.5 font-bold">Points</th>
                            </tr>
                          </thead>
                          <tbody>
                            {game.answers.map((a, idx) => (
                              <tr key={a.questionId} className="border-b border-gray-50 dark:border-white/10">
                                <td className="px-5 py-2.5 text-gray-400 dark:text-white/40 font-bold">{idx + 1}</td>
                                <td className="px-3 py-2.5 text-gray-700 dark:text-white/80 max-w-50 truncate font-medium">{a.questionText}</td>
                                <td className="px-3 py-2.5">
                                  <span className={`inline-flex items-center gap-1 font-bold ${a.correct ? 'text-success' : 'text-danger'}`}>
                                    {a.correct ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                                    {Array.isArray(a.selection) ? a.selection.join(', ') : a.selection}
                                  </span>
                                </td>
                                <td className="px-3 py-2.5 text-gray-500 dark:text-white/50 text-xs font-medium">
                                  {a.correctAnswers.join(', ')}
                                </td>
                                <td className="px-3 py-2.5 text-right text-gray-500 dark:text-white/50 font-medium">{(a.timeMs / 1000).toFixed(1)}s</td>
                                <td className="px-5 py-2.5 text-right font-bold text-gray-800 dark:text-white">{a.pointsAwarded}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Active Assignments */}
        {activeAssignments.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xl font-black text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <div className="w-2.5 h-2.5 bg-success rounded-full animate-pulse" />
              Active Assignments
            </h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {activeAssignments.map((a) => (
                <div
                  key={a.id}
                  className="group card-night card-night-hover flex flex-col"
                >
                  <div className="p-6 flex-1">
                    <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1 bg-success/10 text-success rounded-full font-bold border border-success/20 mb-3">
                      <div className="w-1.5 h-1.5 bg-success rounded-full" />
                      Active
                    </span>
                    <h3 className="font-bold text-gray-900 dark:text-white group-hover:text-brand transition-colors mb-2">{a.quizTitle}</h3>
                    {a.classroomName && (
                      <span className="text-xs text-gray-400 dark:text-white/40 font-medium">from {a.classroomName}</span>
                    )}
                    <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-white/40 font-medium mt-1">
                      <Clock className="w-3.5 h-3.5" />
                      Ends {new Date(a.endAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="px-6 py-4 border-t-2 border-gray-100 dark:border-white/10">
                    <button
                      onClick={() => navigate(`/assignment/${a.id}`)}
                      className="btn-3d-success btn-3d-sm w-full flex items-center justify-center gap-1.5"
                    >
                      Start <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Upcoming Assignments */}
        {upcomingAssignments.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xl font-black text-gray-900 dark:text-white mb-4">Upcoming</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {upcomingAssignments.map((a) => (
                <div key={a.id} className="card-night p-6 opacity-80">
                  <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1 bg-info/10 text-info rounded-full font-bold border border-info/20 mb-3">
                    Upcoming
                  </span>
                  <h3 className="font-bold text-gray-900 dark:text-white mb-2">{a.quizTitle}</h3>
                  {a.classroomName && (
                    <span className="text-xs text-gray-400 dark:text-white/40 font-medium">from {a.classroomName}</span>
                  )}
                  <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-white/40 font-medium mt-1">
                    <Clock className="w-3.5 h-3.5" />
                    Opens {new Date(a.startAt).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Past Assignments */}
        {pastAssignments.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xl font-black text-gray-900 dark:text-white mb-4">Past</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {pastAssignments.map((a) => (
                <div key={a.id} className="bg-white dark:bg-white/5 rounded-2xl border-2 border-gray-300 dark:border-white/15 shadow-[3px_3px_0px_0px_rgba(107,114,128,0.3)] p-6 opacity-60">
                  <span className="inline-flex items-center text-xs px-3 py-1 bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-white/50 rounded-full font-bold mb-3">
                    Ended
                  </span>
                  <h3 className="font-bold text-gray-900 dark:text-white mb-2">{a.quizTitle}</h3>
                  {a.classroomName && (
                    <span className="text-xs text-gray-400 dark:text-white/40 font-medium">from {a.classroomName}</span>
                  )}
                  <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-white/40 font-medium mt-1">
                    <Clock className="w-3.5 h-3.5" />
                    Ended {new Date(a.endAt).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Empty state */}
        {assignments.length === 0 && recentGames.length === 0 && (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl border border-gray-200 dark:border-white/10 bg-brand/10 shadow-sm mb-5">
              <Gamepad2 className="w-10 h-10 text-brand" />
            </div>
            <h3 className="text-xl font-black text-gray-900 dark:text-white mb-2">No games yet</h3>
            <p className="text-gray-500 dark:text-white/50 mb-6 font-medium">Join a live game using a PIN from your teacher</p>
            <button
              onClick={() => navigate('/join')}
              className="btn-3d-cyan"
            >
              Join a Game
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
