import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, setDoc, updateDoc, collection, addDoc, deleteDoc, serverTimestamp, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuthStore } from '../../stores/authStore';
import { useToastStore } from '../../stores/toastStore';
import ImageUpload from '../../components/ImageUpload';
import AiGenerateModal from '../../components/AiGenerateModal';
import CodeBlock from '../../components/CodeBlock';
import { confirmAction } from '../../lib/swal';
import {
  GripVertical, ChevronUp, ChevronDown, Copy, Trash2, Check, Eye, Plus, Minus,
  Sparkles, X as XIcon, ArrowLeft,
  Clock, Image as ImageIcon, Type, FileText,
} from 'lucide-react';
import { COLLECTION_COLORS } from '../../types/models';
import type { Quiz, Question, QuestionType, Collection, CollectionColor } from '../../types/models';

const emptyQuestion = (quizId: string): Omit<Question, 'id'> => ({
  quizId,
  type: 'mcq',
  text: '',
  options: ['', '', '', ''],
  correctAnswers: [],
  timeLimitSec: 20,
});

const typeLabels: Record<QuestionType, string> = {
  mcq: 'Multiple Choice',
  tf: 'True / False',
  short: 'Short Answer',
  matching: 'Matching',
  fill_blank: 'Fill Blank',
  ordering: 'Ordering',
  poll: 'Poll',
  slide: 'Slide',
  code_output: 'Code Output',
};

const ANSWER_CARDS = [
  { bg: 'bg-answer-red', border: 'border-answer-red', placeholder: 'Add answer' },
  { bg: 'bg-answer-blue', border: 'border-answer-blue', placeholder: 'Add answer' },
  { bg: 'bg-answer-yellow', border: 'border-answer-yellow', placeholder: 'Add answer' },
  { bg: 'bg-answer-green', border: 'border-answer-green', placeholder: 'Add answer' },
  { bg: 'bg-answer-purple', border: 'border-answer-purple', placeholder: 'Add answer' },
  { bg: 'bg-answer-orange', border: 'border-answer-orange', placeholder: 'Add answer' },
];

