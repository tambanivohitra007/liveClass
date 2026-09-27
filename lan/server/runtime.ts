import type { DocStore } from './docStore';
import type { TreeStore } from './treeStore';
import type { AuthService } from './auth';

/** Process-wide handles used by the firebase-admin shim (the ported Cloud Functions have no DI). */
export interface Runtime {
  docs: DocStore;
  tree: TreeStore;
  auth: AuthService;
  dataDir: string;
  uploadsDir: string;
  /** http://<lan-ip>:<port> addresses students can reach, filled once the server listens. */
  publicUrls: string[];
}

let current: Runtime | null = null;

export function setRuntime(r: Runtime): void {
  current = r;
}

export function rt(): Runtime {
  if (!current) throw new Error('LAN runtime not initialised');
  return current;
}
