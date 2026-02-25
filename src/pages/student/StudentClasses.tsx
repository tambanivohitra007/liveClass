import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collectionGroup, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuthStore } from '../../stores/authStore';
import { SkeletonCard } from '../../components/Skeleton';
import WaveBackground from '../../components/ui/WaveBackground';
import { Users, UserPlus, BookOpen } from 'lucide-react';
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

export default function StudentClasses() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collectionGroup(db, 'members'),
      where('userId', '==', user.id),
      where('role', '==', 'student')
    );

    const unsub = onSnapshot(q, async (snapshot) => {
      const classroomIds = snapshot.docs
        .map((d) => d.ref.parent.parent?.id)
        .filter(Boolean) as string[];

      const results: Classroom[] = [];
      for (const id of classroomIds) {
        const cDoc = await getDoc(doc(db, 'classrooms', id));
        if (cDoc.exists()) {
          results.push({ id: cDoc.id, ...cDoc.data() } as Classroom);
        }
      }

      setClassrooms(results);
      setLoading(false);
    });

    return unsub;
  }, [user]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        <div className="h-8 w-48 bg-gray-200 dark:bg-white/10 rounded-lg animate-pulse" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-linear-to-b from-[#E8EAF0] to-surface dark:from-surface-dark dark:to-surface-dark overflow-hidden">
      <WaveBackground variant="light" position="bottom" />

      <div className="relative z-10 max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">My Classes</h1>
            <p className="text-gray-500 dark:text-white/50 mt-1 text-sm">View your enrolled classrooms</p>
          </div>
          <button
            onClick={() => navigate('/join-class')}
            className="px-5 py-2.5 bg-brand text-white font-semibold rounded-xl shadow-[2px_2px_0px_0px_rgba(212,86,107,0.25)] hover:shadow-[3px_3px_0px_0px_rgba(212,86,107,0.3)] hover:-translate-x-px hover:-translate-y-px transition-all duration-200 flex items-center gap-2 text-sm"
          >
            <UserPlus className="w-4 h-4" />
            Join a Class
          </button>
        </div>

        {/* Grid */}
        {classrooms.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-20 h-20 bg-gray-100 dark:bg-white/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <BookOpen className="w-10 h-10 text-gray-300 dark:text-white/30" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">You haven't joined any classes yet</h3>
            <p className="text-gray-500 dark:text-white/50 mb-6 text-sm">Join a class using a code from your teacher</p>
            <button
              onClick={() => navigate('/join-class')}
              className="px-6 py-3 bg-brand text-white font-semibold rounded-xl shadow-[2px_2px_0px_0px_rgba(212,86,107,0.25)] hover:shadow-[3px_3px_0px_0px_rgba(212,86,107,0.3)] hover:-translate-x-px hover:-translate-y-px transition-all duration-200"
            >
              Join a Class
            </button>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 stagger-children">
            {classrooms.map((cls) => (
              <div
                key={cls.id}
                onClick={() => navigate(`/student/classroom/${cls.id}`)}
                className="group bg-white dark:bg-white/5 rounded-2xl border border-gray-200 dark:border-white/10 shadow-[3px_3px_0px_0px_rgba(212,86,107,0.15)] hover:shadow-[5px_5px_0px_0px_rgba(212,86,107,0.2)] hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all duration-200 flex flex-col animate-fade-in cursor-pointer"
              >
                {/* Color banner */}
                <div className={`h-24 ${CARD_GRADIENTS[cls.color] || DEFAULT_GRADIENT} relative overflow-hidden rounded-t-2xl`}>
                  <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-white/10" />
                  <div className="absolute right-10 bottom-1 w-16 h-16 rounded-full bg-white/5" />
                  <div className="absolute left-1/2 -top-8 w-32 h-32 rounded-full bg-white/5" />
                </div>

                {/* Card body */}
                <div className="p-5 flex-1 flex flex-col">
                  <h3 className="font-bold text-base leading-tight text-gray-900 dark:text-white group-hover:text-brand transition-colors line-clamp-1 mb-1">
                    {cls.name}
                  </h3>
                  {cls.description && (
                    <p className="text-sm text-gray-500 dark:text-white/50 line-clamp-1 mb-3">{cls.description}</p>
                  )}

                  {/* Stats */}
                  <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-white/50 mt-auto">
                    <span className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" />
                      {cls.studentCount} student{cls.studentCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
