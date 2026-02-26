import { openDB } from 'idb';

const DB_NAME = 'liveclass-offline';
const STORE_NAME = 'pending-evaluations';
const DB_VERSION = 2;

export interface PendingEvaluation {
  id?: number;
  gradingSessionId: string;
  studentId: string;
  data: Record<string, unknown>;
  createdAt: number;
}

async function getDb() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('pending-answers')) {
        db.createObjectStore('pending-answers', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    },
  });
}

export async function queueEvaluation(evaluation: Omit<PendingEvaluation, 'id' | 'createdAt'>) {
  const db = await getDb();
  await db.add(STORE_NAME, { ...evaluation, createdAt: Date.now() });
}

export async function getPendingEvaluations(): Promise<PendingEvaluation[]> {
  const db = await getDb();
  return db.getAll(STORE_NAME);
}

export async function removePendingEvaluation(id: number) {
  const db = await getDb();
  await db.delete(STORE_NAME, id);
}

export async function getPendingCount(): Promise<number> {
  const db = await getDb();
  return db.count(STORE_NAME);
}

export async function syncPendingEvaluations(
  submitFn: (evaluation: Omit<PendingEvaluation, 'id' | 'createdAt'>) => Promise<void>
) {
  const pending = await getPendingEvaluations();
  for (const evaluation of pending) {
    try {
      await submitFn({
        gradingSessionId: evaluation.gradingSessionId,
        studentId: evaluation.studentId,
        data: evaluation.data,
      });
      if (evaluation.id !== undefined) {
        await removePendingEvaluation(evaluation.id);
      }
    } catch {
      break;
    }
  }
}
