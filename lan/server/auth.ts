import crypto from 'node:crypto';
import type { AuthUserInfo, SignInResult } from '../../src/lan/shared/protocol';
import { autoId } from '../../src/lan/shared/values';
import type { Persistence } from './persistence';
import { StoreError } from './docStore';

interface UserRow {
  uid: string;
  email: string;
  hash: string;
  displayName: string | null;
  photoURL: string | null;
  createdAt: number;
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, 32);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [, saltB64, keyB64] = stored.split('$');
  const expected = Buffer.from(keyB64, 'base64');
  const actual = crypto.scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

function normEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Local email/password accounts. Error codes mirror Firebase Auth so existing UI messages still apply. */
export class AuthService {
  constructor(private p: Persistence) {}

  private toInfo(row: UserRow): AuthUserInfo {
    return { uid: row.uid, email: row.email, displayName: row.displayName, photoURL: row.photoURL };
  }

  private byEmail(email: string): UserRow | undefined {
    return this.p.sql.prepare('SELECT * FROM users WHERE email = ?').get(normEmail(email)) as UserRow | undefined;
  }

  getUser(uid: string): AuthUserInfo | null {
    const row = this.p.sql.prepare('SELECT * FROM users WHERE uid = ?').get(uid) as UserRow | undefined;
    return row ? this.toInfo(row) : null;
  }

  findByEmail(email: string): AuthUserInfo | null {
    const row = this.byEmail(email);
    return row ? this.toInfo(row) : null;
  }

  userCount(): number {
    return (this.p.sql.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
  }

  private issueToken(uid: string): string {
    const token = crypto.randomBytes(32).toString('hex');
    this.p.sql.prepare('INSERT INTO tokens (token, uid, createdAt) VALUES (?, ?, ?)').run(token, uid, Date.now());
    return token;
  }

  signUp(email: string, password: string): SignInResult {
    const e = normEmail(email ?? '');
    if (!/^[^\s@]+@[^\s@]+$/.test(e)) throw new StoreError('auth/invalid-email', 'Invalid email address');
    if (!password || password.length < 6) throw new StoreError('auth/weak-password', 'Password should be at least 6 characters');
    if (this.byEmail(e)) throw new StoreError('auth/email-already-in-use', 'Email already in use');
    const uid = autoId().slice(0, 28);
    this.p.sql
      .prepare('INSERT INTO users (uid, email, hash, displayName, photoURL, createdAt) VALUES (?, ?, ?, NULL, NULL, ?)')
      .run(uid, e, hashPassword(password), Date.now());
    return { token: this.issueToken(uid), user: this.getUser(uid)! };
  }

  signIn(email: string, password: string): SignInResult {
    const row = this.byEmail(email ?? '');
    if (!row || !verifyPassword(password ?? '', row.hash)) {
      throw new StoreError('auth/invalid-credential', 'Invalid email or password');
    }
    return { token: this.issueToken(row.uid), user: this.toInfo(row) };
  }

  verify(email: string, password: string, uid: string): void {
    const row = this.byEmail(email ?? '');
    if (!row || row.uid !== uid || !verifyPassword(password ?? '', row.hash)) {
      throw new StoreError('auth/invalid-credential', 'Invalid email or password');
    }
  }

  resolveToken(token: string | null): AuthUserInfo | null {
    if (!token) return null;
    const row = this.p.sql.prepare('SELECT uid FROM tokens WHERE token = ?').get(token) as { uid: string } | undefined;
    return row ? this.getUser(row.uid) : null;
  }

  revokeToken(token: string): void {
    this.p.sql.prepare('DELETE FROM tokens WHERE token = ?').run(token);
  }

  updateProfile(uid: string, fields: { displayName?: string | null; photoURL?: string | null }): AuthUserInfo {
    if (fields.displayName !== undefined) this.p.sql.prepare('UPDATE users SET displayName = ? WHERE uid = ?').run(fields.displayName, uid);
    if (fields.photoURL !== undefined) this.p.sql.prepare('UPDATE users SET photoURL = ? WHERE uid = ?').run(fields.photoURL, uid);
    return this.getUser(uid)!;
  }

  setPassword(uid: string, password: string): void {
    if (!password || password.length < 6) throw new StoreError('auth/weak-password', 'Password should be at least 6 characters');
    this.p.sql.prepare('UPDATE users SET hash = ? WHERE uid = ?').run(hashPassword(password), uid);
  }

  /** Used by admins on the server console / admin page when a teacher forgets a password. */
  resetPasswordByEmail(email: string, password: string): void {
    const row = this.byEmail(email);
    if (!row) throw new StoreError('auth/user-not-found', 'No such user');
    this.setPassword(row.uid, password);
    this.p.sql.prepare('DELETE FROM tokens WHERE uid = ?').run(row.uid);
  }
}
