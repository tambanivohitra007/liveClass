import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthStore } from '../stores/authStore';

export interface ActiveSessionInfo {
  id: string;
  type: 'quiz' | 'live_grading' | 'mini_game';
  quizId?: string;
  rubricId?: string;
  gameType?: string;
  title: string;
  pinCode: string;
  status: 'lobby' | 'live';
  playerCount: number;
  /** Route to resume this session */
  resumeUrl: string;
}

export function useActiveSession() {
  const { user } = useAuthStore();
  const [activeSessions, setActiveSessions] = useState<ActiveSessionInfo[]>([]);

  useEffect(() => {
    if (!user) {
      setActiveSessions([]);
      return;
    }

    const unsubs: (() => void)[] = [];
    const playerUnsubs: Map<string, () => void> = new Map();

    // Helper to update a session in the list
    const upsertSession = (session: ActiveSessionInfo) => {
      setActiveSessions((prev) => {
        const idx = prev.findIndex((s) => s.id === session.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx], ...session };
          return next;
        }
        return [...prev, session];
      });
    };

    const subscribeToPlayers = (sessionId: string, collectionPath: string) => {
      if (playerUnsubs.has(sessionId)) return;
      const unsub = onSnapshot(collection(db, collectionPath), (snap) => {
        setActiveSessions((prev) =>
          prev.map((s) => s.id === sessionId ? { ...s, playerCount: snap.size } : s)
        );
      });
      playerUnsubs.set(sessionId, unsub);
    };

    // 1. Quiz sessions
    const quizQ = query(collection(db, 'sessions'), where('hostId', '==', user.id), where('status', 'in', ['lobby', 'live']));
    unsubs.push(onSnapshot(quizQ, async (snap) => {
      const currentIds = new Set(snap.docs.map((d) => d.id));
      // Remove old
      setActiveSessions((prev) => prev.filter((s) => s.type !== 'quiz' || currentIds.has(s.id)));

      for (const d of snap.docs) {
        const data = d.data();
        let title = 'Untitled Quiz';
        try {
          const quizSnap = await getDoc(doc(db, 'quizzes', data.quizId));
          if (quizSnap.exists()) title = quizSnap.data().title || title;
        } catch { /* fallback */ }

        upsertSession({
          id: d.id, type: 'quiz', quizId: data.quizId, title,
          pinCode: data.pinCode, status: data.status, playerCount: 0,
          resumeUrl: `/quiz/${data.quizId}/host?sessionId=${d.id}`,
        });
        subscribeToPlayers(d.id, `sessions/${d.id}/players`);
      }
    }));

    // 2. Live grading sessions
    const lgQ = query(collection(db, 'live_gradings'), where('ownerId', '==', user.id), where('status', 'in', ['lobby', 'live']));
    unsubs.push(onSnapshot(lgQ, (snap) => {
      const currentIds = new Set(snap.docs.map((d) => d.id));
      setActiveSessions((prev) => prev.filter((s) => s.type !== 'live_grading' || currentIds.has(s.id)));

      for (const d of snap.docs) {
        const data = d.data();
        upsertSession({
          id: d.id, type: 'live_grading', rubricId: data.rubricId,
          title: data.rubricName || 'Live Grading',
          pinCode: data.pinCode, status: data.status, playerCount: 0,
          resumeUrl: `/rubric/${data.rubricId}/host`,
        });
        subscribeToPlayers(d.id, `live_gradings/${d.id}/players`);
      }
    }));

    // 3. Mini game sessions
    const mgQ = query(collection(db, 'mini_games'), where('ownerId', '==', user.id), where('status', 'in', ['lobby', 'live']));
    unsubs.push(onSnapshot(mgQ, (snap) => {
      const currentIds = new Set(snap.docs.map((d) => d.id));
      setActiveSessions((prev) => prev.filter((s) => s.type !== 'mini_game' || currentIds.has(s.id)));

      for (const d of snap.docs) {
        const data = d.data();
        upsertSession({
          id: d.id, type: 'mini_game', gameType: data.gameType,
          title: data.title || 'Mini Game',
          pinCode: data.pinCode, status: data.status, playerCount: 0,
          resumeUrl: `/mini-game/${data.gameType}/host`,
        });
        subscribeToPlayers(d.id, `mini_games/${d.id}/players`);
      }
    }));

    return () => {
      unsubs.forEach((u) => u());
      playerUnsubs.forEach((u) => u());
    };
  }, [user]);

  // Legacy: return first quiz session for backward compatibility
  const activeSession = activeSessions.find((s) => s.type === 'quiz') || null;

  const endSession = async (sessionId: string) => {
    const session = activeSessions.find((s) => s.id === sessionId);
    if (!session) return;
    const collectionName = session.type === 'quiz' ? 'sessions' : session.type === 'live_grading' ? 'live_gradings' : 'mini_games';
    await updateDoc(doc(db, collectionName, sessionId), {
      status: 'ended', endedAt: Date.now(),
      ...(session.type === 'live_grading' ? { currentStudentId: null } : {}),
    });
  };

  // Legacy compat
  const endActiveSession = async () => {
    if (activeSession) await endSession(activeSession.id);
  };

  return { activeSession, activeSessions, endActiveSession, endSession };
}
