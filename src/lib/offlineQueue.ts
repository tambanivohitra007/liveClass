import { openDB } from 'idb';

const DB_NAME = 'liveclass-offline';
const STORE_NAME = 'pending-answers';
const MAX_RETRIES = 3;
/** Max age for pending answers (24 hours) — stale answers are discarded */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface PendingAnswer {
  id?: number;
  sessionId: string;
  questionId: string;
  playerId: string;
  selection: string;
  timeMs: number;
  createdAt: number;
}

export interface SyncResult {
  synced: number;
  failed: number;
  staleRemoved: number;
  remaining: number;
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

export async function getPendingCount(): Promise<number> {
  const db = await getDb();
  return db.count(STORE_NAME);
}

export async function removePendingAnswer(id: number) {
  const db = await getDb();
  await db.delete(STORE_NAME, id);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function syncPendingAnswers(
  submitFn: (answer: Omit<PendingAnswer, 'id' | 'createdAt'>) => Promise<void>
): Promise<SyncResult> {
  const pending = await getPendingAnswers();
  const now = Date.now();
  let synced = 0;
  let failed = 0;
  let staleRemoved = 0;

  for (const answer of pending) {
    // Remove stale answers (older than 24h — session likely ended)
    if (now - answer.createdAt > MAX_AGE_MS) {
      if (answer.id !== undefined) {
        await removePendingAnswer(answer.id);
      }
      staleRemoved++;
      continue;
    }

    // Retry with exponential backoff
    let submitted = false;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
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
        submitted = true;
        synced++;
        break;
      } catch {
        if (attempt < MAX_RETRIES - 1) {
          await delay(Math.pow(2, attempt) * 1000); // 1s, 2s, 4s
        }
      }
    }

    if (!submitted) {
      failed++;
      // Continue to next answer instead of stopping entirely
    }
  }

  const remaining = await getPendingCount();
  return { synced, failed, staleRemoved, remaining };
}
