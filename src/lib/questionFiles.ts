// Question-set files for offline sharing (USB stick, shared folder):
//  • LiveClass JSON  – full fidelity export/import
//  • LiveClass CSV   – easy to write in Excel/LibreOffice
//  • Blooket CSV     – the spreadsheet template Blooket uses for imports
import type { Question, QuestionType } from '../types/models';

export type ImportedQuestion = Omit<Question, 'id' | 'quizId'> & { matchOptions?: string[] };

export interface QuestionSetFile {
  title?: string;
  description?: string;
  questions: ImportedQuestion[];
}

const TYPES: QuestionType[] = ['mcq', 'tf', 'short', 'matching', 'fill_blank', 'ordering', 'poll', 'slide', 'code_output'];
const TYPE_ALIASES: Record<string, QuestionType> = {
  mcq: 'mcq', 'multiple choice': 'mcq', multiple: 'mcq', choice: 'mcq', quiz: 'mcq',
  tf: 'tf', 'true/false': 'tf', 'true false': 'tf', truefalse: 'tf', boolean: 'tf',
  short: 'short', 'short answer': 'short', text: 'short', typed: 'short', 'type answer': 'short',
  poll: 'poll', code_output: 'code_output', 'code output': 'code_output', code: 'code_output',
  ordering: 'ordering', order: 'ordering', matching: 'matching', match: 'matching', fill_blank: 'fill_blank',
};

// ---------------------------------------------------------------- CSV

/** RFC 4180 CSV parser (quotes, escaped quotes, CRLF, newlines inside quotes). Detects ; or tab separators. */
export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const sep = [',', ';', '\t'].reduce((best, s) => (firstLine.split(s).length > firstLine.split(best).length ? s : best), ',');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** Byte-order mark so Excel opens UTF-8 CSVs (accents, Malagasy/French text) correctly. */
const UTF8_BOM = String.fromCharCode(0xfeff);

