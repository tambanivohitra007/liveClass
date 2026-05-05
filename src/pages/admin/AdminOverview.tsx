import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Users, FileText, Radio, GraduationCap, ClipboardList, UserCheck } from 'lucide-react';
import type { User, Quiz, Session, Classroom, Assignment } from '../../types/models';

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function AdminOverview() {
  const [users, setUsers] = useState<User[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let loaded = 0;
    const total = 5;
    const check = () => { loaded++; if (loaded >= total) setLoading(false); };

    const unsubs = [
      onSnapshot(collection(db, 'users'), (snap) => { setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as User))); check(); }),
      onSnapshot(collection(db, 'quizzes'), (snap) => { setQuizzes(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Quiz))); check(); }),
      onSnapshot(collection(db, 'sessions'), (snap) => { setSessions(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Session))); check(); }),
      onSnapshot(collection(db, 'classrooms'), (snap) => { setClassrooms(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Classroom))); check(); }),
      onSnapshot(collection(db, 'assignments'), (snap) => { setAssignments(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Assignment))); check(); }),
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

  const stats = useMemo(() => ({
    totalUsers: users.length,
    teachers: users.filter((u) => u.role === 'teacher').length,
    students: users.filter((u) => u.role === 'student').length,
    quizzes: quizzes.length,
    sessions: sessions.length,
    classrooms: classrooms.length,
    assignments: assignments.length,
  }), [users, quizzes, sessions, classrooms, assignments]);

  const recentSessions = useMemo(() => {
    return [...sessions]
      .sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))
      .slice(0, 5);
  }, [sessions]);

  const statusColor = (status: string) => {
    switch (status) {
      case 'lobby': return 'bg-warning/10 text-warning';
      case 'live': return 'bg-success/10 text-success';
      default: return 'bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-white/50';
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-4 border-brand/30 border-t-brand rounded-full animate-spin" />
      </div>
    );
  }

  const statCards = [
    { label: 'Total Users', value: stats.totalUsers, icon: Users, color: 'text-brand' },
    { label: 'Teachers', value: stats.teachers, icon: UserCheck, color: 'text-accent' },
    { label: 'Students', value: stats.students, icon: GraduationCap, color: 'text-success' },
    { label: 'Quizzes', value: stats.quizzes, icon: FileText, color: 'text-info' },
    { label: 'Sessions', value: stats.sessions, icon: Radio, color: 'text-warning' },
    { label: 'Classrooms', value: stats.classrooms, icon: GraduationCap, color: 'text-[#8B5CF6]' },
  ];

  return (
    <div>
      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="bg-white dark:bg-white/5 rounded-xl border border-gray-100 dark:border-white/10 px-4 py-3 text-center">
              <Icon className={`w-5 h-5 ${card.color} mx-auto mb-1`} />
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{card.value}</p>
              <p className="text-xs text-gray-500 dark:text-white/50">{card.label}</p>
            </div>
          );
        })}
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-white dark:bg-white/5 rounded-xl border border-gray-100 dark:border-white/10 px-4 py-3 text-center">
          <p className="text-2xl font-bold text-success">{sessions.filter((s) => s.status === 'live' || s.status === 'lobby').length}</p>
          <p className="text-xs text-gray-500 dark:text-white/50">Active Sessions</p>
        </div>
        <div className="bg-white dark:bg-white/5 rounded-xl border border-gray-100 dark:border-white/10 px-4 py-3 text-center">
          <ClipboardList className="w-5 h-5 text-warning mx-auto mb-1" />
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.assignments}</p>
          <p className="text-xs text-gray-500 dark:text-white/50">Assignments</p>
        </div>
      </div>

      {/* Recent Sessions */}
      <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">Recent Sessions</h2>
      {recentSessions.length === 0 ? (
        <div className="text-center py-10 bg-white dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/10">
          <Radio className="w-10 h-10 text-gray-300 dark:text-white/30 mx-auto mb-3" />
          <p className="text-gray-400 dark:text-white/40">No sessions yet</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/10 shadow-sm overflow-hidden divide-y divide-gray-50 dark:divide-white/10">
          {recentSessions.map((session) => {
            const quiz = quizMap[session.quizId];
            const host = userMap[session.hostId];
            return (
              <div key={session.id} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50/50 dark:hover:bg-white/5 transition-colors">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-900 dark:text-white text-sm truncate">
                    {quiz?.title || 'Unknown Quiz'}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-white/40">
                    by {host?.displayName || 'Unknown'}
                  </p>
                </div>
                <div className="flex items-center gap-3 ml-3 shrink-0">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(session.status)}`}>
                    {session.status}
                  </span>
                  <span className="text-xs text-gray-400 dark:text-white/40">
                    {session.startedAt ? timeAgo(session.startedAt) : '—'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
