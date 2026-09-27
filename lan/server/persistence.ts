import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Durable storage for everything the server keeps in memory.
 * All data is loaded at start-up (classroom-sized datasets) and written back in small
 * batched transactions, so reads never touch the disk.
 */
export class Persistence {
  private db: DatabaseSync;
  private pendingDocs = new Map<string, string | null>();
  private pendingKv = new Map<string, string | null>();
  private timer: NodeJS.Timeout | null = null;

  constructor(readonly dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true });
    this.db = new DatabaseSync(path.join(dataDir, 'liveclass.db'));
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      CREATE TABLE IF NOT EXISTS docs (path TEXT PRIMARY KEY, coll TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS users (
        uid TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, hash TEXT NOT NULL,
        displayName TEXT, photoURL TEXT, createdAt INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS tokens (token TEXT PRIMARY KEY, uid TEXT NOT NULL, createdAt INTEGER NOT NULL);
    `);
  }

  get sql(): DatabaseSync {
    return this.db;
  }

  loadDocs(): { path: string; data: string }[] {
    return this.db.prepare('SELECT path, data FROM docs ORDER BY rowid').all() as { path: string; data: string }[];
  }

  loadKv(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM kv WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  saveDoc(docPath: string, data: string | null): void {
    this.pendingDocs.set(docPath, data);
    this.schedule();
  }

  saveKv(key: string, value: string | null): void {
    this.pendingKv.set(key, value);
    this.schedule();
  }

  private schedule(): void {
    if (!this.timer) this.timer = setTimeout(() => this.flush(), 250);
  }

  flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.pendingDocs.size === 0 && this.pendingKv.size === 0) return;
    const upsert = this.db.prepare('INSERT INTO docs (path, coll, data) VALUES (?, ?, ?) ON CONFLICT(path) DO UPDATE SET data = excluded.data');
    const del = this.db.prepare('DELETE FROM docs WHERE path = ?');
    const kvUpsert = this.db.prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    const kvDel = this.db.prepare('DELETE FROM kv WHERE key = ?');
    this.db.exec('BEGIN');
    try {
      for (const [p, data] of this.pendingDocs) {
        if (data === null) del.run(p);
        else upsert.run(p, p.slice(0, p.lastIndexOf('/')), data);
      }
      for (const [k, v] of this.pendingKv) {
        if (v === null) kvDel.run(k);
        else kvUpsert.run(k, v);
      }
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      console.error('[persistence] flush failed', err);
      return;
    }
    this.pendingDocs.clear();
    this.pendingKv.clear();
  }

  close(): void {
    this.flush();
    this.db.close();
  }
}
