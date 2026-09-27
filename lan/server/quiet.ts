// Imported first by main.ts: node:sqlite prints an ExperimentalWarning on load, which is noise for teachers.
const emitWarning = process.emitWarning.bind(process);
process.emitWarning = ((w: string | Error, ...rest: unknown[]) => {
  if (String(w).includes('SQLite')) return;
  (emitWarning as (...a: unknown[]) => void)(w, ...rest);
}) as typeof process.emitWarning;

export {};
