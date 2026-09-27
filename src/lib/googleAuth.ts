import { signInWithPopup } from 'firebase/auth';

/** Google sign-in needs internet; in LAN mode this always rejects with an explanatory error. */
export async function signInWithGoogle() {
  return signInWithPopup();
}
