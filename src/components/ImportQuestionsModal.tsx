import { useRef, useState } from 'react';
import { Download, FileUp, Upload, X as XIcon } from 'lucide-react';
import { downloadCsvTemplate, readQuestionFile, type ImportedQuestion, type QuestionSetFile } from '../lib/questionFiles';

interface ImportQuestionsModalProps {
  open: boolean;
  onClose: () => void;
  onGenerated: (result: { questions: ImportedQuestion[]; title?: string; description?: string; note?: string }) => void;
  /** Kept for drop-in compatibility with the former AI modal; titles always come from the file. */
  generateMeta?: boolean;
  defaultTopic?: string;
  defaultDescription?: string;
}

/**
 * Offline replacement for AI generation: import questions from a LiveClass JSON/CSV file
 * or a Blooket CSV export, e.g. from a USB stick shared between teachers.
 */
export default function ImportQuestionsModal({ open, onClose, onGenerated }: ImportQuestionsModalProps) {
  const [parsed, setParsed] = useState<QuestionSetFile | null>(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const load = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    setParsed(null);
    setFileName(file.name);
    try {
      setParsed(await readQuestionFile(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read this file');
    }
  };

  const close = () => {
    setParsed(null);
    setFileName('');
    setError('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={close}>
      <div
        className="w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-3xl bg-white dark:bg-[#141B2E] border border-gray-200 dark:border-white/10 shadow-2xl p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand/15 flex items-center justify-center">
            <FileUp className="w-5 h-5 text-brand" />
          </div>
          <div className="flex-1">
            <h2 className="text-xl text-gray-900 dark:text-white">Import questions</h2>
            <p className="text-sm text-gray-500 dark:text-white/50 font-semibold">LiveClass .json / .csv, or a Blooket CSV</p>
          </div>
          <button type="button" onClick={close} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10" aria-label="Close">
            <XIcon className="w-5 h-5 text-gray-500 dark:text-white/60" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void load(e.dataTransfer.files[0]);
          }}
          className={`w-full rounded-2xl border-2 border-dashed p-8 flex flex-col items-center gap-2 transition-colors ${
            dragging ? 'border-brand bg-brand/10' : 'border-gray-300 dark:border-white/15 hover:border-brand/60'
          }`}
        >
          <Upload className="w-8 h-8 text-brand" />
          <span className="font-bold text-gray-800 dark:text-white">{fileName || 'Choose a file or drop it here'}</span>
          <span className="text-xs text-gray-500 dark:text-white/40">.json, .csv (Excel: File → Save As → CSV UTF-8)</span>
        </button>
        <input ref={input} type="file" accept=".json,.csv,.txt,application/json,text/csv" className="hidden" onChange={(e) => load(e.target.files?.[0])} />

        {error && <p className="rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm font-bold p-3">{error}</p>}

        {parsed && (
          <div className="rounded-2xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 p-4 space-y-2">
            <p className="font-bold text-gray-900 dark:text-white">
              {parsed.title ? `“${parsed.title}” — ` : ''}
              {parsed.questions.length} question{parsed.questions.length === 1 ? '' : 's'}
            </p>
            <ol className="text-sm text-gray-600 dark:text-white/60 space-y-1 list-decimal list-inside max-h-40 overflow-y-auto">
              {parsed.questions.slice(0, 50).map((q, i) => (
                <li key={i} className="truncate">
                  <span className="text-xs font-bold uppercase text-brand mr-1">{q.type}</span>
                  {q.text}
                </li>
              ))}
            </ol>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={downloadCsvTemplate} className="text-sm font-bold text-brand flex items-center gap-1.5 hover:underline">
            <Download className="w-4 h-4" /> CSV template
          </button>
          <div className="flex-1" />
          <button type="button" onClick={close} className="btn-3d-ghost px-5 py-2.5">Cancel</button>
          <button
            type="button"
            disabled={!parsed}
            onClick={() => {
              if (!parsed) return;
              onGenerated({ questions: parsed.questions, title: parsed.title, description: parsed.description });
              close();
            }}
            className="btn-3d-blue px-5 py-2.5 disabled:opacity-40"
          >
            Import {parsed ? parsed.questions.length : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
