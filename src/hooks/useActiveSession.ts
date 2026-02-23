import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthStore } from '../stores/authStore';

export interface ActiveSessionInfo {
  id: string;
  quizId: string;
  quizTitle: string;
  pinCode: string;
  status: 'lobby' | 'live';
  playerCount: number;
}

export function useActiveSession() {
  const { user } = useAuthStore();
  const [activeSession, setActiveSession] = useState<ActiveSessionInfo | null>(null);

  useEffect(() => {
    if (!user) {
      setActiveSession(null);
      return;
    }

    const q = query(
      collection(db, 'sessions'),
      where('hostId', '==', user.id),
      where('status', 'in', ['lobby', 'live']),
    );

    const unsubSession = onSnapshot(q, async (snap) => {
      if (snap.empty) {
        setActiveSession(null);
        return;
      }

      const sessionDoc = snap.docs[0];
      const data = sessionDoc.data();

      // Fetch quiz title
      let quizTitle = 'Untitled Quiz';
      try {
        const quizSnap = await getDoc(doc(db, 'quizzes', data.quizId));
        if (quizSnap.exists()) {
          quizTitle = quizSnap.data().title || quizTitle;
        }
      } catch {
        // fallback to default title
      }

      setActiveSession({
        id: sessionDoc.id,
        quizId: data.quizId,
        quizTitle,
        pinCode: data.pinCode,
        status: data.status as 'lobby' | 'live',
        playerCount: 0, // will be updated by players sub
      });
    });

    // We'll track the players subcollection once we know the session ID
    let unsubPlayers: (() => void) | null = null;
    let lastSessionId: string | null = null;

    const unsubSessionForPlayers = onSnapshot(q, (snap) => {
      const sessionId = snap.docs[0]?.id ?? null;

      if (sessionId === lastSessionId) return;
      lastSessionId = sessionId;

      // Clean up old player listener
      if (unsubPlayers) {
        unsubPlayers();
        unsubPlayers = null;
      }

      if (!sessionId) return;

      unsubPlayers = onSnapshot(
        collection(db, `sessions/${sessionId}/players`),
        (playerSnap) => {
          setActiveSession((prev) =>
            prev ? { ...prev, playerCount: playerSnap.size } : prev,
          );
        },
      );
    });

    return () => {
      unsubSession();
      unsubSessionForPlayers();
      if (unsubPlayers) unsubPlayers();
    };
  }, [user]);

  const endActiveSession = async () => {
    if (!activeSession) return;
    await updateDoc(doc(db, 'sessions', activeSession.id), {
      status: 'ended',
      endedAt: Date.now(),
    });
  };

  return { activeSession, endActiveSession };
}
