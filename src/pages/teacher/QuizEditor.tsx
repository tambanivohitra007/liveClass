import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, setDoc, collection, addDoc, serverTimestamp, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../lib/firebase';
import { useAuthStore } from '../../stores/authStore';
import { useToastStore } from '../../stores/toastStore';
import ImageUpload from '../../components/ImageUpload';
import { confirmAction } from '../../lib/swal';
import {
  GripVertical, ChevronUp, ChevronDown, Copy, Trash2, Check, Eye, Plus, Minus,
  Sparkles, X as XIcon, Triangle, Diamond, Circle, Square, Hexagon, Star, ArrowLeft,
  Clock, Image as ImageIcon, Type, FileText,
} from 'lucide-react';
import type { Quiz, Question, QuestionType, Collection } from '../../types/models';

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
};

const ANSWER_CARDS = [
  { bg: 'bg-answer-red', border: 'border-answer-red', icon: Triangle, placeholder: 'Add answer' },
  { bg: 'bg-answer-blue', border: 'border-answer-blue', icon: Diamond, placeholder: 'Add answer' },
  { bg: 'bg-answer-yellow', border: 'border-answer-yellow', icon: Circle, placeholder: 'Add answer' },
  { bg: 'bg-answer-green', border: 'border-answer-green', icon: Square, placeholder: 'Add answer' },
  { bg: 'bg-answer-purple', border: 'border-answer-purple', icon: Hexagon, placeholder: 'Add answer' },
  { bg: 'bg-answer-orange', border: 'border-answer-orange', icon: Star, placeholder: 'Add answer' },
];

