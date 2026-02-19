import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { SkeletonCard } from '../../components/Skeleton';
import WaveBackground from '../../components/ui/WaveBackground';
import { ArrowLeft, Users, Clock, ArrowRight } from 'lucide-react';
import type { Classroom } from '../../types/models';

const CARD_GRADIENTS: Record<string, string> = {
  brand: 'bg-gradient-to-br from-[#E87B91] to-[#B94458]',
  accent: 'bg-gradient-to-br from-[#FFB366] to-[#CC660E]',
  success: 'bg-gradient-to-br from-[#8AAF5E] to-[#4A6331]',
  warning: 'bg-gradient-to-br from-[#FFC94D] to-[#D97706]',
  info: 'bg-gradient-to-br from-[#6B9AD4] to-[#2E5290]',
  purple: 'bg-gradient-to-br from-[#A78BFA] to-[#7C3AED]',
};
const DEFAULT_GRADIENT = 'bg-gradient-to-br from-[#94A3B8] to-[#64748B]';

interface ClassAssignment {
  id: string;
  quizId: string;
  quizTitle: string;
  startAt: number;
  endAt: number;
  attemptsAllowed: number;
}

export default function StudentClassDetail() {
  const { classroomId } = useParams<{ classroomId: string }>();
  const navigate = useNavigate();
  const [classroom, setClassroom] = useState<Classroom | null>(null);
  const [assignments, setAssignments] = useState<ClassAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [assignmentsLoading, setAssignmentsLoading] = useState(true);

  // Fetch classroom doc (real-time)
  useEffect(() => {
    if (!classroomId) return;

    const unsub = onSnapshot(doc(db, 'classrooms', classroomId), (snap) => {
      if (snap.exists()) {
        setClassroom({ id: snap.id, ...snap.data() } as Classroom);
      } else {
        setClassroom(null);
      }
      setLoading(false);
    });

    return unsub;
  }, [classroomId]);

  // Fetch assignments for this classroom
  useEffect(() => {
    if (!classroomId) return;

    const loadAssignments = async () => {
      setAssignmentsLoading(true);
      try {
        const assignSnap = await getDocs(
          query(collection(db, 'assignments'), where('classroomId', '==', classroomId))
        );

        const results: ClassAssignment[] = [];
        for (const d of assignSnap.docs) {
          const data = d.data();
          const quizSnap = await getDocs(
            query(collection(db, 'quizzes'), where('__name__', '==', data.quizId))
          );
          const quizTitle = quizSnap.docs[0]?.data()?.title || 'Untitled Quiz';
          results.push({
            id: d.id,
            quizId: data.quizId,
            quizTitle,
            startAt: data.startAt,
            endAt: data.endAt,
            attemptsAllowed: data.attemptsAllowed,
          });
        }

        setAssignments(results);
      } catch {
        // show empty state
      }
      setAssignmentsLoading(false);
    };

    loadAssignments();
  }, [classroomId]);

  if (loading || assignmentsLoading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        <div className="h-8 w-48 bg-gray-200 rounded-lg animate-pulse" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  if (!classroom) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8 text-center">
        <h2 className="text-xl font-bold text-gray-900 mb-2">Class not found</h2>
        <p className="text-gray-500 mb-4">This class may have been deleted.</p>
        <button
          onClick={() => navigate('/student/classes')}
          className="text-brand font-semibold hover:underline"
        >
          Back to My Classes
        </button>
      </div>
    );
  }

  const now = Date.now();
  const activeAssignments = assignments.filter((a) => now >= a.startAt && now <= a.endAt);
  const upcomingAssignments = assignments.filter((a) => now < a.startAt);
  const pastAssignments = assignments.filter((a) => now > a.endAt);

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-[#E8EAF0] to-surface overflow-hidden">
      <WaveBackground variant="light" position="bottom" />

      <div className="relative z-10 max-w-6xl mx-auto px-4 py-8">
        {/* Back button */}
        <button
          onClick={() => navigate('/student/classes')}
          className="text-sm text-gray-400 hover:text-brand mb-4 flex items-center gap-1"
        >
          <ArrowLeft className="w-3 h-3" /> Back to My Classes
        </button>

        {/* Header card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-[3px_3px_0px_0px_rgba(212,86,107,0.15)] overflow-hidden mb-8">
          <div className={`h-28 ${CARD_GRADIENTS[classroom.color] || DEFAULT_GRADIENT} relative overflow-hidden`}>
            <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-white/10" />
            <div className="absolute right-10 bottom-1 w-16 h-16 rounded-full bg-white/5" />
            <div className="absolute left-1/2 -top-8 w-32 h-32 rounded-full bg-white/5" />
          </div>
          <div className="p-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-1">{classroom.name}</h1>
            {classroom.description && (
              <p className="text-gray-500 text-sm mb-3">{classroom.description}</p>
            )}
            <div className="flex items-center gap-3 text-sm text-gray-500">
              <span className="flex items-center gap-1">
                <Users className="w-3.5 h-3.5" />
                {classroom.studentCount} student{classroom.studentCount !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </div>

        {/* Active Assignments */}
        {activeAssignments.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xl font-black text-gray-900 mb-4 flex items-center gap-2">
              <div className="w-2.5 h-2.5 bg-success rounded-full animate-pulse" />
              Active Assignments
            </h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {activeAssignments.map((a) => (
                <div
                  key={a.id}
                  className="group bg-white rounded-2xl border-2 border-gray-800 shadow-[4px_4px_0px_0px_#22C55E] hover:shadow-[6px_6px_0px_0px_#22C55E] hover:translate-x-[-2px] hover:translate-y-[-2px] transition-all duration-300 flex flex-col"
                >
                  <div className="p-6 flex-1">
                    <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1 bg-success/10 text-success rounded-full font-bold border border-success/20 mb-3">
                      <div className="w-1.5 h-1.5 bg-success rounded-full" />
                      Active
                    </span>
                    <h3 className="font-bold text-gray-900 group-hover:text-brand transition-colors mb-2">{a.quizTitle}</h3>
                    <div className="flex items-center gap-1.5 text-xs text-gray-400 font-medium">
                      <Clock className="w-3.5 h-3.5" />
                      Ends {new Date(a.endAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="px-6 py-4 border-t-2 border-gray-100">
                    <button
                      onClick={() => navigate(`/assignment/${a.id}`)}
                      className="w-full py-2.5 text-sm font-bold text-white bg-success rounded-xl border-2 border-gray-800 shadow-[2px_2px_0px_0px_#22C55E] hover:shadow-[4px_4px_0px_0px_#22C55E] hover:translate-x-[-2px] hover:translate-y-[-2px] transition-all duration-300 flex items-center justify-center gap-1.5"
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
            <h2 className="text-xl font-black text-gray-900 mb-4">Upcoming</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {upcomingAssignments.map((a) => (
                <div key={a.id} className="bg-white rounded-2xl border-2 border-gray-300 shadow-[3px_3px_0px_0px_#2E5290] p-6 opacity-80">
                  <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1 bg-info/10 text-info rounded-full font-bold border border-info/20 mb-3">
                    Upcoming
                  </span>
                  <h3 className="font-bold text-gray-900 mb-2">{a.quizTitle}</h3>
                  <div className="flex items-center gap-1.5 text-xs text-gray-400 font-medium">
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
            <h2 className="text-xl font-black text-gray-900 mb-4">Past</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {pastAssignments.map((a) => (
                <div key={a.id} className="bg-white rounded-2xl border-2 border-gray-300 shadow-[3px_3px_0px_0px_rgba(107,114,128,0.3)] p-6 opacity-60">
                  <span className="inline-flex items-center text-xs px-3 py-1 bg-gray-100 text-gray-500 rounded-full font-bold mb-3">
                    Ended
                  </span>
                  <h3 className="font-bold text-gray-900 mb-2">{a.quizTitle}</h3>
                  <div className="flex items-center gap-1.5 text-xs text-gray-400 font-medium">
                    <Clock className="w-3.5 h-3.5" />
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
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl border-2 border-gray-800 bg-brand/10 shadow-[4px_4px_0px_0px_#D4566B] mb-5">
              <Clock className="w-10 h-10 text-brand" />
            </div>
            <h3 className="text-xl font-black text-gray-900 mb-2">No assignments yet</h3>
            <p className="text-gray-500 font-medium">Your teacher hasn't assigned anything to this class yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
