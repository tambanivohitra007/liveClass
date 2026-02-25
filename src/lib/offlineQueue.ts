import { openDB } from 'idb';

const DB_NAME = 'liveclass-offline';
const STORE_NAME = 'pending-answers';

interface PendingAnswer {
  id?: number;
  sessionId: string;
  questionId: string;
  playerId: string;
  selection: string;
  timeMs: number;
  createdAt: number;
}

async function getDb() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    },
  });
}

export async function queueAnswer(answer: Omit<PendingAnswer, 'id' | 'createdAt'>) {
  const db = await getDb();
  await db.add(STORE_NAME, { ...answer, createdAt: Date.now() });
}

export async function getPendingAnswers(): Promise<PendingAnswer[]> {
  const db = await getDb();
  return db.getAll(STORE_NAME);
}

export async function removePendingAnswer(id: number) {
  const db = await getDb();
  await db.delete(STORE_NAME, id);
}

export async function syncPendingAnswers(
  submitFn: (answer: Omit<PendingAnswer, 'id' | 'createdAt'>) => Promise<void>
) {
  const pending = await getPendingAnswers();
  for (const answer of pending) {
    try {
      await submitFn({
        sessionId: answer.sessionId,
        questionId: answer.questionId,
        playerId: answer.playerId,
        selection: answer.selection,
        timeMs: answer.timeMs,
      });
      if (answer.id !== undefined) {
        await removePendingAnswer(answer.id);
      }
    } catch (err) {
      // Sync failed — stop and retry on next attempt
      break;
    }
  }
}
