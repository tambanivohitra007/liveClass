import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  doc, collection, addDoc, getDocs, query, orderBy,
  updateDoc, writeBatch,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuthStore } from '../../stores/authStore';
import { useToastStore } from '../../stores/toastStore';
import {
  ArrowLeft, Plus, Trash2, GripVertical, Copy, Save,
  ToggleLeft, ToggleRight, ChevronDown, ChevronLeft, ChevronRight, Sparkles,
} from 'lucide-react';
import WaveBackground from '../../components/ui/WaveBackground';
import AiRubricModal from '../../components/AiRubricModal';
import { confirmAction } from '../../lib/swal';
import type { Rubric, Criterion, CriterionType, CriterionLevel } from '../../types/models';

const emptyCriterion = (order: number): Criterion => ({
  id: crypto.randomUUID(),
  name: '',
  type: 'numeric',
  maxScore: 10,
  weight: 1,
  order,
  levels: [],
});

const typeLabels: Record<CriterionType, string> = {
  numeric: 'Numeric',
  level: 'Level',
  checkbox: 'Checkbox',
};

export default function RubricEditor() {
  const { rubricId: paramRubricId } = useParams<{ rubricId: string }>();
  const { user } = useAuthStore();
  const { addToast } = useToastStore();
  const navigate = useNavigate();

  const isNew = paramRubricId === 'new';
  const [effectiveRubricId, setEffectiveRubricId] = useState(paramRubricId);
  const rubricId = effectiveRubricId;

  // Rubric fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isTemplate, setIsTemplate] = useState(false);

  // Criteria
  const [criteria, setCriteria] = useState<Criterion[]>([emptyCriterion(0)]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // UI state
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [mobilePanel, setMobilePanel] = useState<'list' | 'editor'>('list');
  const [showAiModal, setShowAiModal] = useState(false);

  const selectCriterion = (index: number) => {
    setSelectedIndex(index);
    setMobilePanel('editor');
  };

  // Drag-drop
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Dirty tracking
  const [savedSnapshot, setSavedSnapshot] = useState('');
  const justSavedRef = useRef(false);
  const currentSnapshot = JSON.stringify({ name, description, isTemplate, criteria });
  const isDirty = savedSnapshot !== '' && currentSnapshot !== savedSnapshot;

  // Original criteria IDs for diffing on save
  const [originalCriteriaIds, setOriginalCriteriaIds] = useState<Set<string>>(new Set());

  // ── Computed total max score ──
  const totalMaxScore = criteria.reduce((sum, c) => sum + c.maxScore * c.weight, 0);

  // ── Load existing rubric ──
  useEffect(() => {
    if (isNew || !rubricId) return;
    const load = async () => {
      setLoading(true);
      try {
        const rubricSnap = await getDocs(query(collection(db, 'rubrics')));
        const rubricDoc = rubricSnap.docs.find((d) => d.id === rubricId);
        if (rubricDoc) {
          const data = rubricDoc.data() as Omit<Rubric, 'id'>;
          setName(data.name);
          setDescription(data.description);
          setIsTemplate(data.isTemplate);
        }

        const criteriaSnap = await getDocs(
          query(collection(db, 'rubrics', rubricId, 'criteria'), orderBy('order'))
        );
        if (!criteriaSnap.empty) {
          const loaded = criteriaSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Criterion[];
          setCriteria(loaded);
          setOriginalCriteriaIds(new Set(loaded.map((c) => c.id)));
          setSelectedIndex(0);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        addToast('error', `Failed to load rubric: ${msg}`);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [rubricId, isNew, addToast]);

  // Set saved snapshot once loading completes
  useEffect(() => {
    if (loading) return;
    if (savedSnapshot === '') {
      setSavedSnapshot(currentSnapshot);
    }
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Browser refresh / tab close warning
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // Ctrl+S keyboard shortcut
  const handleSaveRef = useRef<() => void>(null);
  useEffect(() => { handleSaveRef.current = handleSave; });
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSaveRef.current?.();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ── Criteria helpers ──
  const addCriterion = () => {
    const newC = emptyCriterion(criteria.length);
    setCriteria([...criteria, newC]);
    setSelectedIndex(criteria.length);
    setMobilePanel('editor');
  };

  const updateCriterion = (index: number, updates: Partial<Criterion>) => {
    setCriteria(criteria.map((c, i) => (i === index ? { ...c, ...updates } : c)));
  };

  const removeCriterion = (index: number) => {
    if (criteria.length <= 1) {
      addToast('warning', 'At least one criterion is required.');
      return;
    }
    const updated = criteria.filter((_, i) => i !== index).map((c, i) => ({ ...c, order: i }));
    setCriteria(updated);
    if (selectedIndex >= updated.length) setSelectedIndex(Math.max(0, updated.length - 1));
    else if (index < selectedIndex) setSelectedIndex(selectedIndex - 1);
    else if (index === selectedIndex) setSelectedIndex(Math.min(index, updated.length - 1));
  };

  // Drag-drop reorder
  const handleDragEnd = () => {
    if (dragIndex !== null && dragOverIndex !== null && dragIndex !== dragOverIndex) {
      const reordered = [...criteria];
      const [moved] = reordered.splice(dragIndex, 1);
      reordered.splice(dragOverIndex, 0, moved);
      const updated = reordered.map((c, i) => ({ ...c, order: i }));
      setCriteria(updated);
      if (selectedIndex === dragIndex) setSelectedIndex(dragOverIndex);
    }
    setDragIndex(null);
    setDragOverIndex(null);
  };

  // Level helpers
  const addLevel = (criterionIndex: number) => {
    const c = criteria[criterionIndex];
    const newLevel: CriterionLevel = { label: '', score: 0 };
    const updatedLevels = [...(c.levels || []), newLevel];
    updateCriterion(criterionIndex, { levels: updatedLevels });
  };

  const updateLevel = (criterionIndex: number, levelIndex: number, updates: Partial<CriterionLevel>) => {
    const c = criteria[criterionIndex];
    const updatedLevels = (c.levels || []).map((l, i) => (i === levelIndex ? { ...l, ...updates } : l));
    // Auto-update maxScore to highest level score
    const highestScore = Math.max(0, ...updatedLevels.map((l) => l.score));
    updateCriterion(criterionIndex, { levels: updatedLevels, maxScore: highestScore });
  };

  const removeLevel = (criterionIndex: number, levelIndex: number) => {
    const c = criteria[criterionIndex];
    const updatedLevels = (c.levels || []).filter((_, i) => i !== levelIndex);
    const highestScore = updatedLevels.length > 0 ? Math.max(0, ...updatedLevels.map((l) => l.score)) : 0;
    updateCriterion(criterionIndex, { levels: updatedLevels, maxScore: highestScore });
  };

  // ── Validation ──
  const validate = useCallback((): string[] => {
    const errors: string[] = [];
    if (!name.trim()) errors.push('Rubric name is required.');
    if (criteria.length === 0) errors.push('At least one criterion is required.');
    criteria.forEach((c, i) => {
      if (!c.name.trim()) errors.push(`Criterion ${i + 1}: Name is required.`);
    });
    return errors;
  }, [name, criteria]);

  // ── Save ──
  const handleSave = async () => {
    if (!user) return;
    const errors = validate();
    setValidationErrors(errors);
    if (errors.length > 0) return;

    setSaving(true);
    try {
      const rubricData = {
        ownerId: user.id,
        name,
        description,
        isTemplate,
        totalMaxScore,
        criteriaCount: criteria.length,
        updatedAt: Date.now(),
      };

      let savedRubricId = rubricId;

      if (isNew) {
        // Create new rubric
        const rubricRef = await addDoc(collection(db, 'rubrics'), {
          ...rubricData,
          createdAt: Date.now(),
        });
        savedRubricId = rubricRef.id;

        // Batch write all criteria
        const batch = writeBatch(db);
        criteria.forEach((c) => {
          const criterionRef = doc(db, 'rubrics', savedRubricId!, 'criteria', c.id);
          const { id: _id, ...criterionData } = c;
          batch.set(criterionRef, criterionData);
        });
        await batch.commit();
      } else if (savedRubricId) {
        // Update rubric doc
        await updateDoc(doc(db, 'rubrics', savedRubricId), rubricData);

        // Diff criteria: determine adds, updates, deletes
        const currentIds = new Set(criteria.map((c) => c.id));
        const batch = writeBatch(db);

        // Delete removed criteria
        for (const oldId of originalCriteriaIds) {
          if (!currentIds.has(oldId)) {
            batch.delete(doc(db, 'rubrics', savedRubricId, 'criteria', oldId));
          }
        }

        // Add new or update existing criteria
        criteria.forEach((c) => {
          const criterionRef = doc(db, 'rubrics', savedRubricId!, 'criteria', c.id);
          const { id: _id, ...criterionData } = c;
          batch.set(criterionRef, criterionData);
        });

        await batch.commit();
      }

      // Update original IDs for next save
      setOriginalCriteriaIds(new Set(criteria.map((c) => c.id)));

      // If new, update URL
      if (isNew && savedRubricId) {
        setEffectiveRubricId(savedRubricId);
        window.history.replaceState(null, '', `/rubric/${savedRubricId}`);
      }

      const newSnapshot = JSON.stringify({ name, description, isTemplate, criteria });
      setSavedSnapshot(newSnapshot);
      justSavedRef.current = false;
      addToast('success', 'Rubric saved');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      addToast('error', `Failed to save rubric: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  // ── Clone ──
  const handleClone = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const cloneRef = await addDoc(collection(db, 'rubrics'), {
        ownerId: user.id,
        name: `${name} (Copy)`,
        description,
        isTemplate,
        totalMaxScore,
        criteriaCount: criteria.length,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const batch = writeBatch(db);
      criteria.forEach((c) => {
        const newId = crypto.randomUUID();
        const criterionRef = doc(db, 'rubrics', cloneRef.id, 'criteria', newId);
        const { id: _id, ...criterionData } = c;
        batch.set(criterionRef, criterionData);
      });
      await batch.commit();

      addToast('success', 'Rubric cloned');
      navigate(`/rubric/${cloneRef.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      addToast('error', `Failed to clone rubric: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const handleAiGenerated = async (result: { name: string; description: string; criteria: Criterion[] }) => {
    const hasContent = criteria.some(c => c.name.trim() !== '');
    if (hasContent) {
      const { isConfirmed } = await confirmAction(
        'Replace existing criteria?',
        `This will replace your current ${criteria.length} criteria with ${result.criteria.length} AI-generated ones.`,
        'Replace',
      );
      if (!isConfirmed) return;
    }
    setName(result.name);
    setDescription(result.description);
    setCriteria(result.criteria);
    setSelectedIndex(0);
    setMobilePanel('list');
  };

  const selectedCriterion = criteria[selectedIndex] as Criterion | undefined;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface pattern-stars">
        <div className="w-10 h-10 border-4 border-brand/30 border-t-brand rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-white dark:bg-surface text-gray-900 dark:text-white relative">
      <WaveBackground variant="dark" />

      {/* ── Top Bar ── */}
      <header className="h-14 flex items-center justify-between px-4 bg-gray-50 dark:bg-white/5 border-b border-gray-200 dark:border-white/10 shrink-0 relative z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-gray-400 dark:text-white/60 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex flex-col">
            <span className="text-sm font-bold text-gray-900 dark:text-white truncate max-w-48 md:max-w-96">
              {name || 'Untitled Rubric'}
            </span>
            <span className="text-[10px] text-gray-400 dark:text-white/40">
              Total: {totalMaxScore} pts | {criteria.length} criteri{criteria.length === 1 ? 'on' : 'a'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Template toggle */}
          <button
            onClick={() => setIsTemplate(!isTemplate)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors hover:bg-gray-100 dark:hover:bg-white/10"
            title={isTemplate ? 'Template: ON' : 'Template: OFF'}
          >
            {isTemplate ? (
              <ToggleRight className="w-5 h-5 text-brand" />
            ) : (
              <ToggleLeft className="w-5 h-5 text-gray-300 dark:text-white/40" />
            )}
            <span className={`hidden sm:inline ${isTemplate ? 'text-brand' : 'text-gray-400 dark:text-white/40'}`}>Template</span>
          </button>

          {/* Clone */}
          {!isNew && (
            <button
              onClick={handleClone}
              disabled={saving}
              className="btn-3d-ghost btn-3d-sm flex items-center gap-1.5"
            >
              <Copy className="w-4 h-4" />
              <span className="hidden md:inline">Clone</span>
            </button>
          )}

          {/* AI Generate */}
          <button
            onClick={() => setShowAiModal(true)}
            className="btn-3d-purple btn-3d-sm flex items-center gap-1.5"
          >
            <Sparkles className="w-4 h-4" />
            <span className="hidden md:inline">AI Generate</span>
          </button>

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-3d-cyan btn-3d-sm flex items-center gap-1.5"
          >
            <Save className="w-4 h-4" />
            {saving ? '...' : 'Save'}
          </button>
        </div>
      </header>

      {/* ── Validation Errors Banner ── */}
      {validationErrors.length > 0 && (
        <div className="px-4 py-2 bg-danger/10 border-b border-danger/20 flex items-start gap-3 relative z-10">
          <div className="flex-1">
            <p className="font-medium text-danger text-sm">Please fix the following:</p>
            <ul className="list-disc list-inside text-xs text-danger/80 mt-1 space-y-0.5">
              {validationErrors.map((err, i) => <li key={i}>{err}</li>)}
            </ul>
          </div>
          <button onClick={() => setValidationErrors([])} className="p-1 text-danger/60 hover:text-danger">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Main Content ── */}
      <div className="flex flex-1 overflow-hidden relative z-10">
        {/* ── Left Panel: Criteria List ── */}
        <aside className={`${mobilePanel === 'list' ? 'flex' : 'hidden'} md:flex w-full md:w-80 bg-gray-50 dark:bg-white/5 md:border-r border-gray-200 dark:border-white/10 flex-col shrink-0 overflow-hidden`}>
          {/* Rubric name + description */}
          <div className="p-4 border-b border-gray-200 dark:border-white/10 space-y-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Rubric name"
              className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-900 dark:text-white placeholder:text-gray-300 dark:placeholder:text-white/30 text-sm font-medium outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)"
              rows={2}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-900 dark:text-white placeholder:text-gray-300 dark:placeholder:text-white/30 text-xs outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 resize-none"
            />
          </div>

          {/* Add Criterion Button */}
          <div className="p-3 border-b border-gray-200 dark:border-white/10">
            <button
              onClick={addCriterion}
              className="w-full py-2.5 border-2 border-dashed border-gray-300 dark:border-white/20 rounded-xl text-gray-400 dark:text-white/40 text-sm font-medium hover:border-brand hover:text-brand hover:bg-brand/5 transition-colors flex items-center justify-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              Add Criterion
            </button>
          </div>

          {/* Criteria List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
            {criteria.map((c, i) => (
              <div
                key={c.id}
                draggable
                onDragStart={() => setDragIndex(i)}
                onDragOver={(e) => { e.preventDefault(); setDragOverIndex(i); }}
                onDragEnd={handleDragEnd}
                onClick={() => selectCriterion(i)}
                className={`group relative flex items-start gap-2 p-2.5 rounded-xl cursor-pointer transition-all ${
                  selectedIndex === i
                    ? 'bg-brand/20 border border-brand'
                    : 'hover:bg-gray-100 dark:hover:bg-white/10 border border-transparent'
                } ${dragOverIndex === i && dragIndex !== i ? 'ring-2 ring-brand' : ''} ${
                  dragIndex === i ? 'opacity-40' : ''
                }`}
              >
                <GripVertical className="w-3.5 h-3.5 text-gray-300 dark:text-white/30 shrink-0 mt-0.5 cursor-grab active:cursor-grabbing md:opacity-0 md:group-hover:opacity-100 transition-opacity" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className={`text-xs font-bold ${selectedIndex === i ? 'text-brand' : 'text-gray-400 dark:text-white/40'}`}>
                      {i + 1}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                      selectedIndex === i ? 'bg-brand/20 text-brand' : 'bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-white/60'
                    }`}>
                      {typeLabels[c.type]}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-white/70 truncate leading-tight">
                    {c.name || 'Untitled criterion'}
                  </p>
                  <span className="text-[10px] text-gray-400 dark:text-white/40">
                    {c.maxScore} pts {c.weight !== 1 ? `x${c.weight}` : ''}
                  </span>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 dark:text-white/20 shrink-0 self-center md:hidden" />
                <button
                  onClick={(e) => { e.stopPropagation(); removeCriterion(i); }}
                  className="absolute top-1.5 right-1.5 p-1 rounded-lg bg-gray-100 dark:bg-white/10 text-gray-400 dark:text-white/40 hover:bg-danger/10 hover:text-danger md:opacity-0 md:group-hover:opacity-100 transition-all"
                  title="Remove criterion"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </aside>

        {/* ── Main Panel: Criterion Editor ── */}
        <main className={`${mobilePanel === 'editor' ? 'flex' : 'hidden'} md:flex flex-1 flex-col overflow-y-auto`}>
          {selectedCriterion ? (
            <div className="max-w-2xl mx-auto px-4 md:px-6 py-6 space-y-5 w-full">
              {/* Mobile criterion nav bar */}
              <div className="flex items-center justify-between md:hidden">
                <button
                  onClick={() => setMobilePanel('list')}
                  className="p-1.5 -ml-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-gray-400 dark:text-white/40 transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <h2 className="text-base font-bold text-gray-900 dark:text-white">
                  Criterion {selectedIndex + 1} <span className="text-gray-400 dark:text-white/40 font-normal text-sm">/ {criteria.length}</span>
                </h2>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => selectCriterion(selectedIndex - 1)}
                    disabled={selectedIndex === 0}
                    className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-gray-400 dark:text-white/40 transition-colors disabled:opacity-30"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => selectCriterion(selectedIndex + 1)}
                    disabled={selectedIndex >= criteria.length - 1}
                    className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-gray-400 dark:text-white/40 transition-colors disabled:opacity-30"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white hidden md:block">
                Criterion {selectedIndex + 1}
              </h2>

              {/* Name */}
              <div>
                <label className="text-xs font-semibold text-gray-500 dark:text-white/50 uppercase tracking-wide mb-1.5 block">
                  Name
                </label>
                <input
                  value={selectedCriterion.name}
                  onChange={(e) => updateCriterion(selectedIndex, { name: e.target.value })}
                  placeholder="e.g. Code Quality, Presentation, Accuracy"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-gray-900 dark:text-white placeholder:text-gray-300 dark:placeholder:text-white/30 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                />
              </div>

              {/* Type Selector */}
              <div>
                <label className="text-xs font-semibold text-gray-500 dark:text-white/50 uppercase tracking-wide mb-1.5 block">
                  Type
                </label>
                <div className="flex gap-2">
                  {(['numeric', 'level', 'checkbox'] as CriterionType[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => {
                        const updates: Partial<Criterion> = { type: t };
                        if (t === 'checkbox') {
                          updates.maxScore = 1;
                          updates.levels = [];
                        } else if (t === 'numeric') {
                          updates.levels = [];
                        } else if (t === 'level') {
                          if (!selectedCriterion.levels || selectedCriterion.levels.length === 0) {
                            updates.levels = [
                              { label: 'Excellent', score: 4 },
                              { label: 'Good', score: 3 },
                              { label: 'Fair', score: 2 },
                              { label: 'Poor', score: 1 },
                            ];
                            updates.maxScore = 4;
                          }
                        }
                        updateCriterion(selectedIndex, updates);
                      }}
                      className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                        selectedCriterion.type === t
                          ? 'bg-brand text-white shadow-lg shadow-brand/30'
                          : 'bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-white/60 hover:bg-gray-200 dark:hover:bg-white/20 hover:text-gray-700 dark:hover:text-white'
                      }`}
                    >
                      {typeLabels[t]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Max Score */}
              <div>
                <label className="text-xs font-semibold text-gray-500 dark:text-white/50 uppercase tracking-wide mb-1.5 block">
                  Max Score
                </label>
                <input
                  type="number"
                  min={0}
                  value={selectedCriterion.maxScore}
                  onChange={(e) => updateCriterion(selectedIndex, { maxScore: Math.max(0, Number(e.target.value)) })}
                  disabled={selectedCriterion.type === 'level'}
                  className="w-32 px-4 py-3 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-gray-900 dark:text-white outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:opacity-40 disabled:cursor-not-allowed"
                />
                {selectedCriterion.type === 'level' && (
                  <p className="text-[10px] text-gray-400 dark:text-white/40 mt-1">Auto-calculated from highest level score.</p>
                )}
              </div>

              {/* Weight */}
              <div>
                <label className="text-xs font-semibold text-gray-500 dark:text-white/50 uppercase tracking-wide mb-1.5 block">
                  Weight
                </label>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={selectedCriterion.weight}
                  onChange={(e) => updateCriterion(selectedIndex, { weight: Math.max(0, Number(e.target.value)) })}
                  className="w-32 px-4 py-3 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-gray-900 dark:text-white outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                />
                <p className="text-[10px] text-gray-400 dark:text-white/40 mt-1">
                  Weighted score: {selectedCriterion.maxScore} x {selectedCriterion.weight} = {selectedCriterion.maxScore * selectedCriterion.weight} pts
                </p>
              </div>

              {/* Level Editor (only when type === 'level') */}
              {selectedCriterion.type === 'level' && (
                <div className="card-night p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-gray-500 dark:text-white/50 uppercase tracking-wide flex items-center gap-1.5">
                      <ChevronDown className="w-3.5 h-3.5" />
                      Levels
                    </label>
                    <button
                      onClick={() => addLevel(selectedIndex)}
                      className="flex items-center gap-1 text-xs text-brand font-medium hover:text-brand/80 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Level
                    </button>
                  </div>

                  {(selectedCriterion.levels || []).length === 0 && (
                    <p className="text-xs text-gray-400 dark:text-white/40 text-center py-4">
                      No levels defined. Add levels to define scoring tiers.
                    </p>
                  )}

                  <div className="space-y-2">
                    {(selectedCriterion.levels || []).map((level, li) => (
                      <div key={li} className="flex items-center gap-2">
                        <input
                          value={level.label}
                          onChange={(e) => updateLevel(selectedIndex, li, { label: e.target.value })}
                          placeholder="Level label"
                          className="flex-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-gray-900 dark:text-white placeholder:text-gray-300 dark:placeholder:text-white/30 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                        />
                        <input
                          type="number"
                          min={0}
                          value={level.score}
                          onChange={(e) => updateLevel(selectedIndex, li, { score: Math.max(0, Number(e.target.value)) })}
                          className="w-20 px-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-gray-900 dark:text-white text-sm text-center outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                          placeholder="Score"
                        />
                        <button
                          onClick={() => removeLevel(selectedIndex, li)}
                          className="p-1.5 rounded-lg hover:bg-danger/10 text-gray-400 dark:text-white/40 hover:text-danger transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Checkbox info */}
              {selectedCriterion.type === 'checkbox' && (
                <div className="p-4 bg-brand/5 border border-brand/20 rounded-xl">
                  <p className="text-sm text-gray-500 dark:text-white/60">
                    Checkbox criteria are binary: checked (1 point) or unchecked (0 points).
                  </p>
                </div>
              )}

              {/* Mobile action buttons */}
              <div className="flex gap-2 pt-2 md:hidden">
                <button
                  onClick={() => removeCriterion(selectedIndex)}
                  className="btn-3d-danger btn-3d-sm flex items-center gap-1.5 text-xs"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>
                <button
                  onClick={addCriterion}
                  className="btn-3d-ghost btn-3d-sm flex items-center gap-1.5 text-xs ml-auto"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add
                </button>
              </div>
            </div>
          ) : (
            /* Empty State */
            <div className="flex-1 flex flex-col items-center justify-center h-full px-4">
              <button
                onClick={() => setMobilePanel('list')}
                className="self-start mb-4 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-gray-400 dark:text-white/40 transition-colors md:hidden"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="text-center">
                <h3 className="text-lg font-semibold text-gray-400 dark:text-white/40 mb-1">No criterion selected</h3>
                <p className="text-sm text-gray-400 dark:text-white/40 mb-4">Select a criterion from the left panel or add a new one</p>
                <button onClick={addCriterion} className="btn-3d-cyan btn-3d-sm">
                  <Plus className="w-4 h-4 inline mr-1.5" />
                  Add Criterion
                </button>
              </div>
            </div>
          )}
        </main>
      </div>

      <AiRubricModal
        open={showAiModal}
        onClose={() => setShowAiModal(false)}
        onGenerated={handleAiGenerated}
      />
    </div>
  );
}
