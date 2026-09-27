// `@capacitor-firebase/authentication` stand-in: native Google sign-in needs internet.
export const FirebaseAuthentication = {
  async signInWithGoogle(): Promise<never> {
    throw new Error('Google sign-in is not available offline. Use your email and password.');
  },
  async signOut(): Promise<void> {},
};
