import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, setDoc, collection, addDoc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuthStore } from '../../stores/authStore';
import { useToastStore } from '../../stores/toastStore';
import ImageUpload from '../../components/ImageUpload';
import { ChevronUp, ChevronDown, Copy, Trash2, Check, Eye } from 'lucide-react';
import type { Quiz, Question, QuestionType } from '../../types/models';

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
};

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

  useEffect(() => {
    if (isNew || !quizId) return;
    const loadQuizAndQuestions = async () => {
      setLoadingQuestions(true);
      const quizDoc = await getDoc(doc(db, 'quizzes', quizId));
      if (quizDoc.exists()) {
        const data = quizDoc.data() as Quiz;
        setTitle(data.title);
        setDescription(data.description);
      }
      const q = query(collection(db, 'questions'), where('quizId', '==', quizId));
      const snapshot = await getDocs(q);
      setQuestions(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as (Question & { id: string })[]);
      setLoadingQuestions(false);
    };
    loadQuizAndQuestions();
  }, [quizId, isNew]);

  const addQuestion = () => setQuestions([...questions, emptyQuestion(quizId || '')]);

  const updateQuestion = (index: number, updates: Partial<Question>) => {
    setQuestions(questions.map((q, i) => (i === index ? { ...q, ...updates } : q)));
  };

  const updateQuestionType = (index: number, type: QuestionType) => {
    const updates: Partial<Question> = { type };
    if (type === 'tf') { updates.options = ['True', 'False']; updates.correctAnswers = []; }
    else if (type === 'mcq') { updates.options = ['', '', '', '']; updates.correctAnswers = []; }
    else { updates.options = []; updates.correctAnswers = []; }
    updateQuestion(index, updates);
  };

  const removeQuestion = (index: number) => setQuestions(questions.filter((_, i) => i !== index));

  const moveQuestion = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= questions.length) return;
    const reordered = [...questions];
    [reordered[index], reordered[newIndex]] = [reordered[newIndex], reordered[index]];
    setQuestions(reordered);
  };

  const duplicateQuestion = (index: number) => {
    const copy = { ...questions[index], id: undefined };
    const updated = [...questions];
    updated.splice(index + 1, 0, copy);
    setQuestions(updated);
  };

  const validate = (): string[] => {
    const errors: string[] = [];
    if (!title.trim()) errors.push('Quiz title is required.');
    if (questions.length === 0) errors.push('Add at least one question.');
    questions.forEach((q, i) => {
      const num = i + 1;
      if (!q.text.trim()) errors.push(`Q${num}: Question text is required.`);
      if (q.correctAnswers.length === 0) errors.push(`Q${num}: Mark at least one correct answer.`);
      if (q.type !== 'short' && q.options.some((o) => !o.trim())) {
        errors.push(`Q${num}: All options must be filled in.`);
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
          ownerId: user.id, title, description, visibility: 'private',
          createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        });
        savedQuizId = quizRef.id;
      } else if (savedQuizId) {
        await setDoc(doc(db, 'quizzes', savedQuizId), {
          ownerId: user.id, title, description, visibility: 'private', updatedAt: serverTimestamp(),
        }, { merge: true });
      }
      for (const question of questions) {
        const questionData = {
          quizId: savedQuizId, type: question.type, text: question.text,
          imageUrl: question.imageUrl || null, options: question.options,
          correctAnswers: question.correctAnswers, timeLimitSec: question.timeLimitSec,
        };
        if (question.id) await setDoc(doc(db, 'questions', question.id), questionData, { merge: true });
        else await addDoc(collection(db, 'questions'), questionData);
      }
      navigate('/dashboard');
    } catch {
      addToast('error', 'Failed to save quiz. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loadingQuestions) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-brand/30 border-t-brand rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-gray-900">{isNew ? 'Create Quiz' : 'Edit Quiz'}</h1>
        <div className="flex items-center gap-3">
          {!isNew && (
            <button
              onClick={() => navigate(`/quiz/${quizId}/preview`)}
              className="px-4 py-2.5 border border-gray-200 text-gray-600 font-medium rounded-xl hover:bg-gray-50 transition-colors flex items-center gap-2"
            >
              <Eye className="w-4 h-4" />
              Preview
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 bg-brand text-white font-semibold rounded-xl hover:bg-brand-dark transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Quiz'}
          </button>
        </div>
      </div>

      {/* Quiz Meta */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Biology Chapter 5 Review"
            className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand/30 focus:border-brand outline-none transition-all text-gray-900"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description of this quiz"
            rows={2}
            className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand/30 focus:border-brand outline-none transition-all text-gray-900 resize-none"
          />
        </div>
      </div>

      {/* Validation Errors */}
      {validationErrors.length > 0 && (
        <div className="mb-6 p-4 bg-danger/10 border border-danger/20 rounded-xl">
          <p className="font-medium text-danger text-sm mb-2">Please fix the following:</p>
          <ul className="list-disc list-inside text-sm text-danger/80 space-y-1">
            {validationErrors.map((err, i) => <li key={i}>{err}</li>)}
          </ul>
        </div>
      )}

      {/* Questions */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-900">Questions ({questions.length})</h2>
      </div>

      <div className="space-y-4">
        {questions.map((q, i) => (
          <div key={q.id || i} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden animate-fade-in">
            {/* Question Header */}
            <div className="flex items-center justify-between px-6 py-3 bg-gray-50 border-b border-gray-100">
              <span className="font-semibold text-sm text-gray-600">Question {i + 1}</span>
              <div className="flex items-center gap-1">
                <button onClick={() => moveQuestion(i, -1)} disabled={i === 0} className="p-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-30 transition-colors text-gray-500"><ChevronUp className="w-4 h-4" /></button>
                <button onClick={() => moveQuestion(i, 1)} disabled={i === questions.length - 1} className="p-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-30 transition-colors text-gray-500"><ChevronDown className="w-4 h-4" /></button>
                <button onClick={() => duplicateQuestion(i)} className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors text-gray-500"><Copy className="w-4 h-4" /></button>
                <button onClick={() => removeQuestion(i)} className="p-1.5 rounded-lg hover:bg-danger/10 transition-colors text-danger"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {/* Type Selector */}
              <div className="flex gap-2">
                {(['mcq', 'tf', 'short'] as QuestionType[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => updateQuestionType(i, t)}
                    className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                      q.type === t ? 'bg-brand text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    {typeLabels[t]}
                  </button>
                ))}
              </div>

              {/* Question Text */}
              <input
                value={q.text}
                onChange={(e) => updateQuestion(i, { text: e.target.value })}
                placeholder="Enter your question"
                className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand/30 focus:border-brand outline-none transition-all text-gray-900 text-lg"
              />

              <ImageUpload
                currentUrl={q.imageUrl}
                onUpload={(url) => updateQuestion(i, { imageUrl: url })}
                path={`questions/${quizId || 'new'}`}
              />

              {/* Time Limit */}
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-600">Time limit:</label>
                <select
                  value={q.timeLimitSec}
                  onChange={(e) => updateQuestion(i, { timeLimitSec: parseInt(e.target.value) })}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-700"
                >
                  {[5, 10, 15, 20, 30, 45, 60, 90, 120].map((s) => (
                    <option key={s} value={s}>{s}s</option>
                  ))}
                </select>
              </div>

              {/* Options (MCQ / TF) */}
              {q.type !== 'short' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-600">Answer Options</label>
                  {q.options.map((opt, oi) => {
                    const isCorrect = q.correctAnswers.includes(opt) && opt !== '';
                    return (
                      <div key={oi} className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            if (opt === '') return;
                            const correct = isCorrect
                              ? q.correctAnswers.filter((a) => a !== opt)
                              : [...q.correctAnswers, opt];
                            updateQuestion(i, { correctAnswers: correct });
                          }}
                          className={`w-8 h-8 rounded-lg border-2 flex items-center justify-center shrink-0 transition-colors ${
                            isCorrect ? 'border-success bg-success text-white' : 'border-gray-300 hover:border-gray-400'
                          }`}
                        >
                          {isCorrect && <Check className="w-4 h-4" />}
                        </button>
                        <input
                          value={opt}
                          onChange={(e) => {
                            const newOpts = [...q.options];
                            newOpts[oi] = e.target.value;
                            updateQuestion(i, { options: newOpts });
                          }}
                          placeholder={`Option ${oi + 1}`}
                          disabled={q.type === 'tf'}
                          className="flex-1 px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none text-gray-800"
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Short Answer */}
              {q.type === 'short' && (
                <div>
                  <label className="text-sm font-medium text-gray-600 mb-1.5 block">Accepted Answers (comma-separated)</label>
                  <input
                    value={q.correctAnswers.join(', ')}
                    onChange={(e) => updateQuestion(i, {
                      correctAnswers: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                    })}
                    placeholder="answer1, answer2"
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand/30 focus:border-brand outline-none text-gray-900"
                  />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Add Question Button */}
      <button
        onClick={addQuestion}
        className="w-full mt-4 py-4 border-2 border-dashed border-gray-300 rounded-2xl text-gray-400 font-medium hover:border-brand hover:text-brand hover:bg-brand/5 transition-colors"
      >
        + Add Question
      </button>
    </div>
  );
}