function csvEscape(v: string | number): string {
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const norm = (s: string) => s.trim().toLowerCase();

function fromBlooket(rows: string[][], headerIdx: number): ImportedQuestion[] {
  const header = rows[headerIdx].map(norm);
  const col = (re: RegExp) => header.findIndex((h) => re.test(h));
  const qCol = col(/question text/);
  const answerCols = header.map((h, i) => (/^answer \d/.test(h) ? i : -1)).filter((i) => i >= 0);
  const timeCol = col(/time limit/);
  const correctCol = col(/correct answer/);
  const out: ImportedQuestion[] = [];
  for (const r of rows.slice(headerIdx + 1)) {
    const text = (r[qCol] ?? '').trim();
    if (!text) continue;
    const options = answerCols.map((i) => (r[i] ?? '').trim()).filter(Boolean);
    const correctIdx = (r[correctCol] ?? '').split(/[,;\s]+/).map((x) => Number(x) - 1).filter((n) => n >= 0 && n < answerCols.length);
    const correctAnswers = correctIdx.map((i) => (r[answerCols[i]] ?? '').trim()).filter(Boolean);
    if (options.length < 2 || correctAnswers.length === 0) continue;
    out.push({ type: 'mcq', text, options, correctAnswers, timeLimitSec: clampTime(Number(r[timeCol])) });
  }
  return out;
}

function clampTime(n: number): number {
  return Number.isFinite(n) && n > 0 ? Math.min(600, Math.max(5, Math.round(n))) : 20;
}

/**
 * LiveClass CSV columns (header row required, order free):
 *   type, question, option1..option6, correct, time
 * `correct` holds the correct option text(s) or 1-based numbers, separated by "|".
 */
function fromLiveClassCsv(rows: string[][]): ImportedQuestion[] {
  const header = rows[0].map(norm);
  const col = (...names: string[]) => header.findIndex((h) => names.includes(h));
  const typeCol = col('type', 'question type');
  const qCol = col('question', 'text', 'question text');
  const correctCol = col('correct', 'answer', 'correct answer', 'correct answers', 'answers');
  const timeCol = col('time', 'time limit', 'seconds', 'timelimitsec');
  const optCols = header.map((h, i) => (/^(option|choice|answer)\s*\d+$/.test(h) ? i : -1)).filter((i) => i >= 0);
  if (qCol < 0) throw new Error('The CSV needs a "question" column.');
  const out: ImportedQuestion[] = [];
  for (const r of rows.slice(1)) {
    const text = (r[qCol] ?? '').trim();
    if (!text) continue;
    const options = optCols.map((i) => (r[i] ?? '').trim()).filter(Boolean);
    const rawCorrect = (r[correctCol] ?? '').split('|').map((s) => s.trim()).filter(Boolean);
    // An answer that matches an option's text wins; otherwise a number is a 1-based option position.
    const correctAnswers = rawCorrect.map((c) =>
      options.includes(c) || !/^\d+$/.test(c) || !options[Number(c) - 1] ? c : options[Number(c) - 1],
    );
    let type = TYPE_ALIASES[norm(r[typeCol] ?? '')] ?? (options.length ? 'mcq' : 'short');
    if (type === 'mcq' && options.length === 2 && options.every((o) => /^(true|false)$/i.test(o))) type = 'tf';
    if (type === 'tf' && options.length === 0) options.push('True', 'False');
    out.push({ type, text, options, correctAnswers, timeLimitSec: clampTime(Number(r[timeCol])) });
  }
  return out;
}

// ---------------------------------------------------------------- JSON

function fromJson(data: unknown): QuestionSetFile {
  const obj = (Array.isArray(data) ? { questions: data } : data) as Record<string, unknown>;
  if (!obj || !Array.isArray(obj.questions)) throw new Error('This JSON file has no "questions" list.');
  const questions: ImportedQuestion[] = [];
  for (const raw of obj.questions as Record<string, unknown>[]) {
    const text = String(raw.text ?? raw.question ?? '').trim();
    if (!text) continue;
    const type = TYPES.includes(raw.type as QuestionType) ? (raw.type as QuestionType) : TYPE_ALIASES[norm(String(raw.type ?? ''))] ?? 'mcq';
    const options = Array.isArray(raw.options) ? raw.options.map(String) : [];
    const correct = raw.correctAnswers ?? raw.correct ?? raw.answer ?? [];
    questions.push({
      type,
      text,
      options,
      correctAnswers: (Array.isArray(correct) ? correct : [correct]).map(String),
      timeLimitSec: clampTime(Number(raw.timeLimitSec ?? raw.time)),
      ...(Array.isArray(raw.matchOptions) ? { matchOptions: raw.matchOptions.map(String) } : {}),
      ...(typeof raw.codeSnippet === 'string' ? { codeSnippet: raw.codeSnippet } : {}),
      ...(typeof raw.codeLanguage === 'string' ? { codeLanguage: raw.codeLanguage } : {}),
      ...(typeof raw.pointMultiplier === 'number' ? { pointMultiplier: raw.pointMultiplier } : {}),
    });
  }
  return {
    title: typeof obj.title === 'string' ? obj.title : undefined,
    description: typeof obj.description === 'string' ? obj.description : undefined,
    questions,
  };
}

// ---------------------------------------------------------------- public API

export async function readQuestionFile(file: File): Promise<QuestionSetFile> {
  const text = await file.text();
  const baseTitle = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  let result: QuestionSetFile;
  if (/\.json$/i.test(file.name) || /^\s*[[{]/.test(text)) {
    result = fromJson(JSON.parse(text));
  } else {
    const rows = parseCsv(text);
    if (rows.length < 2) throw new Error('The file is empty.');
    const blooketHeader = rows.findIndex((r) => r.some((c) => norm(c) === 'question text'));
    result = { questions: blooketHeader >= 0 ? fromBlooket(rows, blooketHeader) : fromLiveClassCsv(rows) };
  }
  if (result.questions.length === 0) throw new Error('No questions found in this file.');
  return { ...result, title: result.title || baseTitle };
}

function download(name: string, content: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeName(title: string): string {
  return (title.trim() || 'question-set').replace(/[^\p{L}\p{N} _-]+/gu, '').replace(/\s+/g, '-').slice(0, 60);
}

export function exportQuestionSetJson(set: QuestionSetFile): void {
  const body = {
    format: 'liveclass-question-set',
    version: 1,
    title: set.title ?? '',
    description: set.description ?? '',
    questions: set.questions.map((q) => ({
      type: q.type,
      text: q.text,
      options: q.options ?? [],
      correctAnswers: q.correctAnswers ?? [],
      timeLimitSec: q.timeLimitSec,
      ...(q.matchOptions ? { matchOptions: q.matchOptions } : {}),
      ...(q.codeSnippet ? { codeSnippet: q.codeSnippet, codeLanguage: q.codeLanguage ?? '' } : {}),
      ...(q.pointMultiplier ? { pointMultiplier: q.pointMultiplier } : {}),
    })),
  };
  download(`${safeName(set.title ?? '')}.liveclass.json`, JSON.stringify(body, null, 2), 'application/json');
}

export function exportQuestionSetCsv(set: QuestionSetFile): void {
  const maxOpts = Math.max(4, ...set.questions.map((q) => q.options?.length ?? 0));
  const header = ['type', 'question', ...Array.from({ length: maxOpts }, (_, i) => `option${i + 1}`), 'correct', 'time'];
  const lines = [header.join(',')];
  for (const q of set.questions) {
    const opts = Array.from({ length: maxOpts }, (_, i) => q.options?.[i] ?? '');
    lines.push([q.type, q.text, ...opts, (q.correctAnswers ?? []).join('|'), q.timeLimitSec].map(csvEscape).join(','));
  }
  download(`${safeName(set.title ?? '')}.csv`, UTF8_BOM + lines.join('\r\n'), 'text/csv;charset=utf-8');
}

export const CSV_TEMPLATE =
  'type,question,option1,option2,option3,option4,correct,time\r\n' +
  'mcq,What is 7 × 8?,54,56,58,64,56,20\r\n' +
  'tf,The Earth orbits the Sun.,True,False,,,True,15\r\n' +
  'short,Capital of Madagascar?,,,,,Antananarivo,30\r\n';

export function downloadCsvTemplate(): void {
  download('liveclass-template.csv', UTF8_BOM + CSV_TEMPLATE, 'text/csv;charset=utf-8');
}
