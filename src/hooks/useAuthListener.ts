import { useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { useAuthStore } from '../stores/authStore';
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
        // Initial fetch to unblock loading quickly
        const snap = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (snap.exists()) {
          setUser({ id: snap.id, ...snap.data() } as User);
        }
        setLoading(false);

        // Then subscribe for real-time updates (e.g. admin approval)
        unsubUserDoc = onSnapshot(
          doc(db, 'users', firebaseUser.uid),
          (liveSnap) => {
            if (liveSnap.exists()) {
              setUser({ id: liveSnap.id, ...liveSnap.data() } as User);
            }
          },
          () => {
            // Silently ignore listener errors
          },
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
