// Drop-in replacement for the parts of `firebase/auth` LiveClass uses: local accounts on the LAN server.
import { lan, LanError } from './connection';
import type { AuthUserInfo, SignInResult } from './shared/protocol';

export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  emailVerified: boolean;
  isAnonymous: boolean;
  providerData: { providerId: string; uid: string; email: string | null }[];
  getIdToken(forceRefresh?: boolean): Promise<string>;
  reload(): Promise<void>;
}
export interface UserCredential {
  user: User;
  providerId: string | null;
}
export type NextOrObserver<T> = ((v: T) => void) | { next?: (v: T) => void };

function toUser(info: AuthUserInfo): User {
  return {
    ...info,
    emailVerified: true,
    isAnonymous: false,
    providerData: [{ providerId: 'password', uid: info.email ?? info.uid, email: info.email }],
    getIdToken: async () => info.uid,
    reload: async () => {},
  };
}

export class Auth {
  currentUser: User | null = null;
  readonly name = '[DEFAULT]';
  constructor() {
    lan().onAuth((u) => {
      if (u?.uid === this.currentUser?.uid && u?.displayName === this.currentUser?.displayName) return;
      this.currentUser = u ? toUser(u) : null;
    });
  }
  authStateReady(): Promise<void> {
    return lan().authReady;
  }
}

let auth: Auth | null = null;
export function getAuth(_app?: unknown): Auth {
  if (!auth) auth = new Auth();
  return auth;
}
export const initializeAuth = getAuth;

export function onAuthStateChanged(a: Auth, next: NextOrObserver<User | null>, _error?: unknown): () => void {
  const cb = typeof next === 'function' ? next : (u: User | null) => next.next?.(u);
  let lastUid: string | null | undefined;
  let ready = false;
  const emit = () => {
    const uid = a.currentUser?.uid ?? null;
    if (uid === lastUid) return;
    lastUid = uid;
    cb(a.currentUser);
  };
  void lan().authReady.then(() => {
    ready = true;
    emit();
  });
  const unsub = lan().onAuth(() => {
    // Runs after Auth's own listener updated currentUser (registered first).
    if (ready) emit();
  });
  return unsub;
}
export const onIdTokenChanged = onAuthStateChanged;

async function establish(res: SignInResult): Promise<UserCredential> {
  const c = lan();
  c.setToken(res.token);
  c.setAdminEmail(res.adminEmail);
  c.setUser(res.user);
  c.resubscribeAll();
  return { user: getAuth().currentUser!, providerId: 'password' };
}

export async function signInWithEmailAndPassword(_a: Auth, email: string, password: string): Promise<UserCredential> {
  return establish(await lan().request<SignInResult>({ t: 'signIn', email, password }));
}

export async function createUserWithEmailAndPassword(_a: Auth, email: string, password: string): Promise<UserCredential> {
  return establish(await lan().request<SignInResult>({ t: 'signUp', email, password }));
}

export async function signOut(_a: Auth): Promise<void> {
  const c = lan();
  await c.request({ t: 'signOut' }).catch(() => {});
  c.setToken(null);
  c.setUser(null);
  c.resubscribeAll();
}

export async function updateProfile(_u: User, fields: { displayName?: string | null; photoURL?: string | null }): Promise<void> {
  const info = await lan().request<AuthUserInfo>({ t: 'updateProfile', ...fields });
  const a = getAuth();
  a.currentUser = toUser(info);
  lan().setUser(info);
}

export async function updatePassword(_u: User, password: string): Promise<void> {
  await lan().request({ t: 'updatePassword', password });
}

export interface AuthCredential {
  providerId: string;
  email: string;
  password: string;
}
export const EmailAuthProvider = {
  PROVIDER_ID: 'password',
  credential: (email: string, password: string): AuthCredential => ({ providerId: 'password', email, password }),
};

export async function reauthenticateWithCredential(u: User, cred: AuthCredential): Promise<UserCredential> {
  await lan().request({ t: 'reauth', email: cred.email, password: cred.password });
  return { user: u, providerId: 'password' };
}

const offline = () =>
  new LanError('auth/operation-not-supported-in-this-environment', 'This sign-in method needs internet. Use your email and password.');

export class GoogleAuthProvider {
  static credential(): AuthCredential {
    throw offline();
  }
  static credentialFromResult(): null {
    return null;
  }
  addScope(): this {
    return this;
  }
  setCustomParameters(): this {
    return this;
  }
}
export async function signInWithPopup(): Promise<UserCredential> {
  throw offline();
}
export async function signInWithRedirect(): Promise<never> {
  throw offline();
}
export async function signInWithCredential(): Promise<UserCredential> {
  throw offline();
}
export async function sendPasswordResetEmail(): Promise<void> {
  throw new LanError('auth/operation-not-supported-in-this-environment', 'Ask your LiveClass administrator to reset your password.');
}
export async function sendEmailVerification(): Promise<void> {}
export function connectAuthEmulator(): void {}
export const browserLocalPersistence = {};
export const indexedDBLocalPersistence = {};
export async function setPersistence(): Promise<void> {}
