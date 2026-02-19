import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, collectionGroup, getDocs, doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../lib/firebase';
import { useAuthStore } from '../../stores/authStore';
import { useToastStore } from '../../stores/toastStore';
import { useNavigate } from 'react-router-dom';
import { SkeletonCard } from '../../components/Skeleton';
import { Plus, Users, UserPlus, Copy, X as XIcon, AlertTriangle } from 'lucide-react';
import { COLLECTION_COLORS } from '../../types/models';
import type { Classroom, ClassroomColor } from '../../types/models';

const CARD_GRADIENTS: Record<string, string> = {
  brand: 'bg-gradient-to-br from-[#E87B91] to-[#B94458]',
  accent: 'bg-gradient-to-br from-[#FFB366] to-[#CC660E]',
  success: 'bg-gradient-to-br from-[#8AAF5E] to-[#4A6331]',
  warning: 'bg-gradient-to-br from-[#FFC94D] to-[#D97706]',
  info: 'bg-gradient-to-br from-[#6B9AD4] to-[#2E5290]',
  purple: 'bg-gradient-to-br from-[#A78BFA] to-[#7C3AED]',
};
const DEFAULT_GRADIENT = 'bg-gradient-to-br from-[#94A3B8] to-[#64748B]';

function daysUntil(ts: number): string {
  const diff = ts - Date.now();
  if (diff <= 0) return 'Expired';
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  if (days === 1) return '1 day left';
  return `${days} days left`;
}

