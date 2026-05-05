import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';
import { useToastStore } from '../stores/toastStore';
import { Sparkles, X as XIcon } from 'lucide-react';
import type { Criterion } from '../types/models';

interface AiRubricModalProps {
  open: boolean;
  onClose: () => void;
  onGenerated: (result: { name: string; description: string; criteria: Criterion[] }) => void;
}

const ASSESSMENT_TYPES = [
  'Essay', 'Project', 'Presentation', 'Lab Report', 'Code Review',
  'Research Paper', 'Creative Writing', 'Group Work', 'Portfolio', 'Case Study',
];

const GRADE_LEVELS = ['Elementary', 'Middle School', 'High School', 'University'];

export default function AiRubricModal({ open, onClose, onGenerated }: AiRubricModalProps) {
  const { addToast } = useToastStore();

  const [topic, setTopic] = useState('');
  const [assessmentType, setAssessmentType] = useState('Essay');
  const [criteriaCount, setCriteriaCount] = useState(6);
  const [gradeLevel, setGradeLevel] = useState('');
  const [generating, setGenerating] = useState(false);

  const canGenerate = !generating && topic.trim().length >= 3;

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setGenerating(true);

    try {
      const fn = httpsCallable<
        Record<string, unknown>,
        {
          name: string;
          description: string;
          criteria: Array<{
            id: string;
            name: string;
            type: string;
            weight: number;
            order: number;
            maxScore: number;
            levels: Array<{ label: string; score: number }>;
          }>;
          note?: string;
        }
      >(functions, 'generateRubric');

      const result = await fn({
        topic: topic.trim(),
        assessmentType,
        criteriaCount,
        ...(gradeLevel ? { gradeLevel } : {}),
      });

      const data = result.data;

      // Re-generate client-side IDs and ensure type is 'level'
      const criteria: Criterion[] = data.criteria.map((c, i) => ({
        id: crypto.randomUUID(),
        name: c.name,
        type: 'level' as const,
        weight: c.weight || 1,
        order: i,
        maxScore: c.maxScore || 4,
        levels: c.levels || [],
      }));

      if (data.note) addToast('info', data.note);
      else addToast('success', `${criteria.length} criteria generated`);

      onGenerated({ name: data.name, description: data.description, criteria });
      setTopic('');
      setAssessmentType('Essay');
      setCriteriaCount(6);
      setGradeLevel('');
      onClose();
    } catch (err) {
      const message = (err as { message?: string })?.message || 'Failed to generate rubric';
      addToast('error', message);
    } finally {
      setGenerating(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="AI Rubric Generator"
        className="card-night w-full max-w-md animate-bounce-in max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-0">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-brand" />
            AI Rubric Generator
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-gray-400 dark:text-white/40 transition-colors"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Topic */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-white/70 mb-1.5">Topic</label>
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Photosynthesis, American Revolution, Data Structures"
              className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-white/10 focus:ring-2 focus:ring-brand/30 focus:border-brand outline-none text-gray-900 dark:text-white"
              autoFocus
            />
          </div>

          {/* Assessment Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-white/70 mb-1.5">Assessment Type</label>
            <select
              value={assessmentType}
              onChange={(e) => setAssessmentType(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-white/20 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-brand/30 focus:border-brand outline-none text-gray-900 dark:text-white/80"
            >
              {ASSESSMENT_TYPES.map((t) => (
                <option key={t} value={t} className="bg-white dark:bg-slate-800 text-gray-700 dark:text-white">{t}</option>
              ))}
            </select>
          </div>

          {/* Criteria Count + Grade Level row */}
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-white/70 mb-1.5">Criteria</label>
              <select
                value={criteriaCount}
                onChange={(e) => setCriteriaCount(parseInt(e.target.value))}
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-white/20 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-brand/30 focus:border-brand outline-none text-gray-900 dark:text-white/80"
              >
                {[3, 4, 5, 6, 7, 8].map((n) => (
                  <option key={n} value={n} className="bg-white dark:bg-slate-800 text-gray-700 dark:text-white">{n} criteria</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-white/70 mb-1.5">Grade Level</label>
              <select
                value={gradeLevel}
                onChange={(e) => setGradeLevel(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-white/20 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-brand/30 focus:border-brand outline-none text-gray-900 dark:text-white/80"
              >
                <option value="" className="bg-white dark:bg-slate-800 text-gray-700 dark:text-white">Any</option>
                {GRADE_LEVELS.map((g) => (
                  <option key={g} value={g} className="bg-white dark:bg-slate-800 text-gray-700 dark:text-white">{g}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={!canGenerate}
            className="btn-3d-cyan w-full flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {generating ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Generate Rubric
              </>
            )}
          </button>
          <p className="text-xs text-gray-400 dark:text-white/40 text-center">
            Criteria aligned with Bloom's Taxonomy. Review and edit after generation.
          </p>
        </div>
      </div>
    </div>
  );
}
