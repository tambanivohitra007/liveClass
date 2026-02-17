import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuthStore } from '../../stores/authStore';
import { SkeletonCard, SkeletonStats } from '../../components/Skeleton';
import { Gamepad2, ClipboardList, Trophy, Flame, Clock, ArrowRight } from 'lucide-react';

interface AvailableAssignment {
  id: string;
  quizId: string;
  quizTitle: string;
  startAt: number;
  endAt: number;
  attemptsAllowed: number;
}

export default function StudentDashboard() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [assignments, setAssignments] = useState<AvailableAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ totalGames: 0, totalPoints: 0, bestStreak: 0, avgAccuracy: 0 });

  useEffect(() => {
    if (!user) return;
    const loadData = async () => {
      setLoading(true);

      // Load game history from answers where this user participated
      const answersSnap = await getDocs(
        query(collection(db, 'sessions'), limit(50))
      );

      // Load assignments
      const assignSnap = await getDocs(
        query(collection(db, 'assignments'), orderBy('startAt', 'desc'), limit(20))
      );

      // Get quiz titles for assignments
      const assignmentsData: AvailableAssignment[] = [];
      for (const d of assignSnap.docs) {
        const data = d.data();
        const quizSnap = await getDocs(query(collection(db, 'quizzes'), where('__name__', '==', data.quizId)));
        const quizTitle = quizSnap.docs[0]?.data()?.title || 'Untitled Quiz';
        assignmentsData.push({
          id: d.id,
          quizId: data.quizId,
          quizTitle,
          startAt: data.startAt,
          endAt: data.endAt,
          attemptsAllowed: data.attemptsAllowed,
        });
      }

      setAssignments(assignmentsData);

      // Compute stats
      const gamesPlayed = answersSnap.size;
      setStats({
        totalGames: gamesPlayed,
        totalPoints: 0,
        bestStreak: 0,
        avgAccuracy: 0,
      });

      setLoading(false);
    };
    loadData();
  }, [user]);

  const now = Date.now();

  const activeAssignments = assignments.filter((a) => now >= a.startAt && now <= a.endAt);
  const upcomingAssignments = assignments.filter((a) => now < a.startAt);
  const pastAssignments = assignments.filter((a) => now > a.endAt);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        <div className="h-8 w-48 bg-gray-200 rounded-lg animate-pulse" />
        <SkeletonStats />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome back, {user?.displayName?.split(' ')[0] || 'Student'}
          </h1>
          <p className="text-gray-500 mt-1">Your game scores and assignments</p>
        </div>
        <button
          onClick={() => navigate('/join')}
          className="px-5 py-2.5 bg-brand text-white font-semibold rounded-xl hover:bg-brand-dark transition-colors flex items-center gap-2"
        >
          <Gamepad2 className="w-4 h-4" />
          Join a Game
        </button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 stagger-children">
        {[
          { icon: <Gamepad2 className="w-5 h-5" />, label: 'Games Played', value: stats.totalGames, color: 'text-brand bg-brand/10' },
          { icon: <Trophy className="w-5 h-5" />, label: 'Total Points', value: stats.totalPoints.toLocaleString(), color: 'text-warning bg-warning/10' },
          { icon: <Flame className="w-5 h-5" />, label: 'Best Streak', value: stats.bestStreak, color: 'text-answer-red bg-answer-red/10' },
          { icon: <ClipboardList className="w-5 h-5" />, label: 'Assignments', value: assignments.length, color: 'text-success bg-success/10' },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 animate-fade-in">
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-8 h-8 rounded-lg ${s.color} flex items-center justify-center`}>
                {s.icon}
              </div>
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">{s.label}</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Active Assignments */}
      {activeAssignments.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <div className="w-2 h-2 bg-success rounded-full animate-pulse" />
            Active Assignments
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeAssignments.map((a) => (
              <div key={a.id} className="bg-white rounded-2xl border-2 border-success/20 shadow-sm hover:shadow-md transition-all group">
                <div className="p-6">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs px-2 py-0.5 bg-success/10 text-success rounded-full font-medium">Active</span>
                  </div>
                  <h3 className="font-semibold text-gray-900 group-hover:text-brand transition-colors mb-2">{a.quizTitle}</h3>
                  <div className="flex items-center gap-1 text-xs text-gray-400">
                    <Clock className="w-3 h-3" />
                    Ends {new Date(a.endAt).toLocaleDateString()}
                  </div>
                </div>
                <div className="px-6 py-3 border-t border-gray-50">
                  <button
                    onClick={() => navigate(`/assignment/${a.id}`)}
                    className="w-full py-2 text-sm font-medium text-white bg-success hover:brightness-110 rounded-lg transition-colors flex items-center justify-center gap-1"
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
          <h2 className="text-lg font-bold text-gray-900 mb-4">Upcoming</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {upcomingAssignments.map((a) => (
              <div key={a.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 opacity-80">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs px-2 py-0.5 bg-info/10 text-info rounded-full font-medium">Upcoming</span>
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">{a.quizTitle}</h3>
                <div className="flex items-center gap-1 text-xs text-gray-400">
                  <Clock className="w-3 h-3" />
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
          <h2 className="text-lg font-bold text-gray-900 mb-4">Past</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {pastAssignments.map((a) => (
              <div key={a.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 opacity-60">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full font-medium">Ended</span>
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">{a.quizTitle}</h3>
                <div className="flex items-center gap-1 text-xs text-gray-400">
                  <Clock className="w-3 h-3" />
                  Ended {new Date(a.endAt).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Empty state */}
      {assignments.length === 0 && (
        <div className="text-center py-16">
          <div className="w-20 h-20 bg-brand/10 rounded-3xl flex items-center justify-center mx-auto mb-4">
            <Gamepad2 className="w-10 h-10 text-brand" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No assignments yet</h3>
          <p className="text-gray-500 mb-6">Join a live game using a PIN from your teacher</p>
          <button
            onClick={() => navigate('/join')}
            className="px-6 py-3 bg-brand text-white font-semibold rounded-xl hover:bg-brand-dark transition-colors"
          >
            Join a Game
          </button>
        </div>
      )}
    </div>
  );
}
