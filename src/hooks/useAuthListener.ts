import { useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { useAuthStore } from '../stores/authStore';
import type { User } from '../types/models';

export function useAuthListener() {
  const { setFirebaseUser, setUser, setLoading } = useAuthStore();

  useEffect(() => {
    let unsubUserDoc: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, (firebaseUser) => {
      setFirebaseUser(firebaseUser);

      // Clean up previous user doc listener
      if (unsubUserDoc) {
        unsubUserDoc();
        unsubUserDoc = null;
      }

      if (firebaseUser) {
        unsubUserDoc = onSnapshot(
          doc(db, 'users', firebaseUser.uid),
          (snap) => {
            if (snap.exists()) {
              setUser({ id: snap.id, ...snap.data() } as User);
            } else {
              setUser(null);
            }
            setLoading(false);
          },
          (err) => {
            console.error('User doc listener error:', err);
            setUser(null);
            setLoading(false);
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
