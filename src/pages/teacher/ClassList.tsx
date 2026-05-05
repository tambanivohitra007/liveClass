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
        <div className="h-8 w-48 bg-gray-200 dark:bg-white/10 rounded-lg animate-pulse" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-b from-[#E8EAF0] to-surface dark:from-surface-dark dark:to-surface-dark">
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">My Classes</h1>
          <p className="text-gray-500 dark:text-white/50 mt-1 text-sm">Create and manage your classrooms</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="btn-3d-orange btn-3d-sm flex items-center gap-2 text-sm"
        >
          <Plus className="w-4 h-4" />
          Create Class
        </button>
      </div>

      {/* Grid */}
      {classrooms.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-20 h-20 bg-gray-100 dark:bg-white/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Users className="w-10 h-10 text-gray-300 dark:text-white/30" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">No classes yet</h3>
          <p className="text-gray-500 dark:text-white/50 mb-6 text-sm">Create your first class to start managing students</p>
          <button
            onClick={() => setShowModal(true)}
            className="btn-3d-orange"
          >
            Create your first class
          </button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 stagger-children">
          {classrooms.map((cls) => {
            const isExpired = Date.now() > cls.joinCodeExpiresAt;
            const bgClass = CARD_GRADIENTS[cls.color] || DEFAULT_GRADIENT;

            return (
              <div
                key={cls.id}
                onClick={() => navigate(`/classroom/${cls.id}`)}
                className="group relative flex flex-col pt-4 animate-fade-in cursor-pointer h-full"
              >
                {/* Folder Tab */}
                <div 
                  className={`absolute top-0.5 left-0 w-1/3 h-6 rounded-t-xl z-0 transition-all duration-300 group-hover:-translate-y-1 ${bgClass}`} 
                />
                
                {/* Folder Body (Card) */}
                <div className="relative z-10 flex-1 flex flex-col bg-white dark:bg-[#1E1E24] rounded-tr-2xl rounded-b-2xl shadow-sm border border-gray-200 dark:border-white/5 overflow-hidden transition-all duration-300 group-hover:shadow-lg dark:group-hover:shadow-black/50">
                  
                  {/* Color Strip */}
                  <div className={`h-1.5 w-full ${bgClass}`} />
                  
                  {/* Content */}
                  <div className="p-5 flex-1 flex flex-col">
                    <div className="flex justify-between items-start mb-2">
                       <h3 className="font-bold text-lg leading-tight text-gray-900 dark:text-white group-hover:text-brand transition-colors line-clamp-1">
                        {cls.name}
                      </h3>
                      {cls.ownerId !== user?.id && (
                        <div className="shrink-0 px-2 py-0.5 bg-gray-100 dark:bg-white/10 rounded text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Co-teacher
                        </div>
                      )}
                    </div>
                   
                    {cls.description && (
                      <p className="text-sm text-gray-500 dark:text-white/50 line-clamp-2 mb-4 min-h-[2.5rem]">{cls.description}</p>
                    )}

                    <div className="mt-auto pt-4 border-t border-gray-100 dark:border-white/5 flex items-center justify-between">
                       {/* Stats */}
                      <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-white/50">
                        <span className="flex items-center gap-1.5" title="Students">
                          <Users className="w-4 h-4" />
                          {cls.studentCount}
                        </span>
                        {cls.coTeacherCount > 0 && (
                          <span className="flex items-center gap-1.5" title="Co-teachers">
                            <UserPlus className="w-4 h-4" />
                            {cls.coTeacherCount}
                          </span>
                        )}
                      </div>

                      {/* Code */}
                      <div className="flex items-center gap-2">
                         <div className="flex flex-col items-end">
                            <span className="font-mono text-xs font-bold text-gray-900 dark:text-white tracking-wider bg-gray-100 dark:bg-white/10 px-2 py-0.5 rounded">
                              {cls.joinCode}
                            </span>
                            {isExpired && (
                              <span className="text-[10px] text-danger flex items-center gap-0.5 mt-0.5">
                                <AlertTriangle className="w-3 h-3" /> Expired
                              </span>
                            )}
                         </div>
                         <button
                            onClick={(e) => { e.stopPropagation(); copyCode(cls.joinCode); }}
                            className="p-1.5 rounded-lg text-gray-400 dark:text-white/40 hover:text-brand hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                            title="Copy code"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Create placeholder */}
          <button
            onClick={() => setShowModal(true)}
            className="group relative flex flex-col pt-4 min-h-60 animate-fade-in w-full text-left"
          >
            {/* Dashed Folder Tab */}
            <div className="absolute top-0.5 left-0 w-1/3 h-6 rounded-t-xl bg-transparent border-t-2 border-l-2 border-r-2 border-dashed border-gray-300 dark:border-white/20 border-b-0 z-0 transition-all duration-300 group-hover:-translate-y-1 group-hover:border-brand/50 group-hover:bg-brand/5" />

            {/* Dashed Folder Body */}
            <div className="relative z-10 flex-1 w-full flex flex-col items-center justify-center border-2 border-dashed border-gray-300 dark:border-white/20 rounded-tr-2xl rounded-b-2xl bg-transparent hover:bg-brand/5 hover:border-brand/50 transition-all duration-200 group/create">
              <div className="w-14 h-14 rounded-full bg-gray-100 dark:bg-white/10 flex items-center justify-center text-gray-400 dark:text-white/40 group-hover/create:bg-brand group-hover/create:text-white transition-all mb-4 hover-jelly">
                <Plus className="w-7 h-7" />
              </div>
              <span className="font-bold text-gray-500 dark:text-white/50 group-hover/create:text-brand transition-colors">New Class</span>
            </div>
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
            className="card-night w-full max-w-md animate-bounce-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 pb-0">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">New Class</h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-gray-400 dark:text-white/40 transition-colors">
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-white/70 mb-1.5">Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Biology 101"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none text-gray-900 dark:text-white"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-white/70 mb-1.5">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional description"
                  rows={2}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none text-gray-900 dark:text-white resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-white/70 mb-1.5">Color</label>
                <div className="flex gap-2">
                  {COLLECTION_COLORS.map((c) => (
                    <button
                      key={c.key}
                      onClick={() => setColor(c.key)}
                      className={`w-8 h-8 rounded-full ${c.bg} border border-gray-300 dark:border-white/20 transition-all ${color === c.key ? 'ring-2 ring-offset-2 ring-gray-400 dark:ring-white/50 dark:ring-offset-surface-dark scale-110' : 'hover:scale-105'}`}
                      title={c.label}
                    />
                  ))}
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleCreate}
                  disabled={creating || !name.trim()}
                  className="btn-3d-orange btn-3d-sm flex-1 disabled:opacity-50 flex items-center justify-center gap-2"
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
                  className="btn-3d-ghost px-5"
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