export default function QuizEditor() {
  const { quizId } = useParams<{ quizId: string }>();
  const { user } = useAuthStore();
  const { addToast } = useToastStore();
  const navigate = useNavigate();
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
  const [aiTopic, setAiTopic] = useState('');
  const [aiCount, setAiCount] = useState(5);
  const [aiType, setAiType] = useState<QuestionType>('mcq');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiDifficulty, setAiDifficulty] = useState('mixed');
  const [aiDescription, setAiDescription] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  // ── Unsaved changes tracking ──
  const [savedSnapshot, setSavedSnapshot] = useState<string>('');
  const justSavedRef = useRef(false);
  const currentSnapshot = JSON.stringify({ title, description, questions, visibility, selectedCollectionId, coverImageUrl });
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

  const openAiModal = () => {
    if (title.trim() && !aiTopic.trim()) {
      setAiTopic(title.trim());
    }
    if (questions.length > 0 && !aiDescription.trim()) {
      const summaries = questions
        .filter((q) => q.text.trim())
        .slice(0, 8)
        .map((q, i) => `${i + 1}. ${q.text.trim()}`)
        .join('\n');
      if (summaries) {
        setAiDescription(`Existing questions in this quiz:\n${summaries}\n\nGenerate new questions that complement these.`);
      }
    }
    setShowAiModal(true);
  };

  const handleAiGenerate = async () => {
    if (!aiTopic.trim()) return;
    setAiGenerating(true);
    try {
      const fn = httpsCallable<
        Record<string, unknown>,
        { questions: (Omit<Question, 'id' | 'quizId'> & { matchOptions?: string[] })[]; note?: string }
      >(functions, 'generateQuestions');
      const result = await fn({
        topic: aiTopic,
        count: aiCount,
        questionType: aiType,
        description: aiDescription,
        difficulty: aiDifficulty,
      });
      const generated = result.data.questions.map((q) => {
        // Normalize correctAnswers to match exact option text (AI may return slight mismatches)
        let correctAnswers = q.correctAnswers || [];
        if (q.options && q.options.length > 0 && correctAnswers.length > 0) {
          correctAnswers = correctAnswers.map((ca) => {
            const exact = q.options.find((o) => o === ca);
            if (exact) return exact;
            // Fallback: case-insensitive match
            const fuzzy = q.options.find((o) => o.trim().toLowerCase() === ca.trim().toLowerCase());
            return fuzzy || ca;
          });
        }
        return {
          ...q,
          correctAnswers,
          quizId: quizId || '',
          matchOptions: q.matchOptions || undefined,
        };
      });
      setQuestions([...questions, ...generated]);
      if (result.data.note) addToast('info', result.data.note);
      else addToast('success', `${generated.length} questions generated`);
      setShowAiModal(false);
      setAiTopic('');
      setAiDescription('');
      setActiveIndex(questions.length); // jump to first generated
    } catch {
      addToast('error', 'Failed to generate questions');
    } finally {
      setAiGenerating(false);
    }
  };

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
    setSaving(true);
    try {
      let savedQuizId = quizId;
      if (isNew) {
        const quizRef = await addDoc(collection(db, 'quizzes'), {
          ownerId: user.id, title, description, visibility,
          collectionId: selectedCollectionId || null,
          coverImageUrl: coverImageUrl || null,
          createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        });
        savedQuizId = quizRef.id;
      } else if (savedQuizId) {
        await setDoc(doc(db, 'quizzes', savedQuizId), {
          ownerId: user.id, title, description, visibility,
          collectionId: selectedCollectionId || null,
          coverImageUrl: coverImageUrl || null,
          updatedAt: serverTimestamp(),
        }, { merge: true });
      }
      for (const question of questions) {
        const questionData: Record<string, unknown> = {
          quizId: savedQuizId, type: question.type, text: question.text,
          imageUrl: question.imageUrl || null, videoUrl: question.videoUrl || null,
          options: question.options,
          correctAnswers: question.correctAnswers, timeLimitSec: question.timeLimitSec,
        };
        if (question.type === 'matching') {
          questionData.matchOptions = question.matchOptions || [];
        }
        if (question.id) await setDoc(doc(db, 'questions', question.id), questionData, { merge: true });
        else await addDoc(collection(db, 'questions'), questionData);
      }
      justSavedRef.current = true;
      navigate('/dashboard');
    } catch {
      addToast('error', 'Failed to save quiz. Please try again.');
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
    <div className="h-screen flex flex-col overflow-hidden bg-gray-50">
      {/* ── Header ── */}
      <header className="h-14 flex items-center justify-between px-4 bg-white border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigateGuard('/dashboard')}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Untitled Quiz"
            className="text-lg font-bold bg-transparent border-none outline-none text-gray-900 placeholder:text-gray-300 w-64 focus:ring-0"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openAiModal}
            className="px-4 py-2 bg-gradient-to-r from-red-500 to-pink-400 text-white font-medium rounded-xl hover:brightness-110 transition-all flex items-center gap-2 text-sm"
          >
            <Sparkles className="w-4 h-4" />
            AI Generate
          </button>
          {!isNew && (
            <button
              onClick={() => navigateGuard(`/quiz/${quizId}/preview`)}
              className="px-4 py-2 border border-gray-200 text-gray-600 font-medium rounded-xl hover:bg-gray-50 transition-colors flex items-center gap-2 text-sm"
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
        <aside className="w-64 bg-white border-r border-gray-200 flex flex-col shrink-0 overflow-hidden">
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
                    : 'hover:bg-gray-50'
                } ${dragOverIndex === i && dragIndex !== i ? 'ring-2 ring-brand' : ''} ${
                  dragIndex === i ? 'opacity-40' : ''
                }`}
              >
                <GripVertical className="w-3.5 h-3.5 text-gray-300 shrink-0 mt-0.5 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className={`text-xs font-bold ${activeIndex === i ? 'text-brand' : 'text-gray-400'}`}>
                      {i + 1}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                      activeIndex === i ? 'bg-brand/20 text-brand' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {typeLabels[q.type].split(' ')[0]}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 truncate leading-tight">
                    {q.text || 'Untitled question'}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Add Question Button */}
          <div className="p-3 border-t border-gray-100">
            <button
              onClick={addQuestion}
              className="w-full py-2.5 border-2 border-dashed border-gray-300 rounded-xl text-gray-400 text-sm font-medium hover:border-brand hover:text-brand hover:bg-brand/5 transition-colors flex items-center justify-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              Add Question
            </button>
          </div>
        </aside>

        {/* ── Center – Question Editor ── */}
        <main className="flex-1 overflow-y-auto">
          {activeQ ? (
            <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
              {/* Question Text */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
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
                  className="w-full px-6 py-5 text-xl font-medium text-center text-gray-900 placeholder:text-gray-300 border-none outline-none resize-none bg-transparent break-words"
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
                  <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center hover:border-gray-300 transition-colors">
                    <ImageIcon className="w-5 h-5 text-gray-300 mx-auto mb-1" />
                    <input
                      value={activeQ.videoUrl || ''}
                      onChange={(e) => updateQuestion(activeIndex, { videoUrl: e.target.value || undefined })}
                      placeholder="YouTube URL"
                      className="w-full text-center text-sm bg-transparent border-none outline-none text-gray-600 placeholder:text-gray-300"
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
                    const CardIcon = card.icon;
                    const isCorrect = activeQ.type !== 'poll' && activeQ.correctAnswers.includes(opt) && opt !== '';
                    return (
                      <div
                        key={oi}
                        className={`relative ${card.bg} rounded-2xl p-4 min-h-[80px] flex items-start gap-3 shadow-sm transition-all ${
                          isCorrect ? 'ring-3 ring-white/60' : ''
                        }`}
                      >
                        <CardIcon className="w-6 h-6 text-white/60 shrink-0 mt-1" fill="rgba(255,255,255,0.2)" />
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
                          className="flex-1 bg-transparent border-none outline-none text-white font-medium placeholder:text-white/40 text-base resize-none break-words"
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
                          className="flex items-center gap-1.5 text-sm text-gray-400 font-medium hover:text-brand transition-colors"
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
                          className="flex items-center gap-1.5 text-sm text-gray-400 font-medium hover:text-danger transition-colors"
                        >
                          <Minus className="w-4 h-4" /> Remove last
                        </button>
                      )}
                    </div>
                  )}

                  {activeQ.type === 'poll' && (
                    <p className="col-span-2 text-xs text-gray-400 text-center">Polls gather opinions — all answers are accepted, no scoring.</p>
                  )}
                </div>
              )}

              {/* Short Answer */}
              {activeQ.type === 'short' && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                  <label className="text-sm font-medium text-gray-600 mb-2 block">Accepted Answers (comma-separated)</label>
                  <input
                    value={activeQ.correctAnswers.join(', ')}
                    onChange={(e) => updateQuestion(activeIndex, {
                      correctAnswers: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                    })}
                    placeholder="answer1, answer2"
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand/30 focus:border-brand outline-none text-gray-900"
                  />
                </div>
              )}

              {/* Matching Editor */}
              {activeQ.type === 'matching' && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-3">
                  <label className="text-sm font-medium text-gray-600">Match Pairs</label>
                  {activeQ.options.map((leftItem, pi) => (
                    <div key={pi} className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 w-5 text-center shrink-0">{pi + 1}</span>
                      <input
                        value={leftItem}
                        onChange={(e) => {
                          const newOpts = [...activeQ.options];
                          newOpts[pi] = e.target.value;
                          updateQuestion(activeIndex, { options: newOpts });
                        }}
                        placeholder={`Left item ${pi + 1}`}
                        className="flex-1 px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none text-gray-800"
                      />
                      <span className="text-gray-400 text-sm">&rarr;</span>
                      <input
                        value={activeQ.matchOptions?.[pi] || ''}
                        onChange={(e) => {
                          const newMatch = [...(activeQ.matchOptions || [])];
                          newMatch[pi] = e.target.value;
                          updateQuestion(activeIndex, { matchOptions: newMatch });
                        }}
                        placeholder={`Right item ${pi + 1}`}
                        className="flex-1 px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none text-gray-800"
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
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-3">
                  <label className="text-sm font-medium text-gray-600">Items in correct order (top = first)</label>
                  {activeQ.options.map((item, oi) => (
                    <div key={oi} className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 w-5 text-center shrink-0">{oi + 1}</span>
                      <input
                        value={item}
                        onChange={(e) => {
                          const newOpts = [...activeQ.options];
                          newOpts[oi] = e.target.value;
                          updateQuestion(activeIndex, { options: newOpts });
                        }}
                        placeholder={`Item ${oi + 1}`}
                        className="flex-1 px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none text-gray-800"
                      />
                      <button onClick={() => moveOption(activeIndex, oi, -1)} disabled={oi === 0} className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"><ChevronUp className="w-4 h-4" /></button>
                      <button onClick={() => moveOption(activeIndex, oi, 1)} disabled={oi === activeQ.options.length - 1} className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"><ChevronDown className="w-4 h-4" /></button>
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
                  <p className="text-xs text-gray-400">Players will see these items shuffled and must drag them into the correct order.</p>
                </div>
              )}

              {/* Slide */}
              {activeQ.type === 'slide' && (
                <div className="p-5 bg-info/5 border border-info/20 rounded-2xl">
                  <p className="text-sm text-info">This is a content slide — no question or answer. Use the text and image fields above to present information between questions.</p>
                </div>
              )}

              {/* Fill in the Blank */}
              {activeQ.type === 'fill_blank' && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-3">
                  <p className="text-xs text-gray-500">Use <code className="bg-gray-100 px-1.5 py-0.5 rounded text-brand font-mono">___</code> (three underscores) in the question text to mark each blank.</p>
                  {(() => {
                    const blankCount = (activeQ.text.match(/___/g) || []).length;
                    const answers = activeQ.correctAnswers.length >= blankCount
                      ? activeQ.correctAnswers.slice(0, blankCount)
                      : [...activeQ.correctAnswers, ...Array(blankCount - activeQ.correctAnswers.length).fill('')];
                    if (blankCount === 0) return <p className="text-sm text-gray-400">No blanks detected — add ___ to your question text above.</p>;
                    return (
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-600">Answers for each blank</label>
                        {answers.map((ans: string, ai: number) => (
                          <div key={ai} className="flex items-center gap-2">
                            <span className="text-xs text-gray-400 shrink-0 w-16">Blank {ai + 1}</span>
                            <input
                              value={ans}
                              onChange={(e) => {
                                const newAnswers = [...answers];
                                newAnswers[ai] = e.target.value;
                                updateQuestion(activeIndex, { correctAnswers: newAnswers });
                              }}
                              placeholder={`Answer for blank ${ai + 1}`}
                              className="flex-1 px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none text-gray-800"
                            />
                          </div>
                        ))}
                        <p className="text-xs text-gray-400">Matching is case-insensitive.</p>
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
                <FileText className="w-16 h-16 text-gray-200 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-400 mb-1">No questions yet</h3>
                <p className="text-sm text-gray-400 mb-4">Add your first question to get started</p>
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

        {/* ── Right Sidebar – Settings ── */}
        <aside className="w-72 bg-white border-l border-gray-200 flex flex-col shrink-0 overflow-y-auto">
          {activeQ ? (
            <div className="p-4 space-y-5">
              {/* Question Type */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">Question type</label>
                <select
                  value={activeQ.type}
                  onChange={(e) => updateQuestionType(activeIndex, e.target.value as QuestionType)}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none"
                >
                  {(['mcq', 'tf', 'short', 'matching', 'fill_blank', 'ordering', 'poll', 'slide'] as QuestionType[]).map((t) => (
                    <option key={t} value={t}>{typeLabels[t]}</option>
                  ))}
                </select>
              </div>

              {/* Time Limit */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  Time limit
                </label>
                <select
                  value={activeQ.timeLimitSec}
                  onChange={(e) => updateQuestion(activeIndex, { timeLimitSec: parseInt(e.target.value) })}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none"
                >
                  {[5, 10, 15, 20, 30, 45, 60, 90, 120].map((s) => (
                    <option key={s} value={s}>{s} seconds</option>
                  ))}
                </select>
              </div>

              {/* Quick Actions */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">Actions</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => moveQuestion(activeIndex, -1)}
                    disabled={activeIndex === 0}
                    className="flex flex-col items-center gap-1 p-2 rounded-xl border border-gray-100 hover:bg-gray-50 disabled:opacity-30 transition-colors text-gray-500"
                  >
                    <ChevronUp className="w-4 h-4" />
                    <span className="text-[10px]">Move up</span>
                  </button>
                  <button
                    onClick={() => moveQuestion(activeIndex, 1)}
                    disabled={activeIndex === questions.length - 1}
                    className="flex flex-col items-center gap-1 p-2 rounded-xl border border-gray-100 hover:bg-gray-50 disabled:opacity-30 transition-colors text-gray-500"
                  >
                    <ChevronDown className="w-4 h-4" />
                    <span className="text-[10px]">Move dn</span>
                  </button>
                  <button
                    onClick={() => duplicateQuestion(activeIndex)}
                    className="flex flex-col items-center gap-1 p-2 rounded-xl border border-gray-100 hover:bg-gray-50 transition-colors text-gray-500"
                  >
                    <Copy className="w-4 h-4" />
                    <span className="text-[10px]">Copy</span>
                  </button>
                </div>
              </div>

              <hr className="border-gray-100" />

              {/* Quiz Settings */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <Type className="w-3.5 h-3.5" />
                  Quiz settings
                </label>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Cover Image</label>
                    <ImageUpload
                      currentUrl={coverImageUrl}
                      onUpload={(url) => setCoverImageUrl(url)}
                      path={`quizzes/${quizId || 'new'}`}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Description</label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Brief description"
                      rows={2}
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none text-gray-800 resize-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Visibility</label>
                    <select
                      value={visibility}
                      onChange={(e) => setVisibility(e.target.value as 'private' | 'org' | 'public')}
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none text-gray-800"
                    >
                      <option value="private">Private</option>
                      <option value="public">Public</option>
                    </select>
                  </div>
                  {collections.length > 0 && (
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Collection</label>
                      <select
                        value={selectedCollectionId}
                        onChange={(e) => setSelectedCollectionId(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none text-gray-800"
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

              <hr className="border-gray-100" />

              {/* Delete */}
              <button
                onClick={() => removeQuestion(activeIndex)}
                className="w-full py-2.5 border border-danger/20 text-danger text-sm font-medium rounded-xl hover:bg-danger/5 transition-colors flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Delete Question
              </button>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center p-4">
              <p className="text-sm text-gray-400 text-center">Select a question to see settings</p>
            </div>
          )}
        </aside>
      </div>

      {/* ── AI Generate Modal ── */}
      {showAiModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowAiModal(false)}>
          <div className="bg-white rounded-2xl border-2 border-gray-800 dark:border-gray-300 shadow-[4px_4px_0px_0px_#D4566B] w-full max-w-md animate-bounce-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 pb-0">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-brand" />
                AI Question Generator
              </h3>
              <button onClick={() => setShowAiModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Topic</label>
                <input
                  value={aiTopic}
                  onChange={(e) => setAiTopic(e.target.value)}
                  placeholder="e.g. Photosynthesis, World War II, Python basics"
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-800 dark:border-gray-300 focus:ring-2 focus:ring-brand/30 focus:border-brand outline-none text-gray-900"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Description / Context</label>
                <textarea
                  value={aiDescription}
                  onChange={(e) => setAiDescription(e.target.value)}
                  placeholder="Optional: grade level, specific focus, learning objectives..."
                  rows={2}
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-800 dark:border-gray-300 focus:ring-2 focus:ring-brand/30 focus:border-brand outline-none text-gray-900 resize-none"
                />
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Count</label>
                  <select
                    value={aiCount}
                    onChange={(e) => setAiCount(parseInt(e.target.value))}
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-800 dark:border-gray-300 focus:ring-2 focus:ring-brand/30 focus:border-brand outline-none text-gray-900"
                  >
                    {[3, 5, 7, 10].map((n) => (
                      <option key={n} value={n}>{n} questions</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Type</label>
                  <select
                    value={aiType}
                    onChange={(e) => setAiType(e.target.value as QuestionType)}
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-800 dark:border-gray-300 focus:ring-2 focus:ring-brand/30 focus:border-brand outline-none text-gray-900"
                  >
                    <option value="mcq">Multiple Choice</option>
                    <option value="tf">True / False</option>
                    <option value="short">Short Answer</option>
                    <option value="matching">Matching</option>
                    <option value="ordering">Ordering</option>
                    <option value="fill_blank">Fill in the Blank</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Difficulty</label>
                <select
                  value={aiDifficulty}
                  onChange={(e) => setAiDifficulty(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-800 dark:border-gray-300 focus:ring-2 focus:ring-brand/30 focus:border-brand outline-none text-gray-900"
                >
                  <option value="mixed">Mixed</option>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
              <button
                onClick={handleAiGenerate}
                disabled={aiGenerating || !aiTopic.trim()}
                className="w-full py-3 bg-brand text-white font-semibold rounded-xl border-2 border-gray-800 dark:border-gray-300 shadow-[3px_3px_0px_0px_#D4566B] hover:shadow-[5px_5px_0px_0px_#D4566B] hover:translate-x-[-2px] hover:translate-y-[-2px] transition-all duration-300 disabled:opacity-50 disabled:hover:shadow-[3px_3px_0px_0px_#D4566B] disabled:hover:translate-x-0 disabled:hover:translate-y-0 flex items-center justify-center gap-2"
              >
                {aiGenerating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Generate Questions
                  </>
                )}
              </button>
              <p className="text-xs text-gray-400 text-center">Questions will be added to your quiz. Review and edit them before saving.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
