// Drop-in replacement for `firebase/storage`: files are stored on the LAN server's disk.
import { LanError } from './connection';
import { splitPath } from './shared/values';

const TOKEN_KEY = 'liveclass.lan.token';

export class FirebaseStorage {
  readonly type = 'storage';
}
const storage = new FirebaseStorage();
export function getStorage(_app?: unknown): FirebaseStorage {
  return storage;
}

export class StorageReference {
  readonly fullPath: string;
  constructor(fullPath: string) {
    this.fullPath = fullPath;
  }
  get name(): string {
    const p = splitPath(this.fullPath);
    return p[p.length - 1] ?? '';
  }
  toString(): string {
    return this.fullPath;
  }
}

export function ref(_s: FirebaseStorage, path = ''): StorageReference {
  return new StorageReference(splitPath(path).join('/'));
}

function publicUrl(r: StorageReference): string {
  return `${location.origin}/uploads/${splitPath(r.fullPath).map(encodeURIComponent).join('/')}`;
}

export async function uploadBytes(r: StorageReference, data: Blob | ArrayBuffer | Uint8Array, _meta?: unknown) {
  let token: string | null = null;
  try {
    token = localStorage.getItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
  const res = await fetch(`/api/upload?path=${encodeURIComponent(r.fullPath)}`, {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: data as BodyInit,
  });
  if (!res.ok) {
    const code = res.status === 401 ? 'storage/unauthenticated' : res.status === 413 ? 'storage/quota-exceeded' : 'storage/unknown';
    throw new LanError(code, (await res.text()) || 'Upload failed');
  }
  return { ref: r, metadata: { fullPath: r.fullPath, name: r.name } };
}

export async function getDownloadURL(r: StorageReference): Promise<string> {
  return publicUrl(r);
}

export async function deleteObject(_r: StorageReference): Promise<void> {
  // Uploaded files are kept; they are small and teachers may reuse them.
}
