import { useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { useAuthStore } from '../stores/authStore';
import type { User } from '../types/models';

export function useAuthListener() {
  const { setFirebaseUser, setUser, setLoading, setNeedsRoleSelection } = useAuthStore();

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
        const snap = await getDoc(userRef);

        // New user without a doc — flag for role selection
        if (!snap.exists()) {
          setNeedsRoleSelection(true);
          setLoading(false);

          // Subscribe so when ChooseRole/Signup creates the doc, user state updates
          unsubUserDoc = onSnapshot(
            userRef,
            (liveSnap) => {
              if (liveSnap.exists()) {
                setUser({ id: liveSnap.id, ...liveSnap.data() } as User);
              }
            },
            () => {},
          );
          return;
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
        setNeedsRoleSelection(false);
        setLoading(false);
      }
    });

    return () => {
      unsubAuth();
      if (unsubUserDoc) unsubUserDoc();
    };
  }, [setFirebaseUser, setUser, setLoading, setNeedsRoleSelection]);
}
