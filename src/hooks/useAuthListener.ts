import { useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { useAuthStore } from '../stores/authStore';
import { ADMIN_EMAIL } from '../lib/config';
import type { User } from '../types/models';

export function useAuthListener() {
  const { setFirebaseUser, setUser, setLoading } = useAuthStore();

  useEffect(() => {
    let unsubUserDoc: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      setFirebaseUser(firebaseUser);

      // Clean up previous user doc listener
      if (unsubUserDoc) {
        unsubUserDoc();
        unsubUserDoc = null;
      }

      if (firebaseUser) {
        const userRef = doc(db, 'users', firebaseUser.uid);
        let snap = await getDoc(userRef);

        // Auto-create user doc on first Google sign-in
        if (!snap.exists()) {
          const isAdmin = firebaseUser.email === ADMIN_EMAIL;
          await setDoc(userRef, {
            displayName: firebaseUser.displayName || 'User',
            email: firebaseUser.email || '',
            role: 'teacher',
            approvalStatus: isAdmin ? 'approved' : 'pending',
            createdAt: serverTimestamp(),
          });
          snap = await getDoc(userRef);
        }

        if (snap.exists()) {
          setUser({ id: snap.id, ...snap.data() } as User);
        }
        setLoading(false);

        // Subscribe for real-time updates (e.g. admin approval)
        unsubUserDoc = onSnapshot(
          userRef,
          (liveSnap) => {
            if (liveSnap.exists()) {
              setUser({ id: liveSnap.id, ...liveSnap.data() } as User);
            }
          },
          () => {},
        );
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    return () => {
      unsubAuth();
      if (unsubUserDoc) unsubUserDoc();
    };
  }, [setFirebaseUser, setUser, setLoading]);
}
