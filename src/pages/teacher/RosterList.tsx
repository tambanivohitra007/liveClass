import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, doc, deleteDoc, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuthStore } from '../../stores/authStore';
import { useToastStore } from '../../stores/toastStore';
import { confirmDelete } from '../../lib/swal';
import { useNavigate } from 'react-router-dom';
import { SkeletonCard } from '../../components/Skeleton';
import WaveBackground from '../../components/ui/WaveBackground';
import {
  Plus, Trash2, Users, Search, Pencil, School,
} from 'lucide-react';
import type { Roster } from '../../types/models';

function formatDate(ts: unknown): string {
  if (!ts) return '';
  const ms = typeof ts === 'number'
    ? ts
    : (typeof ts === 'object' && ts !== null && 'toMillis' in ts && typeof (ts as { toMillis: () => number }).toMillis === 'function')
      ? (ts as { toMillis: () => number }).toMillis()
      : 0;
  if (!ms) return '';
  const date = new Date(ms);
  const now = new Date();
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function RosterList() {
  const { user } = useAuthStore();
  const { addToast } = useToastStore();
  const navigate = useNavigate();

  const [rosters, setRosters] = useState<Roster[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);

  // Fetch rosters with real-time updates
  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, 'rosters'), where('ownerId', '==', user.id));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Roster[];
      data.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
      setRosters(data);
      setLoading(false);
    });

    return unsubscribe;
  }, [user]);

  const handleDelete = async (roster: Roster) => {
    const { isConfirmed } = await confirmDelete(roster.name || 'Untitled Roster');
    if (!isConfirmed) return;
    setDeleting(roster.id);
    try {
      // Delete students subcollection first
      const studentsSnap = await getDocs(collection(db, 'rosters', roster.id, 'students'));
      await Promise.all(studentsSnap.docs.map((d) => deleteDoc(d.ref)));
      await deleteDoc(doc(db, 'rosters', roster.id));
      addToast('success', `"${roster.name}" deleted successfully`);
    } catch {
      addToast('error', 'Failed to delete roster. Please try again.');
    } finally {
      setDeleting(null);
    }
  };

  const filtered = rosters.filter((r) =>
    r.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        <div className="h-8 w-48 bg-gray-100 dark:bg-white/10 rounded-lg animate-pulse" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-surface">
      <WaveBackground variant="dark" position="bottom" />
      <div className="absolute inset-0 pattern-stars pointer-events-none" />
      <div className="relative z-10 max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl text-gray-900 dark:text-white">Rosters</h1>
            <p className="text-gray-400 dark:text-white/40 mt-1 text-sm">
              Manage student rosters for grading and sessions
            </p>
          </div>
          <button
            onClick={() => navigate('/roster/new')}
            className="btn-3d-emerald btn-3d-sm flex items-center gap-2 text-sm"
          >
            <Plus className="w-4 h-4" />
            New Roster
          </button>
        </div>

        {/* Search Bar */}
        <div className="flex gap-3 mb-8">
          <div className="relative group flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300 dark:text-white/30 group-focus-within:text-brand transition-colors" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search rosters by name..."
              className="w-full pl-12 pr-4 py-3.5 bg-gray-50 dark:bg-white/5 rounded-xl border border-gray-200 dark:border-white/10 focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none transition-all text-sm text-gray-900 dark:text-white"
            />
          </div>
        </div>

        {/* Content */}
        {rosters.length === 0 ? (
          /* Empty State */
          <div className="text-center py-20 animate-fade-in">
            <div className="mx-auto w-20 h-20 rounded-2xl bg-brand/10 flex items-center justify-center mb-6">
              <Users className="w-10 h-10 text-brand" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">No rosters yet</h3>
            <p className="text-gray-500 dark:text-white/50 mb-6 text-sm">
              Create your first roster to organize students for grading
            </p>
            <button
              onClick={() => navigate('/roster/new')}
              className="btn-3d-emerald"
            >
              Create your first roster
            </button>
          </div>
        ) : filtered.length === 0 ? (
          /* Empty Search */
          <div className="text-center py-20 animate-fade-in">
            <div className="mx-auto w-20 h-20 rounded-2xl bg-white/5 flex items-center justify-center mb-6">
              <Search className="w-10 h-10 text-gray-300 dark:text-white/30" />
            </div>
            <p className="text-gray-500 dark:text-white/50 mt-4 text-sm">
              No rosters match "{searchQuery}"
            </p>
          </div>
        ) : (
          /* Roster Grid */
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 stagger-children">
            {filtered.map((roster) => (
              <div
                key={roster.id}
                className="group relative card-night card-night-hover flex flex-col animate-fade-in"
              >
                <div className="p-5 flex-1 flex flex-col">
                  {/* Title row */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-bold text-base leading-tight text-gray-900 dark:text-white group-hover:text-brand transition-colors line-clamp-1">
                      {roster.name || 'Untitled Roster'}
                    </h3>
                    {roster.classroomId && (
                      <span className="shrink-0 px-2 py-0.5 rounded-full bg-accent/15 text-accent text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                        <School className="w-3 h-3" />
                        Linked
                      </span>
                    )}
                  </div>

                  {/* Meta info */}
                  <div className="flex items-center gap-3 text-sm text-gray-400 dark:text-white/40 mb-4">
                    <span className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" />
                      {roster.studentCount} student{roster.studentCount !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {/* Date */}
                  <p className="text-[11px] text-gray-300 dark:text-white/30 mb-4">
                    Created {formatDate(roster.createdAt)}
                  </p>

                  {/* Actions */}
                  <div className="flex gap-2 mt-auto">
                    <button
                      onClick={() => navigate(`/roster/${roster.id}`)}
                      className="btn-3d-emerald btn-3d-sm flex-1 text-sm flex items-center justify-center gap-1.5"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(roster)}
                      disabled={deleting === roster.id}
                      className="btn-3d-ghost btn-3d-sm px-3 text-sm flex items-center justify-center gap-1.5 text-danger hover:bg-danger/10 disabled:opacity-50"
                      title="Delete roster"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {/* Create Placeholder Card */}
            <button
              onClick={() => navigate('/roster/new')}
              className="min-h-52 flex flex-col items-center justify-center border-2 border-dashed border-gray-300 dark:border-white/20 rounded-2xl hover:border-brand hover:bg-brand/5 transition-all duration-200 group/create"
            >
              <div className="w-14 h-14 rounded-full bg-gray-50 dark:bg-white/5 flex items-center justify-center text-gray-300 dark:text-white/30 group-hover/create:bg-brand group-hover/create:text-white transition-all mb-4 hover-jelly">
                <Plus className="w-7 h-7" />
              </div>
              <span className="font-bold text-gray-400 dark:text-white/40 group-hover/create:text-brand transition-colors">
                New Roster
              </span>
            </button>
          </div>
        )}

        {/* Footer */}
        {filtered.length > 0 && (
          <div className="mt-10 flex items-center justify-between py-5 border-t border-gray-200 dark:border-white/10">
            <p className="text-sm text-gray-400 dark:text-white/40">
              Showing {filtered.length} of {rosters.length} roster{rosters.length !== 1 ? 's' : ''}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
