// TypeScript port of firestore.rules and database.rules.json.
// Callable functions run with admin privileges and bypass these checks, exactly like Cloud Functions.
import { getField, isPlainObject, splitPath, type Json, type JsonObject } from '../../src/lan/shared/values';
import type { AuthUserInfo } from '../../src/lan/shared/protocol';
import { rt } from './runtime';

export type Access = 'get' | 'list' | 'create' | 'update' | 'delete';

interface Ctx {
  user: AuthUserInfo | null;
  uid: string | null;
  access: Access;
  params: Record<string, string>;
  /** `resource.data` – the stored document (null on create). */
  before: JsonObject | null;
  /** `request.resource.data` – the document after the write (null on read/delete). */
  after: JsonObject | null;
}

let adminEmail: string | null = null;
export function setAdminEmail(email: string | null): void {
  adminEmail = email;
}
export function getAdminEmail(): string | null {
  return adminEmail;
}

function doc(p: string): JsonObject | null {
  return rt().docs.getDoc(p);
}
function str(o: JsonObject | null, f: string, dflt = 'none'): unknown {
  const v = o ? getField(o, f) : undefined;
  return v === undefined ? dflt : v;
}
const authed = (c: Ctx) => c.uid !== null;
const isAdmin = (c: Ctx) => !!c.user?.email && c.user.email === adminEmail;
const read = (c: Ctx) => c.access === 'get' || c.access === 'list';
const ownerIs = (d: JsonObject | null, c: Ctx, field = 'ownerId') => authed(c) && !!d && d[field] === c.uid;
const notPending = (c: Ctx) => str(doc(`users/${c.uid}`), 'approvalStatus') !== 'pending';
const sessionHost = (c: Ctx) => ownerIs(doc(`sessions/${c.params.sessionId}`), c, 'hostId');
const lgOwner = (c: Ctx) => ownerIs(doc(`live_gradings/${c.params.lgId}`), c);

function changedKeys(before: JsonObject | null, after: JsonObject | null): string[] {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  return [...keys].filter((k) => JSON.stringify(before?.[k]) !== JSON.stringify(after?.[k]));
}

type Rule = { pattern: string; allow: (c: Ctx) => boolean };

