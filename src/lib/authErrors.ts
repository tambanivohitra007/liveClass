const FIREBASE_AUTH_ERRORS: Record<string, string> = {
  'auth/popup-closed-by-user': 'Sign-in was cancelled. Please try again.',
  'auth/cancelled-popup-request': 'Sign-in was cancelled. Please try again.',
  'auth/popup-blocked': 'Pop-up was blocked by your browser. Please allow pop-ups and try again.',
  'auth/network-request-failed': 'Network error. Please check your connection and try again.',
  'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
  'auth/user-disabled': 'This account has been disabled. Please contact support.',
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/wrong-password': 'Incorrect email or password.',
  'auth/user-not-found': 'Incorrect email or password.',
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/email-already-in-use': 'An account with this email already exists. Try signing in instead.',
  'auth/weak-password': 'Password is too weak. Use at least 6 characters.',
  'auth/account-exists-with-different-credential': 'An account already exists with this email using a different sign-in method.',
  'auth/requires-recent-login': 'Please sign in again to complete this action.',
  'auth/credential-already-in-use': 'This credential is already linked to another account.',
  'auth/operation-not-allowed': 'This sign-in method is not enabled. Please contact support.',
  'auth/internal-error': 'Something went wrong. Please try again.',
};

export function getAuthErrorMessage(error: unknown): string {
  if (!error) return 'Something went wrong. Please try again.';

  const msg = error instanceof Error ? error.message : String(error);

  // Extract Firebase error code from message like "Firebase: Error (auth/xxx)."
  const codeMatch = msg.match(/\(auth\/[^)]+\)/);
  const code = codeMatch ? codeMatch[0].slice(1, -1) : '';

  if (code && FIREBASE_AUTH_ERRORS[code]) {
    return FIREBASE_AUTH_ERRORS[code];
  }

  // Also check if the error object has a code property
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const errCode = (error as { code: string }).code;
    if (FIREBASE_AUTH_ERRORS[errCode]) {
      return FIREBASE_AUTH_ERRORS[errCode];
    }
  }

  // Fallback: don't expose raw Firebase errors
  return 'Something went wrong. Please try again.';
}