export default function QuizEditor() {
  const { quizId: paramQuizId } = useParams<{ quizId: string }>();
  const { user } = useAuthStore();
  const { addToast } = useToastStore();
  const navigate = useNavigate();
  const [effectiveQuizId, setEffectiveQuizId] = useState(paramQuizId);
  const quizId = effectiveQuizId;
  const isNew = quizId === 'new';

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [questions, setQuestions] = useState<(Omit<Question, 'id'> & { id?: string })[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [visibility, setVisibility] = useState<'private' | 'org' | 'public'>('private');
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [showAiModal, setShowAiModal] = useState(false);
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [selectedColor, setSelectedColor] = useState<CollectionColor | ''>('');
  const [activeIndex, setActiveIndex] = useState(0);

  // ── Unsaved changes tracking ──
  const [savedSnapshot, setSavedSnapshot] = useState<string>('');
  const justSavedRef = useRef(false);
  const currentSnapshot = JSON.stringify({ title, description, questions, visibility, selectedCollectionId, coverImageUrl, selectedColor });
  const isDirty = savedSnapshot !== '' && currentSnapshot !== savedSnapshot;

  useEffect(() => {
    if (isNew || !quizId) return;
    const loadQuizAndQuestions = async () => {
      setLoadingQuestions(true);
      const quizDoc = await getDoc(doc(db, 'quizzes', quizId));
      if (quizDoc.exists()) {
        const data = quizDoc.data() as Quiz;
        setTitle(data.title);
        setDescription(data.description);
        setVisibility(data.visibility || 'private');
        setSelectedCollectionId(data.collectionId || '');
        setCoverImageUrl(data.coverImageUrl || '');
        setSelectedColor(data.color || '');
      }
      const q = query(collection(db, 'questions'), where('quizId', '==', quizId));
      const qSnapshot = await getDocs(q);
      const loadedQuestions = qSnapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as (Question & { id: string })[];
      setQuestions(loadedQuestions);
      setLoadingQuestions(false);
    };
    loadQuizAndQuestions();
  }, [quizId, isNew]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'collections'), where('ownerId', '==', user.id));
    const unsub = onSnapshot(q, (snapshot) => {
      setCollections(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Collection[]);
    });
    return unsub;
  }, [user]);

  // Set saved snapshot once loading completes (for existing quizzes) or on mount (for new quizzes)
  useEffect(() => {
    if (loadingQuestions) return;
    if (savedSnapshot === '') {
      setSavedSnapshot(currentSnapshot);
    }
  }, [loadingQuestions]); // eslint-disable-line react-hooks/exhaustive-deps

  // Browser refresh / tab close warning
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // Browser back/forward navigation blocking
  const dirtyRef = useRef(isDirty);
  dirtyRef.current = isDirty;

  useEffect(() => {
    const handler = () => {
      if (!dirtyRef.current || justSavedRef.current) return;
      // Cancel the navigation by pushing state back
      window.history.pushState(null, '', window.location.href);
      confirmAction(
        'Unsaved changes',
        'You have unsaved changes. Are you sure you want to leave?',
        'Leave'
      ).then(({ isConfirmed }) => {
        if (isConfirmed) {
          justSavedRef.current = true; // prevent re-triggering
          window.history.back();
        }
      });
    };
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);

  // Ctrl+S / Cmd+S keyboard shortcut to save
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

  // Guard for in-app navigate calls (back button, preview, etc.)
  const navigateGuard = useCallback(async (to: string) => {
    if (!isDirty || justSavedRef.current) {
      navigate(to);
      return;
    }
    const { isConfirmed } = await confirmAction(
      'Unsaved changes',
      'You have unsaved changes. Are you sure you want to leave?',
      'Leave'
    );
    if (isConfirmed) {
      justSavedRef.current = true;
      navigate(to);
    }
  }, [isDirty, navigate]);

  const addQuestion = () => {
    const newQ = emptyQuestion(quizId || '');
    setQuestions([...questions, newQ]);
    setActiveIndex(questions.length);
  };

  const existingQuestionsSummary = questions.length > 0
    ? (() => {
        const summaries = questions
          .filter((q) => q.text.trim())
          .slice(0, 8)
          .map((q, i) => `${i + 1}. ${q.text.trim()}`)
          .join('\n');
        return summaries ? `Existing questions in this quiz:\n${summaries}\n\nGenerate new questions that complement these.` : '';
      })()
    : '';

  const updateQuestion = (index: number, updates: Partial<Question>) => {
    setQuestions(questions.map((q, i) => (i === index ? { ...q, ...updates } : q)));
  };

  const updateQuestionType = (index: number, type: QuestionType) => {
    const updates: Partial<Question> = { type };
    if (type === 'tf') { updates.options = ['True', 'False']; updates.correctAnswers = []; updates.matchOptions = undefined; }
    else if (type === 'mcq') { updates.options = ['', '', '', '']; updates.correctAnswers = []; updates.matchOptions = undefined; }
    else if (type === 'matching') { updates.options = ['', '']; updates.matchOptions = ['', '']; updates.correctAnswers = []; }
    else if (type === 'fill_blank') { updates.options = []; updates.matchOptions = undefined; updates.correctAnswers = ['']; }
    else if (type === 'ordering') { updates.options = ['', '', '', '']; updates.correctAnswers = []; updates.matchOptions = undefined; }
    else if (type === 'poll') { updates.options = ['', '', '', '']; updates.correctAnswers = []; updates.matchOptions = undefined; }
    else if (type === 'slide') { updates.options = []; updates.correctAnswers = []; updates.matchOptions = undefined; }
    else if (type === 'code_output') { updates.options = []; updates.correctAnswers = []; updates.matchOptions = undefined; updates.codeSnippet = ''; updates.codeLanguage = 'javascript'; }
    else { updates.options = []; updates.correctAnswers = []; updates.matchOptions = undefined; }
    updateQuestion(index, updates);
  };

  const removeQuestion = async (index: number) => {
    const { isConfirmed } = await confirmAction(
      'Remove question?',
      `Question ${index + 1} will be removed from the list.`,
      'Yes, remove'
    );
    if (!isConfirmed) return;
    setQuestions(questions.filter((_, i) => i !== index));
    if (activeIndex >= questions.length - 1) setActiveIndex(Math.max(0, questions.length - 2));
    else if (index < activeIndex) setActiveIndex(activeIndex - 1);
  };

  const quickRemoveQuestion = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index));
    if (activeIndex >= questions.length - 1) setActiveIndex(Math.max(0, questions.length - 2));
    else if (index < activeIndex) setActiveIndex(activeIndex - 1);
  };

  const moveQuestion = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= questions.length) return;
    const reordered = [...questions];
    [reordered[index], reordered[newIndex]] = [reordered[newIndex], reordered[index]];
    setQuestions(reordered);
    if (activeIndex === index) setActiveIndex(newIndex);
    else if (activeIndex === newIndex) setActiveIndex(index);
  };

  const moveOption = (questionIndex: number, optionIndex: number, direction: -1 | 1) => {
    const q = questions[questionIndex];
    const newIdx = optionIndex + direction;
    if (newIdx < 0 || newIdx >= q.options.length) return;
    const newOpts = [...q.options];
    [newOpts[optionIndex], newOpts[newIdx]] = [newOpts[newIdx], newOpts[optionIndex]];
    updateQuestion(questionIndex, { options: newOpts });
  };

  const duplicateQuestion = (index: number) => {
    const copy = { ...questions[index], id: undefined };
    const updated = [...questions];
    updated.splice(index + 1, 0, copy);
    setQuestions(updated);
    setActiveIndex(index + 1);
  };

  const handleDragEnd = () => {
    if (dragIndex !== null && dragOverIndex !== null && dragIndex !== dragOverIndex) {
      const reordered = [...questions];
      const [moved] = reordered.splice(dragIndex, 1);
      reordered.splice(dragOverIndex, 0, moved);
      setQuestions(reordered);
      if (activeIndex === dragIndex) setActiveIndex(dragOverIndex);
    }
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const validate = (): string[] => {
    const errors: string[] = [];
    if (!title.trim()) errors.push('Quiz title is required.');
    if (questions.length === 0) errors.push('Add at least one question.');
    questions.forEach((q, i) => {
      const num = i + 1;
      if (!q.text.trim()) errors.push(`Q${num}: Question text is required.`);
      if (q.type === 'slide') {
        // Slides just need text
      } else if (q.type === 'poll') {
        if (q.options.length < 2) errors.push(`Q${num}: Poll needs at least 2 options.`);
        if (q.options.some((o) => !o.trim())) errors.push(`Q${num}: All poll options must be filled in.`);
      } else if (q.type === 'ordering') {
        if (q.options.length < 2) errors.push(`Q${num}: Ordering needs at least 2 items.`);
        if (q.options.some((o) => !o.trim())) errors.push(`Q${num}: All ordering items must be filled in.`);
      } else if (q.type === 'matching') {
        if (q.options.length < 2) errors.push(`Q${num}: Matching needs at least 2 pairs.`);
        if (q.options.some((o) => !o.trim())) errors.push(`Q${num}: All left-side items must be filled in.`);
        if (q.matchOptions?.some((o) => !o.trim())) errors.push(`Q${num}: All right-side items must be filled in.`);
        if (q.options.length !== (q.matchOptions?.length || 0)) errors.push(`Q${num}: Left and right sides must have equal items.`);
      } else if (q.type === 'fill_blank') {
        const blankCount = (q.text.match(/___/g) || []).length;
        if (blankCount === 0) errors.push(`Q${num}: Use ___ to mark blanks in the question text.`);
        if (q.correctAnswers.length !== blankCount) errors.push(`Q${num}: Provide exactly ${blankCount} answer(s) for ${blankCount} blank(s).`);
        if (q.correctAnswers.some((a) => !a.trim())) errors.push(`Q${num}: All blank answers must be filled in.`);
      } else if (q.type === 'code_output') {
        if (!q.codeSnippet?.trim()) errors.push(`Q${num}: Code snippet is required.`);
        if (q.correctAnswers.length === 0 || q.correctAnswers.every((a) => !a.trim())) errors.push(`Q${num}: At least one expected output is required.`);
      } else {
        if (q.correctAnswers.length === 0) errors.push(`Q${num}: Mark at least one correct answer.`);
        if (q.type !== 'short' && q.options.some((o) => !o.trim())) {
          errors.push(`Q${num}: All options must be filled in.`);
        }
      }
    });
    return errors;
  };

  const handleSave = async () => {
    if (!user) return;
    const errors = validate();
    setValidationErrors(errors);
    if (errors.length > 0) return;
    if (isNew && user.approvalStatus === 'pending' && user.email !== 'rindra.it@gmail.com') {
      addToast('error', 'Your teacher account is pending approval. You cannot create new quizzes yet.');
      return;
    }
    setSaving(true);
    try {
      let savedQuizId = quizId;
      if (isNew) {
        const quizRef = await addDoc(collection(db, 'quizzes'), {
          ownerId: user.id, title, description, visibility,
          collectionId: selectedCollectionId || null,
          coverImageUrl: coverImageUrl || null,
          color: selectedColor || null,
          createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        });
        savedQuizId = quizRef.id;
      } else if (savedQuizId) {
        await updateDoc(doc(db, 'quizzes', savedQuizId), {
          title, description, visibility,
          collectionId: selectedCollectionId || null,
          coverImageUrl: coverImageUrl || null,
          color: selectedColor || null,
          updatedAt: serverTimestamp(),
        });
      }
      // Collect IDs of questions still in the editor
      const updatedQuestions = [...questions];
      const keepIds = new Set(updatedQuestions.map((q) => q.id).filter(Boolean));

      // Delete questions that were removed from the UI
      if (!isNew && savedQuizId) {
        const existingSnap = await getDocs(query(collection(db, 'questions'), where('quizId', '==', savedQuizId)));
        await Promise.all(
          existingSnap.docs
            .filter((d) => !keepIds.has(d.id))
            .map((d) => deleteDoc(d.ref)),
        );
      }

      for (let i = 0; i < updatedQuestions.length; i++) {
        const question = updatedQuestions[i];
        const questionData: Record<string, unknown> = {
          quizId: savedQuizId, type: question.type || 'mcq', text: question.text || '',
          imageUrl: question.imageUrl || null, videoUrl: question.videoUrl || null,
          options: question.options || [],
          correctAnswers: question.correctAnswers || [], timeLimitSec: question.timeLimitSec ?? 20,
        };
        if (question.type === 'matching') {
          questionData.matchOptions = question.matchOptions || [];
        }
        if (question.type === 'code_output') {
          questionData.codeSnippet = question.codeSnippet || '';
          questionData.codeLanguage = question.codeLanguage || 'javascript';
        }
        if (question.id) {
          await setDoc(doc(db, 'questions', question.id), questionData, { merge: true });
        } else {
          const newRef = await addDoc(collection(db, 'questions'), questionData);
          updatedQuestions[i] = { ...question, id: newRef.id };
        }
      }
      setQuestions(updatedQuestions);
      // If this was a new quiz, update the URL and internal ID without a full navigation
      if (isNew && savedQuizId) {
        setEffectiveQuizId(savedQuizId);
        window.history.replaceState(null, '', `/quiz/${savedQuizId}`);
      }
      // Reset dirty tracking so the editor knows we're clean
      const newSnapshot = JSON.stringify({ title, description, questions: updatedQuestions, visibility, selectedCollectionId, coverImageUrl, selectedColor });
      setSavedSnapshot(newSnapshot);
      justSavedRef.current = false;
      addToast('success', 'Quiz saved');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      addToast('error', `Failed to save quiz: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const activeQ = questions[activeIndex] as (Omit<Question, 'id'> & { id?: string }) | undefined;

  if (loadingQuestions) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-brand/30 border-t-brand rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-gray-50 dark:bg-surface-dark text-gray-900 dark:text-white">
      {/* ── Header ── */}
      <header className="h-14 flex items-center justify-between px-4 bg-white dark:bg-white/5 border-b border-gray-200 dark:border-white/10 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigateGuard('/dashboard')}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-gray-500 dark:text-white/60 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Untitled Quiz"
            className="text-lg font-bold bg-transparent border-none outline-none text-gray-900 dark:text-white placeholder:text-gray-300 dark:placeholder:text-white/30 w-64 focus:ring-0"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAiModal(true)}
            className="px-4 py-2 bg-linear-to-r from-red-500 to-pink-400 text-white font-medium rounded-xl hover:brightness-110 transition-all flex items-center gap-2 text-sm"
          >
            <Sparkles className="w-4 h-4" />
            AI Generate
          </button>
          {!isNew && (
            <button
              onClick={() => navigateGuard(`/quiz/${quizId}/preview`)}
              className="px-4 py-2 border border-gray-200 dark:border-white/10 text-gray-600 dark:text-white/70 font-medium rounded-xl hover:bg-gray-50 dark:hover:bg-white/10 transition-colors flex items-center gap-2 text-sm"
            >
              <Eye className="w-4 h-4" />
              Preview
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 bg-brand text-white font-semibold rounded-xl hover:bg-brand-dark transition-colors disabled:opacity-50 text-sm"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </header>

      {/* ── Validation Errors Banner ── */}
      {validationErrors.length > 0 && (
        <div className="px-4 py-2 bg-danger/10 border-b border-danger/20 flex items-start gap-3">
          <div className="flex-1">
            <p className="font-medium text-danger text-sm">Please fix the following:</p>
            <ul className="list-disc list-inside text-xs text-danger/80 mt-1 space-y-0.5">
              {validationErrors.map((err, i) => <li key={i}>{err}</li>)}
            </ul>
          </div>
          <button onClick={() => setValidationErrors([])} className="p-1 text-danger/60 hover:text-danger">
            <XIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* ── Left Sidebar – Question List ── */}
        <aside className="w-64 bg-white dark:bg-white/5 border-r border-gray-200 dark:border-white/10 flex flex-col shrink-0 overflow-hidden">
          {/* Add Question Button */}
          <div className="p-3 border-b border-gray-100 dark:border-white/10">
            <button
              onClick={addQuestion}
              className="w-full py-2.5 border-2 border-dashed border-gray-300 dark:border-white/20 rounded-xl text-gray-400 dark:text-white/40 text-sm font-medium hover:border-brand hover:text-brand hover:bg-brand/5 transition-colors flex items-center justify-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              Add Question
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
            {questions.map((q, i) => (
              <div
                key={q.id || i}
                draggable
                onDragStart={() => setDragIndex(i)}
                onDragOver={(e) => { e.preventDefault(); setDragOverIndex(i); }}
                onDragEnd={handleDragEnd}
                onClick={() => setActiveIndex(i)}
                className={`group relative flex items-start gap-2 p-2.5 rounded-xl cursor-pointer transition-all ${
                  activeIndex === i
                    ? 'bg-brand/10 ring-2 ring-brand/30'
                    : 'hover:bg-gray-50 dark:hover:bg-white/10'
                } ${dragOverIndex === i && dragIndex !== i ? 'ring-2 ring-brand' : ''} ${
                  dragIndex === i ? 'opacity-40' : ''
                }`}
              >
                <GripVertical className="w-3.5 h-3.5 text-gray-300 dark:text-white/30 shrink-0 mt-0.5 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className={`text-xs font-bold ${activeIndex === i ? 'text-brand' : 'text-gray-400'}`}>
                      {i + 1}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                      activeIndex === i ? 'bg-brand/20 text-brand' : 'bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-white/60'
                    }`}>
                      {typeLabels[q.type]}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-white/70 truncate leading-tight">
                    {q.text || 'Untitled question'}
                  </p>
                  <div className="flex items-center gap-1 mt-1">
                    <Clock className="w-3 h-3 text-gray-400 dark:text-white/40 shrink-0" />
                    <span className="text-[10px] text-gray-400 dark:text-white/40">{q.timeLimitSec}s</span>
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); quickRemoveQuestion(i); }}
                  className="absolute top-1.5 right-1.5 p-1 rounded-lg bg-white/80 dark:bg-white/10 text-gray-400 dark:text-white/40 hover:bg-danger/10 hover:text-danger opacity-0 group-hover:opacity-100 transition-all shadow-sm"
                  title="Remove question"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </aside>

        {/* ── Center – Question Editor ── */}
        <main className="flex-1 overflow-y-auto">
          {activeQ ? (
            <div className="max-w-2xl mx-auto px-6 py-6 space-y-4">
              {/* Inline toolbar: type + time + actions */}
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={activeQ.type}
                  onChange={(e) => updateQuestionType(activeIndex, e.target.value as QuestionType)}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 text-xs font-medium text-gray-700 dark:text-white/70 focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none bg-white dark:bg-white/5"
                >
                  {(['mcq', 'tf', 'short', 'matching', 'fill_blank', 'ordering', 'poll', 'slide', 'code_output'] as QuestionType[]).map((t) => (
                    <option key={t} value={t}>{typeLabels[t]}</option>
                  ))}
                </select>
                <select
                  value={activeQ.timeLimitSec}
                  onChange={(e) => updateQuestion(activeIndex, { timeLimitSec: parseInt(e.target.value) })}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 text-xs font-medium text-gray-700 dark:text-white/70 focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none bg-white dark:bg-white/5"
                >
                  {[5, 10, 15, 20, 30, 45, 60, 90, 120].map((s) => (
                    <option key={s} value={s}>{s}s</option>
                  ))}
                </select>
                <div className="flex items-center border border-gray-200 dark:border-white/10 rounded-lg overflow-hidden bg-white dark:bg-white/5 ml-auto">
                  <button
                    onClick={() => moveQuestion(activeIndex, -1)}
                    disabled={activeIndex === 0}
                    className="p-1.5 hover:bg-gray-50 dark:hover:bg-white/10 disabled:opacity-30 transition-colors text-gray-500 dark:text-white/60 border-r border-gray-200 dark:border-white/10"
                    title="Move up"
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => moveQuestion(activeIndex, 1)}
                    disabled={activeIndex === questions.length - 1}
                    className="p-1.5 hover:bg-gray-50 dark:hover:bg-white/10 disabled:opacity-30 transition-colors text-gray-500 dark:text-white/60 border-r border-gray-200 dark:border-white/10"
                    title="Move down"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => duplicateQuestion(activeIndex)}
                    className="p-1.5 hover:bg-gray-50 dark:hover:bg-white/10 transition-colors text-gray-500 dark:text-white/60 border-r border-gray-200 dark:border-white/10"
                    title="Duplicate"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => removeQuestion(activeIndex)}
                    className="p-1.5 hover:bg-danger/10 transition-colors text-gray-400 dark:text-white/40 hover:text-danger"
                    title="Delete question"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Question Text */}
              <div className="bg-white dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/10 shadow-sm">
                <textarea
                  value={activeQ.text}
                  onChange={(e) => {
                    updateQuestion(activeIndex, { text: e.target.value });
                    e.target.style.height = 'auto';
                    e.target.style.height = e.target.scrollHeight + 'px';
                  }}
                  ref={(el) => {
                    if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }
                  }}
                  placeholder={activeQ.type === 'fill_blank' ? 'Enter question with ___ for blanks' : 'Click to start typing your question'}
                  rows={2}
                  className="w-full px-6 py-5 text-xl font-medium text-center text-gray-900 dark:text-white placeholder:text-gray-300 dark:placeholder:text-white/30 border-none outline-none resize-none bg-transparent wrap-break-word"
                />
              </div>

              {/* Media Upload */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <ImageUpload
                    currentUrl={activeQ.imageUrl}
                    onUpload={(url) => updateQuestion(activeIndex, { imageUrl: url })}
                    path={`questions/${quizId || 'new'}`}
                  />
                </div>
                <div className="flex-1">
                  <div className="border-2 border-dashed border-gray-200 dark:border-white/10 rounded-xl p-4 text-center hover:border-gray-300 dark:hover:border-white/20 transition-colors">
                    <ImageIcon className="w-5 h-5 text-gray-300 dark:text-white/30 mx-auto mb-1" />
                    <input
                      value={activeQ.videoUrl || ''}
                      onChange={(e) => updateQuestion(activeIndex, { videoUrl: e.target.value || undefined })}
                      placeholder="YouTube URL"
                      className="w-full text-center text-sm bg-transparent border-none outline-none text-gray-600 dark:text-white/70 placeholder:text-gray-300 dark:placeholder:text-white/30"
                    />
                  </div>
                </div>
              </div>

              {/* ── Answer Area ── */}

              {/* MCQ / TF / Poll — Colored 2×2 Cards */}
              {(activeQ.type === 'mcq' || activeQ.type === 'tf' || activeQ.type === 'poll') && (
                <div className="grid grid-cols-2 gap-3">
                  {activeQ.options.map((opt, oi) => {
                    const card = ANSWER_CARDS[oi % ANSWER_CARDS.length];
                    const isCorrect = activeQ.type !== 'poll' && activeQ.correctAnswers.includes(opt) && opt !== '';
                    return (
                      <div
                        key={oi}
                        className={`relative ${card.bg} rounded-2xl p-4 min-h-20 flex items-start gap-3 shadow-sm transition-all ${
                          isCorrect ? 'ring-3 ring-white/60' : ''
                        }`}
                      >
                        <textarea
                          value={opt}
                          onChange={(e) => {
                            const newOpts = [...activeQ.options];
                            newOpts[oi] = e.target.value;
                            updateQuestion(activeIndex, { options: newOpts });
                            e.target.style.height = 'auto';
                            e.target.style.height = e.target.scrollHeight + 'px';
                          }}
                          ref={(el) => {
                            if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }
                          }}
                          placeholder={card.placeholder}
                          disabled={activeQ.type === 'tf'}
                          rows={1}
                          className="flex-1 bg-transparent border-none outline-none text-white font-medium placeholder:text-white/40 text-base resize-none wrap-break-word"
                        />
                        {activeQ.type !== 'poll' && (
                          <button
                            onClick={() => {
                              if (opt === '') return;
                              const correct = isCorrect
                                ? activeQ.correctAnswers.filter((a) => a !== opt)
                                : [...activeQ.correctAnswers, opt];
                              updateQuestion(activeIndex, { correctAnswers: correct });
                            }}
                            className={`w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 mt-1 transition-all ${
                              isCorrect
                                ? 'border-white bg-white text-green-600'
                                : 'border-white/40 hover:border-white/70'
                            }`}
                          >
                            {isCorrect && <Check className="w-4 h-4" />}
                          </button>
                        )}
                      </div>
                    );
                  })}

                  {/* Add/Remove option (MCQ/Poll only, not TF) */}
                  {activeQ.type !== 'tf' && (
                    <div className="col-span-2 flex items-center justify-center gap-3">
                      {activeQ.options.length < 6 && (
                        <button
                          onClick={() => updateQuestion(activeIndex, { options: [...activeQ.options, ''] })}
                          className="flex items-center gap-1.5 text-sm text-gray-400 dark:text-white/40 font-medium hover:text-brand transition-colors"
                        >
                          <Plus className="w-4 h-4" /> Add option
                        </button>
                      )}
                      {activeQ.options.length > 2 && (
                        <button
                          onClick={() => {
                            const newOpts = activeQ.options.slice(0, -1);
                            const removed = activeQ.options[activeQ.options.length - 1];
                            const newCorrect = activeQ.correctAnswers.filter((a) => a !== removed);
                            updateQuestion(activeIndex, { options: newOpts, correctAnswers: newCorrect });
                          }}
                          className="flex items-center gap-1.5 text-sm text-gray-400 dark:text-white/40 font-medium hover:text-danger transition-colors"
                        >
                          <Minus className="w-4 h-4" /> Remove last
                        </button>
                      )}
                    </div>
                  )}

                  {activeQ.type === 'poll' && (
                    <p className="col-span-2 text-xs text-gray-400 dark:text-white/40 text-center">Polls gather opinions — all answers are accepted, no scoring.</p>
                  )}
                </div>
              )}

              {/* Short Answer */}
              {activeQ.type === 'short' && (
                <div className="bg-white dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/10 shadow-sm p-6">
                  <label className="text-sm font-medium text-gray-600 dark:text-white/70 mb-2 block">Accepted Answers (comma-separated)</label>
                  <input
                    value={activeQ.correctAnswers.join(', ')}
                    onChange={(e) => updateQuestion(activeIndex, {
                      correctAnswers: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                    })}
                    placeholder="answer1, answer2"
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-white/20 bg-white dark:bg-white/5 focus:ring-2 focus:ring-brand/30 focus:border-brand outline-none text-gray-900 dark:text-white"
                  />
                </div>
              )}

              {/* Matching Editor */}
              {activeQ.type === 'matching' && (
                <div className="bg-white dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/10 shadow-sm p-6 space-y-3">
                  <label className="text-sm font-medium text-gray-600 dark:text-white/70">Match Pairs</label>
                  {activeQ.options.map((leftItem, pi) => (
                    <div key={pi} className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 dark:text-white/40 w-5 text-center shrink-0">{pi + 1}</span>
                      <input
                        value={leftItem}
                        onChange={(e) => {
                          const newOpts = [...activeQ.options];
                          newOpts[pi] = e.target.value;
                          updateQuestion(activeIndex, { options: newOpts });
                        }}
                        placeholder={`Left item ${pi + 1}`}
                        className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-white/20 bg-white dark:bg-white/5 focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none text-gray-800 dark:text-white"
                      />
                      <span className="text-gray-400 dark:text-white/40 text-sm">&rarr;</span>
                      <input
                        value={activeQ.matchOptions?.[pi] || ''}
                        onChange={(e) => {
                          const newMatch = [...(activeQ.matchOptions || [])];
                          newMatch[pi] = e.target.value;
                          updateQuestion(activeIndex, { matchOptions: newMatch });
                        }}
                        placeholder={`Right item ${pi + 1}`}
                        className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-white/20 bg-white dark:bg-white/5 focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none text-gray-800 dark:text-white"
                      />
                      {activeQ.options.length > 2 && (
                        <button
                          onClick={() => {
                            const newOpts = activeQ.options.filter((_, idx) => idx !== pi);
                            const newMatch = (activeQ.matchOptions || []).filter((_, idx) => idx !== pi);
                            updateQuestion(activeIndex, { options: newOpts, matchOptions: newMatch });
                          }}
                          className="p-1.5 rounded-lg hover:bg-danger/10 text-danger transition-colors"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={() => {
                      updateQuestion(activeIndex, {
                        options: [...activeQ.options, ''],
                        matchOptions: [...(activeQ.matchOptions || []), ''],
                      });
                    }}
                    className="flex items-center gap-1.5 text-sm text-brand font-medium hover:text-brand-dark transition-colors"
                  >
                    <Plus className="w-4 h-4" /> Add Pair
                  </button>
                </div>
              )}

              {/* Ordering Editor */}
              {activeQ.type === 'ordering' && (
                <div className="bg-white dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/10 shadow-sm p-6 space-y-3">
                  <label className="text-sm font-medium text-gray-600 dark:text-white/70">Items in correct order (top = first)</label>
                  {activeQ.options.map((item, oi) => (
                    <div key={oi} className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 dark:text-white/40 w-5 text-center shrink-0">{oi + 1}</span>
                      <input
                        value={item}
                        onChange={(e) => {
                          const newOpts = [...activeQ.options];
                          newOpts[oi] = e.target.value;
                          updateQuestion(activeIndex, { options: newOpts });
                        }}
                        placeholder={`Item ${oi + 1}`}
                        className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none text-gray-800 dark:text-white"
                      />
                      <button onClick={() => moveOption(activeIndex, oi, -1)} disabled={oi === 0} className="p-1 text-gray-400 dark:text-white/40 hover:text-gray-600 dark:hover:text-white/70 disabled:opacity-30"><ChevronUp className="w-4 h-4" /></button>
                      <button onClick={() => moveOption(activeIndex, oi, 1)} disabled={oi === activeQ.options.length - 1} className="p-1 text-gray-400 dark:text-white/40 hover:text-gray-600 dark:hover:text-white/70 disabled:opacity-30"><ChevronDown className="w-4 h-4" /></button>
                      {activeQ.options.length > 2 && (
                        <button
                          onClick={() => updateQuestion(activeIndex, { options: activeQ.options.filter((_, idx) => idx !== oi) })}
                          className="p-1.5 rounded-lg hover:bg-danger/10 text-danger transition-colors"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={() => updateQuestion(activeIndex, { options: [...activeQ.options, ''] })}
                    className="flex items-center gap-1.5 text-sm text-brand font-medium hover:text-brand-dark transition-colors"
                  >
                    <Plus className="w-4 h-4" /> Add Item
                  </button>
                  <p className="text-xs text-gray-400 dark:text-white/40">Players will see these items shuffled and must drag them into the correct order.</p>
                </div>
              )}

              {/* Slide */}
              {activeQ.type === 'slide' && (
                <div className="p-5 bg-info/5 border border-info/20 rounded-2xl">
                  <p className="text-sm text-info">This is a content slide — no question or answer. Use the text and image fields above to present information between questions.</p>
                </div>
              )}

              {/* Code Output */}
              {activeQ.type === 'code_output' && (
                <div className="bg-white dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/10 shadow-sm p-6 space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-600 dark:text-white/70 mb-2 block">Language</label>
                    <select
                      value={activeQ.codeLanguage || 'javascript'}
                      onChange={(e) => updateQuestion(activeIndex, { codeLanguage: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-white/10 bg-white dark:bg-white/5 focus:ring-2 focus:ring-brand/30 focus:border-brand outline-none text-gray-900 dark:text-white"
                    >
                      {['JavaScript', 'Python', 'Java', 'C', 'C++', 'C#', 'PHP', 'TypeScript', 'Dart', 'Go', 'Ruby', 'Kotlin', 'Swift', 'Rust', 'SQL', 'HTML', 'CSS'].map((lang) => (
                        <option key={lang} value={lang.toLowerCase()}>{lang}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600 dark:text-white/70 mb-2 block">Code Snippet</label>
                    <div className="relative rounded-xl overflow-hidden border border-gray-300 dark:border-white/10 focus-within:ring-2 focus-within:ring-brand/30 focus-within:border-brand">
                      <div className="flex items-center justify-between bg-gray-800 dark:bg-gray-800 px-4 py-2 border-b border-gray-700 dark:border-gray-700">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
                          <span className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
                          <span className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
                          <span className="ml-3 text-xs text-gray-400 dark:text-gray-400">{activeQ.codeLanguage || 'code'}</span>
                        </div>
                      </div>
                      <div className="flex bg-gray-900 dark:bg-gray-900">
                        {/* Line numbers */}
                        <div className="select-none text-right pr-3 pl-3 py-3 text-xs font-mono text-gray-600 dark:text-gray-600 leading-relaxed border-r border-gray-200 dark:border-gray-200" aria-hidden="true">
                          {(activeQ.codeSnippet || '\n').split('\n').map((_, i) => (
                            <div key={i}>{i + 1}</div>
                          ))}
                        </div>
                        <textarea
                          value={activeQ.codeSnippet || ''}
                          onChange={(e) => updateQuestion(activeIndex, { codeSnippet: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Tab') {
                              e.preventDefault();
                              const ta = e.currentTarget;
                              const start = ta.selectionStart;
                              const end = ta.selectionEnd;
                              const val = ta.value;
                              const updated = val.substring(0, start) + '  ' + val.substring(end);
                              updateQuestion(activeIndex, { codeSnippet: updated });
                              requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = start + 2; });
                            }
                          }}
                          placeholder="Write or paste your code here..."
                          rows={8}
                          spellCheck={false}
                          className="flex-1 px-4 py-3 bg-gray-900 dark:bg-gray-900 text-gray-100 dark:text-gray-100 font-mono text-sm leading-relaxed outline-none resize-y placeholder:text-gray-600 dark:placeholder:text-gray-600 min-h-50"
                        />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600 dark:text-white/70 mb-2 block">Expected Output (one accepted answer per line)</label>
                    <textarea
                      value={activeQ.correctAnswers.join('\n')}
                      onChange={(e) => updateQuestion(activeIndex, {
                        correctAnswers: e.target.value.split('\n').filter((s) => s.trim()),
                      })}
                      placeholder={'e.g.\nGuest\nRindra'}
                      rows={3}
                      className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-white/10 bg-white dark:bg-white/5 focus:ring-2 focus:ring-brand/30 focus:border-brand outline-none text-gray-900 dark:text-white resize-none font-mono text-sm"
                    />
                  </div>

                  {/* Live Preview */}
                  {activeQ.codeSnippet?.trim() && (
                    <div>
                      <label className="text-sm font-medium text-gray-600 dark:text-white/70 mb-2 flex items-center gap-1.5">
                        <Eye className="w-3.5 h-3.5" />
                        Student Preview
                      </label>
                      <div className="rounded-xl bg-linear-to-b from-[#070D1A] via-[#0E1F3F] to-[#1A3263] p-5 space-y-4">
                        <p className="text-white font-bold text-center text-base">{activeQ.text || 'Question text will appear here'}</p>
                        <CodeBlock code={activeQ.codeSnippet} language={activeQ.codeLanguage} />
                        <div className="max-w-xs mx-auto px-4 py-3 rounded-xl border-2 border-white/20 bg-white/10 text-center text-white/30 text-sm">
                          Student types answer here...
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Fill in the Blank */}
              {activeQ.type === 'fill_blank' && (
                <div className="bg-white dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/10 shadow-sm p-6 space-y-3">
                  <p className="text-xs text-gray-500 dark:text-white/50">Use <code className="bg-gray-100 dark:bg-white/10 px-1.5 py-0.5 rounded text-brand font-mono">___</code> (three underscores) in the question text to mark each blank.</p>
                  {(() => {
                    const blankCount = (activeQ.text.match(/___/g) || []).length;
                    const answers = activeQ.correctAnswers.length >= blankCount
                      ? activeQ.correctAnswers.slice(0, blankCount)
                      : [...activeQ.correctAnswers, ...Array(blankCount - activeQ.correctAnswers.length).fill('')];
                    if (blankCount === 0) return <p className="text-sm text-gray-400 dark:text-white/40">No blanks detected — add ___ to your question text above.</p>;
                    return (
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-600 dark:text-white/70">Answers for each blank</label>
                        {answers.map((ans: string, ai: number) => (
                          <div key={ai} className="flex items-center gap-2">
                            <span className="text-xs text-gray-400 dark:text-white/40 shrink-0 w-16">Blank {ai + 1}</span>
                            <input
                              value={ans}
                              onChange={(e) => {
                                const newAnswers = [...answers];
                                newAnswers[ai] = e.target.value;
                                updateQuestion(activeIndex, { correctAnswers: newAnswers });
                              }}
                              placeholder={`Answer for blank ${ai + 1}`}
                              className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none text-gray-800 dark:text-white"
                            />
                          </div>
                        ))}
                        <p className="text-xs text-gray-400 dark:text-white/40">Matching is case-insensitive.</p>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          ) : (
            /* Empty State */
            <div className="flex-1 flex items-center justify-center h-full">
              <div className="text-center">
                <FileText className="w-16 h-16 text-gray-200 dark:text-white/20 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-400 dark:text-white/40 mb-1">No questions yet</h3>
                <p className="text-sm text-gray-400 dark:text-white/40 mb-4">Add your first question to get started</p>
                <button
                  onClick={addQuestion}
                  className="px-5 py-2.5 bg-brand text-white font-medium rounded-xl hover:bg-brand-dark transition-colors text-sm"
                >
                  <Plus className="w-4 h-4 inline mr-1.5" />
                  Add Question
                </button>
              </div>
            </div>
          )}
        </main>

        {/* ── Right Sidebar – Quiz Settings ── */}
        <aside className="w-64 bg-white dark:bg-white/5 border-l border-gray-200 dark:border-white/10 flex flex-col shrink-0 overflow-y-auto">
          <div className="p-4 space-y-4">
            <label className="text-xs font-semibold text-gray-500 dark:text-white/50 uppercase tracking-wide flex items-center gap-1.5">
              <Type className="w-3.5 h-3.5" />
              Quiz settings
            </label>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 dark:text-white/50 mb-1 block">Cover Image</label>
                <ImageUpload
                  currentUrl={coverImageUrl}
                  onUpload={(url) => setCoverImageUrl(url)}
                  path={`quizzes/${quizId || 'new'}`}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-white/50 mb-1 block">Card Color</label>
                <div className="flex gap-2 flex-wrap">
                  {COLLECTION_COLORS.map((c) => (
                    <button
                      key={c.key}
                      onClick={() => setSelectedColor(selectedColor === c.key ? '' : c.key)}
                      className={`w-7 h-7 rounded-full ${c.bg} border-2 border-gray-200 transition-all ${
                        selectedColor === c.key ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : 'hover:scale-105'
                      }`}
                      title={c.label}
                    />
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-white/50 mb-1 block">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief description"
                  rows={2}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none text-gray-800 dark:text-white resize-y"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-white/50 mb-1 block">Visibility</label>
                <select
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value as 'private' | 'org' | 'public')}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none text-gray-800 dark:text-white"
                >
                  <option value="private">Private</option>
                  <option value="public">Public</option>
                </select>
              </div>
              {collections.length > 0 && (
                <div>
                  <label className="text-xs text-gray-500 dark:text-white/50 mb-1 block">Collection</label>
                  <select
                    value={selectedCollectionId}
                    onChange={(e) => setSelectedCollectionId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none text-gray-800 dark:text-white"
                  >
                    <option value="">None</option>
                    {collections.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* ── AI Generate Modal ── */}
      <AiGenerateModal
        open={showAiModal}
        onClose={() => setShowAiModal(false)}
        generateMeta={false}
        defaultTopic={title.trim()}
        defaultDescription={existingQuestionsSummary}
        onGenerated={(data) => {
          const validTypes: QuestionType[] = ['mcq', 'tf', 'short', 'matching', 'fill_blank', 'ordering', 'poll', 'slide', 'code_output'];
          const generated = data.questions.map((q) => ({
            ...q,
            type: validTypes.includes(q.type) ? q.type : 'mcq',
            quizId: quizId || '',
            matchOptions: q.matchOptions || undefined,
          }));
          setQuestions([...questions, ...generated]);
          setActiveIndex(questions.length);
        }}
      />
    </div>
  );
}