const RULES: Rule[] = [
  {
    pattern: 'users/{userId}',
    allow: (c) => {
      const own = c.uid === c.params.userId;
      if (read(c)) return (authed(c) && own) || isAdmin(c);
      if (c.access === 'create') return (own && str(c.after, 'approvalStatus') !== 'approved') || (authed(c) && isAdmin(c));
      if (c.access === 'update') {
        if (isAdmin(c)) return true;
        const was = str(c.before, 'approvalStatus');
        const now = str(c.after, 'approvalStatus');
        return own && (now === was || now !== 'approved') && (was !== 'pending' || c.after?.role === c.before?.role);
      }
      return isAdmin(c);
    },
  },
  {
    pattern: 'collections/{id}',
    allow: (c) => {
      if (read(c)) return authed(c);
      if (c.access === 'create') return authed(c) && notPending(c);
      return ownerIs(c.before, c) || (authed(c) && isAdmin(c));
    },
  },
  {
    pattern: 'quizzes/{quizId}',
    allow: (c) => {
      if (read(c)) return authed(c) || c.before?.visibility === 'public';
      if (c.access === 'create') return authed(c) && (isAdmin(c) || notPending(c));
      return ownerIs(c.before, c) || (authed(c) && isAdmin(c));
    },
  },
  { pattern: 'questions/{questionId}', allow: (c) => read(c) || authed(c) },
  {
    pattern: 'sessions/{sessionId}',
    allow: (c) => {
      if (read(c)) return true;
      if (c.access === 'create') return authed(c);
      return ownerIs(c.before, c, 'hostId') || (authed(c) && isAdmin(c));
    },
  },
  {
    pattern: 'sessions/{sessionId}/players/{playerId}',
    allow: (c) => read(c) || c.access === 'create' || (c.access === 'delete' && (sessionHost(c) || isAdmin(c))),
  },
  ...['answers', 'leaderboard_shards'].map((sub) => ({
    pattern: `sessions/{sessionId}/${sub}/{id}`,
    allow: (c: Ctx) => read(c) || (c.access === 'delete' && (sessionHost(c) || isAdmin(c))),
  })),
  ...['analytics', 'violations'].map((sub) => ({
    pattern: `sessions/{sessionId}/${sub}/{id}`,
    allow: (c: Ctx) => (read(c) || c.access === 'delete') && (sessionHost(c) || isAdmin(c)),
  })),
  {
    pattern: 'sessions/{sessionId}/evaluations/{id}',
    allow: (c) => (read(c) ? authed(c) : c.access === 'delete' && (sessionHost(c) || isAdmin(c))),
  },
  {
    pattern: 'assignments/{id}',
    allow: (c) => {
      if (read(c)) return authed(c);
      if (c.access === 'create') return authed(c) && c.after?.ownerId === c.uid;
      return ownerIs(c.before, c) || (authed(c) && isAdmin(c));
    },
  },
  {
    pattern: 'notifications/{id}',
    allow: (c) => {
      if (read(c)) return authed(c) && c.before?.userId === c.uid;
      if (c.access === 'update') {
        return authed(c) && c.before?.userId === c.uid && changedKeys(c.before, c.after).every((k) => k === 'read');
      }
      return false;
    },
  },
  ...['rubrics', 'rosters', 'grading_sessions'].map((coll) => ({
    pattern: `${coll}/{id}`,
    allow: (c: Ctx) => {
      if (read(c)) return coll === 'rubrics' ? authed(c) : ownerIs(c.before, c) || (authed(c) && isAdmin(c));
      if (c.access === 'create') return authed(c) && c.after?.ownerId === c.uid;
      return ownerIs(c.before, c) || (authed(c) && isAdmin(c));
    },
  })),
  ...[
    ['rubrics', 'criteria'],
    ['rosters', 'students'],
    ['grading_sessions', 'evaluations'],
  ].map(([coll, sub]) => ({
    pattern: `${coll}/{parentId}/${sub}/{id}`,
    allow: (c: Ctx) => (read(c) ? authed(c) : ownerIs(doc(`${coll}/${c.params.parentId}`), c)),
  })),
  ...['live_gradings', 'mini_games', 'arcade_games'].map((coll) => ({
    pattern: `${coll}/{lgId}`,
    allow: (c: Ctx) => {
      if (read(c)) return true;
      if (c.access === 'create') return authed(c);
      return ownerIs(c.before, c) || (authed(c) && isAdmin(c));
    },
  })),
  {
    pattern: 'live_gradings/{lgId}/players/{id}',
    allow: (c) => read(c) || c.access === 'create' || lgOwner(c),
  },
  {
    pattern: 'live_gradings/{lgId}/evaluations/{id}',
    allow: (c) => c.access === 'get' || lgOwner(c) || (c.access === 'delete' && isAdmin(c)),
  },
  ...['mini_games', 'arcade_games'].flatMap((coll) => [
    {
      pattern: `${coll}/{lgId}/players/{id}`,
      allow: (c: Ctx) => read(c) || (coll === 'mini_games' && c.access === 'create')
        || (c.access === 'delete' && ownerIs(doc(`${coll}/${c.params.lgId}`), c)),
    },
    {
      pattern: `${coll}/{lgId}/answers/{id}`,
      allow: (c: Ctx) => read(c) || (c.access === 'delete' && ownerIs(doc(`${coll}/${c.params.lgId}`), c)),
    },
    {
      pattern: `${coll}/{lgId}/events/{id}`,
      allow: (c: Ctx) => read(c),
    },
  ]),
  {
    pattern: 'classrooms/{classroomId}',
    allow: (c) => {
      if (read(c)) return authed(c);
      if (c.access === 'create') return false;
      if (c.access === 'delete') return ownerIs(c.before, c) || (authed(c) && isAdmin(c));
      if (isAdmin(c)) return true;
      const member = ownerIs(c.before, c) || (authed(c) && !!doc(`classrooms/${c.params.classroomId}/members/${c.uid}`));
      const locked = ['ownerId', 'joinCode', 'joinCodeExpiresAt', 'studentCount', 'coTeacherCount'];
      return member && !changedKeys(c.before, c.after).some((k) => locked.includes(k));
    },
  },
  {
    pattern: 'classrooms/{classroomId}/members/{memberId}',
    allow: (c) => (read(c) ? authed(c) : c.access === 'delete' && isAdmin(c)),
  },
];

function match(pattern: string, path: string): Record<string, string> | null {
  const pp = splitPath(pattern);
  const dp = splitPath(path);
  if (pp.length !== dp.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pp.length; i++) {
    if (pp[i].startsWith('{')) params[pp[i].slice(1, -1)] = dp[i];
    else if (pp[i] !== dp[i]) return null;
  }
  return params;
}

export function allowDoc(
  user: AuthUserInfo | null, access: Access, path: string, before: JsonObject | null, after: JsonObject | null,
): boolean {
  // Collection-group rule: any /members/ doc is readable by signed-in users.
  if (read({ access } as Ctx) && splitPath(path).slice(-2, -1)[0] === 'members' && user) return true;
  for (const r of RULES) {
    const params = match(r.pattern, path);
    if (params) return r.allow({ user, uid: user?.uid ?? null, access, params, before, after });
  }
  return false;
}

// ---------------------------------------------------------------- Realtime Database

export function allowTreeRead(user: AuthUserInfo | null, path: string): boolean {
  const [root, a] = splitPath(path);
  switch (root) {
    case 'liveAnswers': return !!user && !!a;
    case 'answerCounts':
    case 'results':
    case 'studentProgress':
    case 'scores':
    case 'arcade':
      return true;
    default:
      return false;
  }
}

export function allowTreeWrite(user: AuthUserInfo | null, path: string, existing: Json, value: Json): boolean {
  const parts = splitPath(path);
  switch (parts[0]) {
    case 'liveAnswers': {
      if (parts.length !== 4 || existing !== null || !isPlainObject(value)) return false;
      const v = value as JsonObject;
      return typeof v.selection === 'string' && typeof v.timeMs === 'number' && typeof v.activeToken === 'string'
        && typeof v.ts === 'number' && Math.abs(v.ts - Date.now()) < 5_000;
    }
    case 'studentProgress':
      return parts.length >= 3 && !!user;
    default:
      return false;
  }
}
