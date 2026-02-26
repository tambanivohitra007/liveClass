import { useEffect, useRef, useCallback, useState } from 'react';
import { doc, collection, onSnapshot, setDoc, updateDoc, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useGradingStore } from '../stores/gradingStore';
import { useToastStore } from '../stores/toastStore';
import { queueEvaluation, syncPendingEvaluations, getPendingCount } from '../lib/gradingOfflineQueue';
import type { GradingSession, Criterion, Evaluation, RosterStudent, SessionPlayer } from '../types/models';

export function useGradingSession(gradingSessionId: string | undefined) {
  const {
    gradingSession, students, criteria, evaluations,
    setGradingSession, setStudents, setCriteria, setEvaluations, updateEvaluation,
  } = useGradingStore();
  const { addToast } = useToastStore();
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'offline'>('saved');
  const [pendingCount, setPendingCount] = useState(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Subscribe to grading session doc
  useEffect(() => {
    if (!gradingSessionId) return;
    const unsub = onSnapshot(doc(db, 'grading_sessions', gradingSessionId), (snap) => {
      if (snap.exists()) {
        setGradingSession({ id: snap.id, ...snap.data() } as GradingSession);
      }
    });
    return unsub;
  }, [gradingSessionId, setGradingSession]);

  // Load criteria from rubric
  useEffect(() => {
    if (!gradingSession?.rubricId) return;
    const loadCriteria = async () => {
      const snap = await getDocs(
        query(collection(db, 'rubrics', gradingSession.rubricId, 'criteria'), orderBy('order'))
      );
      setCriteria(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Criterion));
    };
    loadCriteria();
  }, [gradingSession?.rubricId, setCriteria]);

  // Load students from source
  useEffect(() => {
    if (!gradingSession) return;
    const loadStudents = async () => {
      if (gradingSession.sourceType === 'roster') {
        const snap = await getDocs(
          query(collection(db, 'rosters', gradingSession.sourceId, 'students'), orderBy('order'))
        );
        setStudents(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as RosterStudent));
      } else {
        const snap = await getDocs(
          collection(db, 'sessions', gradingSession.sourceId, 'players')
        );
        setStudents(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as SessionPlayer));
      }
    };
    loadStudents();
  }, [gradingSession?.sourceType, gradingSession?.sourceId, setStudents]);

  // Load existing evaluations
  useEffect(() => {
    if (!gradingSessionId) return;
    const unsub = onSnapshot(
      collection(db, 'grading_sessions', gradingSessionId, 'evaluations'),
      (snap) => {
        const map = new Map<string, Evaluation>();
        snap.docs.forEach((d) => {
          map.set(d.id, { id: d.id, ...d.data() } as Evaluation);
        });
        setEvaluations(map);
        setLoading(false);
      }
    );
    return unsub;
  }, [gradingSessionId, setEvaluations]);

  // Check pending count periodically
  useEffect(() => {
    const check = async () => {
      const count = await getPendingCount();
      setPendingCount(count);
    };
    check();
    const interval = setInterval(check, 5000);
    return () => clearInterval(interval);
  }, []);

  // Online sync
  useEffect(() => {
    const handleOnline = async () => {
      if (!gradingSessionId) return;
      try {
        await syncPendingEvaluations(async (pending) => {
          await setDoc(
            doc(db, 'grading_sessions', pending.gradingSessionId, 'evaluations', pending.studentId),
            { ...pending.data, syncedAt: Date.now() },
            { merge: true }
          );
        });
        const count = await getPendingCount();
        setPendingCount(count);
        if (count === 0) setSaveStatus('saved');
      } catch {
        // Will retry on next online event
      }
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [gradingSessionId]);

  const saveEvaluation = useCallback(
    (studentId: string, evaluation: Evaluation) => {
      updateEvaluation(studentId, evaluation);

      // Debounced save
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      setSaveStatus('saving');

      saveTimerRef.current = setTimeout(async () => {
        if (!gradingSessionId) return;
        const { id: _id, ...data } = evaluation;
        try {
          await setDoc(
            doc(db, 'grading_sessions', gradingSessionId, 'evaluations', studentId),
            { ...data, syncedAt: Date.now() },
            { merge: true }
          );
          setSaveStatus('saved');

          // Update grading session stats
          const gradedCount = Array.from(useGradingStore.getState().evaluations.values())
            .filter((e) => e.totalScore > 0 || e.comment).length;
          const allEvals = Array.from(useGradingStore.getState().evaluations.values());
          const scoredEvals = allEvals.filter((e) => e.totalScore > 0);
          const avgScore = scoredEvals.length > 0
            ? scoredEvals.reduce((sum, e) => sum + e.totalScore, 0) / scoredEvals.length
            : 0;
          const avgPercentage = scoredEvals.length > 0
            ? scoredEvals.reduce((sum, e) => sum + e.percentage, 0) / scoredEvals.length
            : 0;

          await updateDoc(doc(db, 'grading_sessions', gradingSessionId), {
            gradedCount,
            avgScore: Math.round(avgScore * 10) / 10,
            avgPercentage: Math.round(avgPercentage * 10) / 10,
            updatedAt: Date.now(),
          });
        } catch {
          // Offline — queue it
          setSaveStatus('offline');
          await queueEvaluation({
            gradingSessionId,
            studentId,
            data,
          });
          const count = await getPendingCount();
          setPendingCount(count);
        }
      }, 500);
    },
    [gradingSessionId, updateEvaluation]
  );

  const completeSession = useCallback(async () => {
    if (!gradingSessionId) return;
    try {
      await updateDoc(doc(db, 'grading_sessions', gradingSessionId), {
        status: 'completed',
        updatedAt: Date.now(),
      });
      addToast('success', 'Grading session completed');
    } catch {
      addToast('error', 'Failed to complete session');
    }
  }, [gradingSessionId, addToast]);

  return {
    gradingSession, students, criteria, evaluations, loading,
    saveStatus, pendingCount, saveEvaluation, completeSession,
  };
}
