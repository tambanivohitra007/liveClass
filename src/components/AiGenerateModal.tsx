import { useState, useRef, useCallback } from 'react';
import { httpsCallable } from 'firebase/functions';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { functions, storage } from '../lib/firebase';
import { useAuthStore } from '../stores/authStore';
import { useToastStore } from '../stores/toastStore';
import {
  Sparkles, X as XIcon, FileText, Link, Upload, Type,
} from 'lucide-react';
import type { Question, QuestionType } from '../types/models';

type SourceMode = 'topic' | 'pdf' | 'url';

interface GeneratedQuestion extends Omit<Question, 'id' | 'quizId'> {
  matchOptions?: string[];
}

interface AiGenerateModalProps {
  open: boolean;
  onClose: () => void;
  onGenerated: (result: {
    questions: GeneratedQuestion[];
    title?: string;
    description?: string;
    note?: string;
  }) => void;
  generateMeta?: boolean;
  defaultTopic?: string;
  defaultDescription?: string;
}

export default function AiGenerateModal({
  open,
  onClose,
  onGenerated,
  generateMeta = false,
  defaultTopic = '',
  defaultDescription = '',
}: AiGenerateModalProps) {
  const { user } = useAuthStore();
  const { addToast } = useToastStore();

  // Source mode
  const [sourceMode, setSourceMode] = useState<SourceMode>('topic');

  // Shared controls
  const [count, setCount] = useState(5);
  const [questionType, setQuestionType] = useState<QuestionType | 'mixed'>('mixed');
  const [difficulty, setDifficulty] = useState('mixed');
  const [generating, setGenerating] = useState(false);

  // Topic state
  const [topic, setTopic] = useState(defaultTopic);
  const [description, setDescription] = useState(defaultDescription);

  // PDF state
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfStoragePath, setPdfStoragePath] = useState<string | null>(null);
  const [pdfUploading, setPdfUploading] = useState(false);
  const [additionalContext, setAdditionalContext] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // URL state
  const [url, setUrl] = useState('');
  const [urlContext, setUrlContext] = useState('');

  const resetForm = useCallback(() => {
    setSourceMode('topic');
    setTopic('');
    setDescription('');
    setPdfFile(null);
    setPdfStoragePath(null);
    setAdditionalContext('');
    setUrl('');
    setUrlContext('');
    setCount(5);
    setQuestionType('mixed');
    setDifficulty('mixed');
  }, []);

  const handlePdfSelect = async (file: File) => {
    if (!user) return;
    if (file.type !== 'application/pdf') {
      addToast('error', 'Only PDF files are allowed');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      addToast('error', 'PDF must be under 10MB');
      return;
    }

    setPdfFile(file);
    setPdfUploading(true);

    try {
      const path = `ai_uploads/${user.id}/${Date.now()}_${file.name}`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, file, { contentType: 'application/pdf' });
      // Verify upload by getting download URL
      await getDownloadURL(storageRef);
      setPdfStoragePath(path);
      addToast('success', 'PDF uploaded');
    } catch {
      addToast('error', 'Failed to upload PDF');
      setPdfFile(null);
      setPdfStoragePath(null);
    } finally {
      setPdfUploading(false);
    }
  };

  const removePdf = () => {
    setPdfFile(null);
    setPdfStoragePath(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handlePdfSelect(file);
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const canGenerate = (): boolean => {
    if (generating) return false;
    if (sourceMode === 'topic') return topic.trim().length >= 3;
    if (sourceMode === 'pdf') return !!pdfStoragePath && !pdfUploading;
    if (sourceMode === 'url') {
      try {
        const parsed = new URL(url);
        return ['http:', 'https:'].includes(parsed.protocol);
      } catch {
        return false;
      }
    }
    return false;
  };

  const handleGenerate = async () => {
    if (!canGenerate()) return;
    setGenerating(true);

    try {
      const fn = httpsCallable<
        Record<string, unknown>,
        { questions: GeneratedQuestion[]; title?: string; description?: string; note?: string }
      >(functions, 'generateQuestions');

      const payload: Record<string, unknown> = {
        source: sourceMode,
        count,
        questionType,
        difficulty,
        generateMeta,
      };

      if (sourceMode === 'topic') {
        payload.topic = topic;
        payload.description = description;
      } else if (sourceMode === 'pdf') {
        payload.pdfStoragePath = pdfStoragePath;
        payload.description = description;
        payload.additionalContext = additionalContext;
      } else if (sourceMode === 'url') {
        payload.url = url;
        payload.description = description;
        payload.additionalContext = urlContext;
      }

      const result = await fn(payload);
      const data = result.data;

      if (data.note) addToast('info', data.note);
      else addToast('success', `${data.questions.length} questions generated`);

      onGenerated(data);
      resetForm();
      onClose();
    } catch (err) {
      const message = (err as { message?: string })?.message || 'Failed to generate questions';
      addToast('error', message);
    } finally {
      setGenerating(false);
    }
  };

  if (!open) return null;

  const tabClass = (mode: SourceMode) =>
    `flex-1 py-2 px-3 text-sm font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
      sourceMode === mode
        ? 'bg-brand text-white shadow-sm'
        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
    }`;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="AI Question Generator"
        className="bg-white rounded-2xl border-2 border-gray-800 shadow-[4px_4px_0px_0px_var(--retro-brand)] w-full max-w-md animate-bounce-in max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-0">
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-brand" />
            AI Question Generator
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Source Tabs */}
          <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
            <button onClick={() => setSourceMode('topic')} className={tabClass('topic')}>
              <Type className="w-4 h-4" /> Topic
            </button>
            <button onClick={() => setSourceMode('pdf')} className={tabClass('pdf')}>
              <FileText className="w-4 h-4" /> PDF
            </button>
            <button onClick={() => setSourceMode('url')} className={tabClass('url')}>
              <Link className="w-4 h-4" /> URL
            </button>
          </div>

          {/* Source-specific inputs */}
          {sourceMode === 'topic' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Topic</label>
                <input
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g. Photosynthesis, World War II, Python basics"
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-800 focus:ring-2 focus:ring-brand/30 focus:border-brand outline-none text-gray-900"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Description / Context</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional: grade level, specific focus, learning objectives..."
                  rows={2}
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-800 focus:ring-2 focus:ring-brand/30 focus:border-brand outline-none text-gray-900 resize-none"
                />
              </div>
            </>
          )}

          {sourceMode === 'pdf' && (
            <>
              {!pdfFile ? (
                <div
                  onDrop={handleDrop}
                  onDragOver={(e) => e.preventDefault()}
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-brand hover:bg-brand/5 transition-all"
                >
                  <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm font-medium text-gray-600">
                    Drop a PDF here or click to browse
                  </p>
                  <p className="text-xs text-gray-400 mt-1">Max 10MB</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handlePdfSelect(file);
                    }}
                  />
                </div>
              ) : (
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
                  <FileText className="w-5 h-5 text-brand shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{pdfFile.name}</p>
                    <p className="text-xs text-gray-400">
                      {(pdfFile.size / (1024 * 1024)).toFixed(1)} MB
                      {pdfUploading && ' — Uploading...'}
                      {!pdfUploading && pdfStoragePath && ' — Ready'}
                    </p>
                  </div>
                  {pdfUploading ? (
                    <div className="w-5 h-5 border-2 border-brand/30 border-t-brand rounded-full animate-spin shrink-0" />
                  ) : (
                    <button
                      onClick={removePdf}
                      className="p-1 rounded-lg hover:bg-gray-200 text-gray-400 transition-colors shrink-0"
                    >
                      <XIcon className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Additional Context</label>
                <textarea
                  value={additionalContext}
                  onChange={(e) => setAdditionalContext(e.target.value)}
                  placeholder="Optional: focus on chapter 3, target grade 10..."
                  rows={2}
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-800 focus:ring-2 focus:ring-brand/30 focus:border-brand outline-none text-gray-900 resize-none"
                />
              </div>
            </>
          )}

          {sourceMode === 'url' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Web Page URL</label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com/article"
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-800 focus:ring-2 focus:ring-brand/30 focus:border-brand outline-none text-gray-900"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Additional Context</label>
                <textarea
                  value={urlContext}
                  onChange={(e) => setUrlContext(e.target.value)}
                  placeholder="Optional: focus on specific section, target difficulty..."
                  rows={2}
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-800 focus:ring-2 focus:ring-brand/30 focus:border-brand outline-none text-gray-900 resize-none"
                />
              </div>
            </>
          )}

          {/* Shared controls */}
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Count</label>
              <select
                value={count}
                onChange={(e) => setCount(parseInt(e.target.value))}
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-800 focus:ring-2 focus:ring-brand/30 focus:border-brand outline-none text-gray-900"
              >
                {[3, 5, 7, 10].map((n) => (
                  <option key={n} value={n}>{n} questions</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Type</label>
              <select
                value={questionType}
                onChange={(e) => setQuestionType(e.target.value as QuestionType | 'mixed')}
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-800 focus:ring-2 focus:ring-brand/30 focus:border-brand outline-none text-gray-900"
              >
                <option value="mixed">Mixed (Variety)</option>
                <option value="mcq">Multiple Choice</option>
                <option value="tf">True / False</option>
                <option value="short">Short Answer</option>
                <option value="matching">Matching</option>
                <option value="ordering">Ordering</option>
                <option value="fill_blank">Fill in the Blank</option>
                <option value="code_output">Code Output</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Difficulty</label>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border-2 border-gray-800 focus:ring-2 focus:ring-brand/30 focus:border-brand outline-none text-gray-900"
            >
              <option value="mixed">Mixed</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={!canGenerate()}
            className="w-full py-3 bg-brand text-white font-semibold rounded-xl border-2 border-gray-800 shadow-[3px_3px_0px_0px_var(--retro-brand)] hover:shadow-[5px_5px_0px_0px_var(--retro-brand)] hover:translate-x-[-2px] hover:translate-y-[-2px] transition-all duration-300 disabled:opacity-50 disabled:hover:shadow-[3px_3px_0px_0px_var(--retro-brand)] disabled:hover:translate-x-0 disabled:hover:translate-y-0 flex items-center justify-center gap-2"
          >
            {generating ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Generate {generateMeta ? 'Quiz' : 'Questions'}
              </>
            )}
          </button>
          <p className="text-xs text-gray-400 text-center">
            {generateMeta
              ? 'A new quiz will be created and opened for review.'
              : 'Questions will be added to your quiz. Review and edit them before saving.'}
          </p>
        </div>
      </div>
    </div>
  );
}
