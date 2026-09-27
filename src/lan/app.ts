// Drop-in replacement for `firebase/app`.
export interface FirebaseApp {
  name: string;
  options: Record<string, unknown>;
}
const app: FirebaseApp = { name: '[DEFAULT]', options: {} };
export function initializeApp(options: Record<string, unknown> = {}): FirebaseApp {
  app.options = options;
  return app;
}
export function getApp(): FirebaseApp {
  return app;
}
export function getApps(): FirebaseApp[] {
  return [app];
}
export class FirebaseError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}
