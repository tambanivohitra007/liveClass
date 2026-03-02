import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, doc, deleteDoc, addDoc, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuthStore } from '../../stores/authStore';
import { useToastStore } from '../../stores/toastStore';
import { confirmDelete } from '../../lib/swal';
import { useNavigate } from 'react-router-dom';
import { SkeletonCard } from '../../components/Skeleton';
import WaveBackground from '../../components/ui/WaveBackground';
import {
  Search, Plus, Trash2, Pencil, Copy, FileText, Award, CheckCircle2, X as XIcon, Radio,
} from 'lucide-react';
import type { Rubric, Criterion } from '../../types/models';

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

export default function RubricList() {
  const { user } = useAuthStore();
  const { addToast } = useToastStore();
  const navigate = useNavigate();

  const [rubrics, setRubrics] = useState<Rubric[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [cloning, setCloning] = useState<string | null>(null);
  const [previewRubric, setPreviewRubric] = useState<Rubric | null>(null);
  const [previewCriteria, setPreviewCriteria] = useState<Criterion[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  const handlePreview = async (rubric: Rubric) => {
    setPreviewRubric(rubric);
    setPreviewLoading(true);
    try {
      const criteriaSnap = await getDocs(
        query(collection(db, 'rubrics', rubric.id, 'criteria'), orderBy('order'))
      );
      const data = criteriaSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Criterion[];
      setPreviewCriteria(data);
    } catch {
      addToast('error', 'Failed to load criteria');
      setPreviewRubric(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  // Fetch rubrics with real-time updates
  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, 'rubrics'), where('ownerId', '==', user.id));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Rubric[];
      data.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
      setRubrics(data);
      setLoading(false);
    });

    return unsubscribe;
  }, [user]);

  const handleDelete = async (rubric: Rubric) => {
    const { isConfirmed } = await confirmDelete(rubric.name || 'Untitled Rubric');
    if (!isConfirmed) return;
    setDeleting(rubric.id);
    try {
      // Delete criteria subcollection first
      const criteriaSnap = await getDocs(collection(db, 'rubrics', rubric.id, 'criteria'));
      await Promise.all(criteriaSnap.docs.map((d) => deleteDoc(d.ref)));
      await deleteDoc(doc(db, 'rubrics', rubric.id));
      addToast('success', `"${rubric.name}" deleted successfully`);
    } catch {
      addToast('error', 'Failed to delete rubric. Please try again.');
    } finally {
      setDeleting(null);
    }
  };

  const handleClone = async (rubric: Rubric) => {
    if (!user) return;
    setCloning(rubric.id);
    try {
      // Create the new rubric document
      const newRubricRef = await addDoc(collection(db, 'rubrics'), {
        ownerId: user.id,
        name: `${rubric.name} (Copy)`,
        description: rubric.description,
        isTemplate: false,
        totalMaxScore: rubric.totalMaxScore,
        criteriaCount: rubric.criteriaCount,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      // Clone all criteria from the original rubric
      const criteriaSnap = await getDocs(collection(db, 'rubrics', rubric.id, 'criteria'));
      await Promise.all(
        criteriaSnap.docs.map((d) => {
          const criterionData = d.data();
          return addDoc(collection(db, 'rubrics', newRubricRef.id, 'criteria'), {
            ...criterionData,
          });
        }),
      );

      addToast('success', `"${rubric.name}" cloned successfully`);
    } catch {
      addToast('error', 'Failed to clone rubric. Please try again.');
    } finally {
      setCloning(null);
    }
  };

  const filtered = rubrics.filter((r) =>
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
            <h1 className="text-2xl text-gray-900 dark:text-white">Rubrics</h1>
            <p className="text-gray-400 dark:text-white/40 mt-1 text-sm">
              Create and manage grading rubrics for your classes
            </p>
          </div>
          <button
            onClick={() => navigate('/rubric/new')}
            className="btn-3d-emerald btn-3d-sm flex items-center gap-2 text-sm"
          >
            <Plus className="w-4 h-4" />
            New Rubric
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
              placeholder="Search rubrics by name..."
              className="w-full pl-12 pr-4 py-3.5 bg-gray-50 dark:bg-white/5 rounded-xl border border-gray-200 dark:border-white/10 focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none transition-all text-sm text-gray-900 dark:text-white"
            />
          </div>
        </div>

        {/* Content */}
        {rubrics.length === 0 ? (
          /* Empty State */
          <div className="text-center py-20 animate-fade-in">
            <div className="mx-auto w-20 h-20 rounded-2xl bg-brand/10 flex items-center justify-center mb-6">
              <FileText className="w-10 h-10 text-brand" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">No rubrics yet</h3>
            <p className="text-gray-500 dark:text-white/50 mb-6 text-sm">
              Create your first rubric to start grading consistently
            </p>
            <button
              onClick={() => navigate('/rubric/new')}
              className="btn-3d-emerald"
            >
              Create your first rubric
            </button>
          </div>
        ) : filtered.length === 0 ? (
          /* Empty Search */
          <div className="text-center py-20 animate-fade-in">
            <div className="mx-auto w-20 h-20 rounded-2xl bg-white/5 flex items-center justify-center mb-6">
              <Search className="w-10 h-10 text-gray-300 dark:text-white/30" />
            </div>
            <p className="text-gray-500 dark:text-white/50 mt-4 text-sm">
              No rubrics match "{searchQuery}"
            </p>
          </div>
        ) : (
          /* Rubric Grid */
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 stagger-children">
            {filtered.map((rubric) => (
              <div
                key={rubric.id}
                className="group relative card-night card-night-hover flex flex-col animate-fade-in cursor-pointer"
                onClick={() => handlePreview(rubric)}
              >
                <div className="p-5 flex-1 flex flex-col">
                  {/* Title row */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-bold text-base leading-tight text-gray-900 dark:text-white group-hover:text-brand transition-colors line-clamp-1">
                      {rubric.name || 'Untitled Rubric'}
                    </h3>
                    {rubric.isTemplate && (
                      <span className="shrink-0 px-2 py-0.5 rounded-full bg-accent/15 text-accent text-[10px] font-bold uppercase tracking-wider">
                        Template
                      </span>
                    )}
                  </div>

                  {/* Description */}
                  {rubric.description && (
                    <p className="text-sm text-gray-400 dark:text-white/40 line-clamp-2 mb-4">
                      {rubric.description}
                    </p>
                  )}
                  {!rubric.description && <div className="mb-4" />}

                  {/* Meta info */}
                  <div className="flex items-center gap-3 text-sm text-gray-400 dark:text-white/40 mb-5">
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {rubric.criteriaCount} criteria
                    </span>
                    <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-white/20" />
                    <span className="flex items-center gap-1">
                      <Award className="w-3.5 h-3.5" />
                      {rubric.totalMaxScore} pts
                    </span>
                  </div>

                  {/* Date */}
                  <p className="text-[11px] text-gray-300 dark:text-white/30 mb-4">
                    Created {formatDate(rubric.createdAt)}
                  </p>

                  {/* Actions */}
                  <div className="flex gap-1.5 mt-auto" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => navigate(`/rubric/${rubric.id}/host`)}
                      className="btn-3d-cyan btn-3d-sm flex-1 text-sm flex items-center justify-center gap-1.5"
                      title="Host live grading session"
                    >
                      <Radio className="w-3.5 h-3.5" />
                      Host Live
                    </button>
                    <button
                      onClick={() => navigate(`/rubric/${rubric.id}`)}
                      className="btn-3d-ghost btn-3d-sm px-2.5 text-sm flex items-center justify-center"
                      title="Edit rubric"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleClone(rubric)}
                      disabled={cloning === rubric.id}
                      className="btn-3d-ghost btn-3d-sm px-2.5 text-sm flex items-center justify-center disabled:opacity-50"
                      title="Clone rubric"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(rubric)}
                      disabled={deleting === rubric.id}
                      className="btn-3d-ghost btn-3d-sm px-2.5 text-sm flex items-center justify-center text-danger hover:bg-danger/10 disabled:opacity-50"
                      title="Delete rubric"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {/* Create Placeholder Card */}
            <button
              onClick={() => navigate('/rubric/new')}
              className="min-h-52 flex flex-col items-center justify-center border-2 border-dashed border-gray-300 dark:border-white/20 rounded-2xl hover:border-brand hover:bg-brand/5 transition-all duration-200 group/create"
            >
              <div className="w-14 h-14 rounded-full bg-gray-50 dark:bg-white/5 flex items-center justify-center text-gray-300 dark:text-white/30 group-hover/create:bg-brand group-hover/create:text-white transition-all mb-4 hover-jelly">
                <Plus className="w-7 h-7" />
              </div>
              <span className="font-bold text-gray-400 dark:text-white/40 group-hover/create:text-brand transition-colors">
                New Rubric
              </span>
            </button>
          </div>
        )}

        {/* Footer */}
        {filtered.length > 0 && (
          <div className="mt-10 flex items-center justify-between py-5 border-t border-gray-200 dark:border-white/10">
            <p className="text-sm text-gray-400 dark:text-white/40">
              Showing {filtered.length} of {rubrics.length} rubric{rubrics.length !== 1 ? 's' : ''}
            </p>
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {previewRubric && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setPreviewRubric(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="card-night w-full max-w-2xl animate-bounce-in max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header — pinned */}
            <div className="flex items-center justify-between p-6 pb-4 border-b border-gray-200 dark:border-white/10 shrink-0">
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white truncate">
                  {previewRubric.name || 'Untitled Rubric'}
                </h3>
                {previewRubric.description && (
                  <p className="text-sm text-gray-400 dark:text-white/40 mt-1">{previewRubric.description}</p>
                )}
                <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-white/40 mt-2">
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {previewRubric.criteriaCount} criteria
                  </span>
                  <span className="flex items-center gap-1">
                    <Award className="w-3.5 h-3.5" />
                    {previewRubric.totalMaxScore} pts total
                  </span>
                  {previewRubric.isTemplate && (
                    <span className="px-2 py-0.5 rounded-full bg-accent/15 text-accent text-[10px] font-bold uppercase">
                      Template
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setPreviewRubric(null)}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-gray-400 dark:text-white/40 transition-colors shrink-0 ml-4"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Criteria — scrollable */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {previewLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-8 h-8 border-3 border-brand/30 border-t-brand rounded-full animate-spin" />
                </div>
              ) : previewCriteria.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-white/40 text-center py-8">No criteria found.</p>
              ) : (
                previewCriteria.map((c, i) => (
                  <div key={c.id} className="bg-gray-50 dark:bg-white/5 rounded-xl border border-gray-200 dark:border-white/10 overflow-hidden">
                    {/* Criterion header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-white/10">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-bold text-brand">{i + 1}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-white/60 font-medium capitalize">
                          {c.type}
                        </span>
                        <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                          {c.name || 'Untitled'}
                        </span>
                      </div>
                      <span className="text-xs text-gray-400 dark:text-white/40 shrink-0 ml-2">
                        {c.maxScore} pts {c.weight !== 1 ? `x${c.weight}` : ''}
                      </span>
                    </div>

                    {/* Levels */}
                    {c.type === 'level' && c.levels && c.levels.length > 0 && (
                      <div className="divide-y divide-gray-100 dark:divide-white/5">
                        {c.levels.map((level, li) => (
                          <div key={li} className="flex items-start gap-3 px-4 py-2.5">
                            <span className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${
                              li === 0 ? 'bg-success/15 text-success' :
                              li === 1 ? 'bg-brand/15 text-brand' :
                              li === 2 ? 'bg-warning/15 text-warning' :
                              'bg-danger/15 text-danger'
                            }`}>
                              {level.score}
                            </span>
                            <span className="text-sm text-gray-600 dark:text-white/60 leading-snug">
                              {level.label || 'No description'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {c.type === 'checkbox' && (
                      <div className="px-4 py-2.5 text-xs text-gray-400 dark:text-white/40">
                        Binary: checked (1 pt) or unchecked (0 pts)
                      </div>
                    )}

                    {c.type === 'numeric' && (
                      <div className="px-4 py-2.5 text-xs text-gray-400 dark:text-white/40">
                        Score from 0 to {c.maxScore}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Footer — pinned */}
            <div className="flex gap-2 p-6 border-t border-gray-200 dark:border-white/10 shrink-0">
              <button
                onClick={() => {
                  navigate(`/rubric/${previewRubric.id}`);
                  setPreviewRubric(null);
                }}
                className="btn-3d-emerald btn-3d-sm flex-1 text-sm flex items-center justify-center gap-1.5"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit Rubric
              </button>
              <button
                onClick={() => setPreviewRubric(null)}
                className="btn-3d-ghost btn-3d-sm px-5 text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
