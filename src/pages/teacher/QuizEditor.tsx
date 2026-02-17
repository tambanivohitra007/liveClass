import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, setDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuthStore } from '../../stores/authStore';
import type { Quiz, Question, QuestionType } from '../../types/models';

const emptyQuestion = (quizId: string): Omit<Question, 'id'> => ({
  quizId,
  type: 'mcq',
  text: '',
  options: ['', '', '', ''],
  correctAnswers: [],
  timeLimitSec: 20,
});

export default function QuizEditor() {
  const { quizId } = useParams<{ quizId: string }>();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const isNew = quizId === 'new';

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [questions, setQuestions] = useState<(Omit<Question, 'id'> & { id?: string })[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isNew || !quizId) return;

    const loadQuiz = async () => {
      const quizDoc = await getDoc(doc(db, 'quizzes', quizId));
      if (quizDoc.exists()) {
        const data = quizDoc.data() as Quiz;
        setTitle(data.title);
        setDescription(data.description);
      }
    };
    loadQuiz();
  }, [quizId, isNew]);

  const addQuestion = () => {
    setQuestions([...questions, emptyQuestion(quizId || '')]);
  };

  const updateQuestion = (index: number, updates: Partial<Question>) => {
    setQuestions(questions.map((q, i) => (i === index ? { ...q, ...updates } : q)));
  };

  const updateQuestionType = (index: number, type: QuestionType) => {
    const updates: Partial<Question> = { type };
    if (type === 'tf') {
      updates.options = ['True', 'False'];
      updates.correctAnswers = [];
    } else if (type === 'mcq') {
      updates.options = ['', '', '', ''];
      updates.correctAnswers = [];
    } else {
      updates.options = [];
      updates.correctAnswers = [];
    }
    updateQuestion(index, updates);
  };

  const removeQuestion = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    try {
      let savedQuizId = quizId;

      if (isNew) {
        const quizRef = await addDoc(collection(db, 'quizzes'), {
          ownerId: user.id,
          title,
          description,
          visibility: 'private',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        savedQuizId = quizRef.id;
      } else if (savedQuizId) {
        await setDoc(doc(db, 'quizzes', savedQuizId), {
          ownerId: user.id,
          title,
          description,
          visibility: 'private',
          updatedAt: serverTimestamp(),
        }, { merge: true });
      }

      for (const question of questions) {
        const questionData = {
          quizId: savedQuizId,
          type: question.type,
          text: question.text,
          imageUrl: question.imageUrl || null,
          options: question.options,
          correctAnswers: question.correctAnswers,
          timeLimitSec: question.timeLimitSec,
        };

        if (question.id) {
          await setDoc(doc(db, 'questions', question.id), questionData, { merge: true });
        } else {
          await addDoc(collection(db, 'questions'), questionData);
        }
      }

      navigate('/dashboard');
    } catch (err) {
      console.error('Failed to save quiz:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h1>{isNew ? 'Create Quiz' : 'Edit Quiz'}</h1>

      <div>
        <label>Title</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Quiz title" />
      </div>
      <div>
        <label>Description</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Quiz description" />
      </div>

      <h2>Questions</h2>
      {questions.map((q, i) => (
        <div key={i} style={{ border: '1px solid #ccc', padding: '1rem', marginBottom: '1rem' }}>
          <div>
            <label>Type</label>
            <select value={q.type} onChange={(e) => updateQuestionType(i, e.target.value as QuestionType)}>
              <option value="mcq">Multiple Choice</option>
              <option value="tf">True / False</option>
              <option value="short">Short Answer</option>
            </select>
          </div>

          <div>
            <label>Question Text</label>
            <input value={q.text} onChange={(e) => updateQuestion(i, { text: e.target.value })} placeholder="Enter question" />
          </div>

          <div>
            <label>Time Limit (seconds)</label>
            <input type="number" value={q.timeLimitSec} onChange={(e) => updateQuestion(i, { timeLimitSec: parseInt(e.target.value) || 20 })} />
          </div>

          {q.type !== 'short' && (
            <div>
              <label>Options</label>
              {q.options.map((opt, oi) => (
                <div key={oi}>
                  <input
                    value={opt}
                    onChange={(e) => {
                      const newOpts = [...q.options];
                      newOpts[oi] = e.target.value;
                      updateQuestion(i, { options: newOpts });
                    }}
                    placeholder={`Option ${oi + 1}`}
                  />
                  <label>
                    <input
                      type="checkbox"
                      checked={q.correctAnswers.includes(opt)}
                      onChange={(e) => {
                        const correct = e.target.checked
                          ? [...q.correctAnswers, opt]
                          : q.correctAnswers.filter((a) => a !== opt);
                        updateQuestion(i, { correctAnswers: correct });
                      }}
                    />
                    Correct
                  </label>
                </div>
              ))}
            </div>
          )}

          {q.type === 'short' && (
            <div>
              <label>Correct Answer(s) (comma-separated)</label>
              <input
                value={q.correctAnswers.join(', ')}
                onChange={(e) => updateQuestion(i, {
                  correctAnswers: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                })}
                placeholder="answer1, answer2"
              />
            </div>
          )}

          <button onClick={() => removeQuestion(i)}>Remove Question</button>
        </div>
      ))}

      <button onClick={addQuestion}>Add Question</button>
      <br />
      <button onClick={handleSave} disabled={saving}>
        {saving ? 'Saving...' : 'Save Quiz'}
      </button>
    </div>
  );
}