export default function ClassList() {
  const { user } = useAuthStore();
  const { addToast } = useToastStore();
  const navigate = useNavigate();

  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [loading, setLoading] = useState(true);

  // Create modal state
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState<ClassroomColor>('brand');
  const [creating, setCreating] = useState(false);

  // Fetch owned classrooms (real-time)
  useEffect(() => {
    if (!user) return;

    const ownedQuery = query(collection(db, 'classrooms'), where('ownerId', '==', user.id));

    const unsub = onSnapshot(ownedQuery, async (snapshot) => {
      const owned = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Classroom[];

      // Also fetch classrooms where user is a co-teacher
      try {
        const memberSnap = await getDocs(
          query(collectionGroup(db, 'members'), where('userId', '==', user.id), where('role', '==', 'co-teacher'))
        );
        const coTeacherClassIds = memberSnap.docs.map((d) => d.ref.parent.parent?.id).filter(Boolean) as string[];
        const uniqueIds = coTeacherClassIds.filter((id) => !owned.some((c) => c.id === id));

        const coTeacherClasses: Classroom[] = [];
        for (const id of uniqueIds) {
          const cDoc = await getDoc(doc(db, 'classrooms', id));
          if (cDoc.exists()) {
            coTeacherClasses.push({ id: cDoc.id, ...cDoc.data() } as Classroom);
          }
        }

        setClassrooms([...owned, ...coTeacherClasses]);
      } catch {
        setClassrooms(owned);
      }
      setLoading(false);
    });

    return unsub;
  }, [user]);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const fn = httpsCallable<
        { name: string; description: string; color: string },
        { classroomId: string; joinCode: string }
      >(functions, 'createClassroom');
      const result = await fn({ name: name.trim(), description: description.trim(), color });
      addToast('success', `Class "${name.trim()}" created! Join code: ${result.data.joinCode}`);
      setShowModal(false);
      setName('');
      setDescription('');
      setColor('brand');
      navigate(`/classroom/${result.data.classroomId}`);
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to create class');
    } finally {
      setCreating(false);
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    addToast('success', 'Join code copied!');
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        <div className="h-8 w-48 bg-gray-200 rounded-lg animate-pulse" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#E8EAF0] to-surface">
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Classes</h1>
          <p className="text-gray-500 mt-1 text-sm">Create and manage your classrooms</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-5 py-2.5 bg-brand text-white font-semibold rounded-xl shadow-[2px_2px_0px_0px_rgba(212,86,107,0.25)] hover:shadow-[3px_3px_0px_0px_rgba(212,86,107,0.3)] hover:translate-x-[-1px] hover:translate-y-[-1px] transition-all duration-200 flex items-center gap-2 text-sm"
        >
          <Plus className="w-4 h-4" />
          Create Class
        </button>
      </div>

      {/* Grid */}
      {classrooms.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Users className="w-10 h-10 text-gray-300" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No classes yet</h3>
          <p className="text-gray-500 mb-6 text-sm">Create your first class to start managing students</p>
          <button
            onClick={() => setShowModal(true)}
            className="px-6 py-3 bg-brand text-white font-semibold rounded-xl shadow-[2px_2px_0px_0px_rgba(212,86,107,0.25)] hover:shadow-[3px_3px_0px_0px_rgba(212,86,107,0.3)] hover:translate-x-[-1px] hover:translate-y-[-1px] transition-all duration-200"
          >
            Create your first class
          </button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 stagger-children">
          {classrooms.map((cls) => {
            const isExpired = Date.now() > cls.joinCodeExpiresAt;
            return (
              <div
                key={cls.id}
                onClick={() => navigate(`/classroom/${cls.id}`)}
                className="group bg-white rounded-2xl border border-gray-200 shadow-[3px_3px_0px_0px_rgba(212,86,107,0.15)] hover:shadow-[5px_5px_0px_0px_rgba(212,86,107,0.2)] hover:translate-x-[-2px] hover:translate-y-[-2px] transition-all duration-200 flex flex-col animate-fade-in cursor-pointer"
              >
                {/* Color banner */}
                <div className={`h-24 ${CARD_GRADIENTS[cls.color] || DEFAULT_GRADIENT} relative overflow-hidden rounded-t-2xl`}>
                  <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-white/10" />
                  <div className="absolute right-10 bottom-1 w-16 h-16 rounded-full bg-white/5" />
                  <div className="absolute left-1/2 -top-8 w-32 h-32 rounded-full bg-white/5" />
                  {cls.ownerId !== user?.id && (
                    <div className="absolute top-3 left-3 px-2.5 py-1 bg-black/40 backdrop-blur-sm rounded-lg text-[10px] font-bold text-white uppercase tracking-wider">
                      Co-teacher
                    </div>
                  )}
                </div>

                {/* Card body */}
                <div className="p-5 flex-1 flex flex-col">
                  <h3 className="font-bold text-base leading-tight group-hover:text-brand transition-colors line-clamp-1 mb-1">
                    {cls.name}
                  </h3>
                  {cls.description && (
                    <p className="text-sm text-gray-500 line-clamp-1 mb-3">{cls.description}</p>
                  )}

                  {/* Stats */}
                  <div className="flex items-center gap-3 text-sm text-gray-500 mb-4">
                    <span className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" />
                      {cls.studentCount} student{cls.studentCount !== 1 ? 's' : ''}
                    </span>
                    <span className="w-1 h-1 rounded-full bg-gray-300" />
                    <span className="flex items-center gap-1">
                      <UserPlus className="w-3.5 h-3.5" />
                      {cls.coTeacherCount}
                    </span>
                  </div>

                  {/* Join code */}
                  <div className="mt-auto flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2">
                    <div>
                      <span className="font-mono font-bold text-gray-900 tracking-wider">{cls.joinCode}</span>
                      {isExpired ? (
                        <span className="ml-2 text-[10px] font-bold text-danger bg-danger/10 px-1.5 py-0.5 rounded-full inline-flex items-center gap-0.5">
                          <AlertTriangle className="w-2.5 h-2.5" /> Expired
                        </span>
                      ) : (
                        <span className="ml-2 text-[10px] text-gray-400">{daysUntil(cls.joinCodeExpiresAt)}</span>
                      )}
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); copyCode(cls.joinCode); }}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-brand hover:bg-white transition-colors"
                      title="Copy code"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Create placeholder */}
          <button
            onClick={() => setShowModal(true)}
            className="min-h-[240px] flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-2xl hover:border-brand hover:bg-brand/5 transition-all duration-200 group/create"
          >
            <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 group-hover/create:bg-brand group-hover/create:text-white transition-all mb-4 hover-jelly">
              <Plus className="w-7 h-7" />
            </div>
            <span className="font-bold text-gray-500 group-hover/create:text-brand transition-colors">New Class</span>
          </button>
        </div>
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Create Class"
            className="bg-white rounded-2xl border-2 border-gray-800 shadow-[4px_4px_0px_0px_#D4566B] w-full max-w-md animate-bounce-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 pb-0">
              <h3 className="text-lg font-bold text-gray-900">New Class</h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Biology 101"
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-800 focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none text-gray-900"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional description"
                  rows={2}
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-800 focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none text-gray-900 resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Color</label>
                <div className="flex gap-2">
                  {COLLECTION_COLORS.map((c) => (
                    <button
                      key={c.key}
                      onClick={() => setColor(c.key)}
                      className={`w-8 h-8 rounded-full ${c.bg} border-2 border-gray-800 transition-all ${color === c.key ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : 'hover:scale-105'}`}
                      title={c.label}
                    />
                  ))}
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleCreate}
                  disabled={creating || !name.trim()}
                  className="flex-1 py-2.5 bg-brand text-white font-semibold rounded-xl border-2 border-gray-800 shadow-[3px_3px_0px_0px_#D4566B] hover:shadow-[5px_5px_0px_0px_#D4566B] hover:translate-x-[-2px] hover:translate-y-[-2px] transition-all duration-300 disabled:opacity-50 disabled:hover:shadow-[3px_3px_0px_0px_#D4566B] disabled:hover:translate-x-0 disabled:hover:translate-y-0 flex items-center justify-center gap-2"
                >
                  {creating ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Creating...
                    </>
                  ) : 'Create'}
                </button>
                <button
                  onClick={() => setShowModal(false)}
                  className="px-5 py-2.5 border-2 border-gray-800 text-gray-600 font-medium rounded-xl shadow-[2px_2px_0px_0px_#6b7280] hover:shadow-[4px_4px_0px_0px_#6b7280] hover:translate-x-[-1px] hover:translate-y-[-1px] transition-all duration-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}
