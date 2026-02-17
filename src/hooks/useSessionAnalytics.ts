import { useEffect, useState } from 'react';
import { collection, getDocs, doc, getDoc, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Answer, Question } from '../types/models';

interface QuestionAnalytics {
  questionIndex: number;
  totalAnswers: number;
  correctCount: number;
  correctPercent: number;
  avgTimeMs: number;
}

interface AnswerDistribution {
  questionIndex: number;
  questionText: string;
  options: string[];
  correctAnswers: string[];
  distribution: { label: string; count: number; isCorrect: boolean }[];
  total: number;
}

interface ViolationSummary {
  playerId: string;
  nickname: string;
  totalViolations: number;
}

interface SessionAnalyticsData {
  loading: boolean;
  sessionPin: string;
  quizTitle: string;
  analytics: QuestionAnalytics[];
  playerCount: number;
  avgScore: number;
  avgAccuracy: number;
  sessionDuration: number | null; // in seconds
  answerDistributions: AnswerDistribution[];
  responseTimeTrend: { label: string; value: number }[];
  violations: ViolationSummary[];
}

export function useSessionAnalytics(sessionId: string | undefined): SessionAnalyticsData {
  const [data, setData] = useState<SessionAnalyticsData>({
    loading: true,
    sessionPin: '',
    quizTitle: '',
    analytics: [],
    playerCount: 0,
    avgScore: 0,
    avgAccuracy: 0,
    sessionDuration: null,
    answerDistributions: [],
    responseTimeTrend: [],
    violations: [],
  });

  useEffect(() => {
    if (!sessionId) return;

    const load = async () => {
      // Fetch session doc, analytics, players, and answers in parallel
      const sessionRef = doc(db, 'sessions', sessionId);
      const [sessionSnap, analyticsSnap, playersSnap, answersSnap, violationsSnap] = await Promise.all([
        getDoc(sessionRef),
        getDocs(collection(db, `sessions/${sessionId}/analytics`)),
        getDocs(collection(db, `sessions/${sessionId}/players`)),
        getDocs(collection(db, `sessions/${sessionId}/answers`)),
        getDocs(collection(db, `sessions/${sessionId}/violations`)),
      ]);

      const sessionData = sessionSnap.data();
      const pinCode = sessionData?.pinCode || '';
      const quizId = sessionData?.quizId || '';
      const startedAt = sessionData?.startedAt || null;
      const endedAt = sessionData?.endedAt || null;

      // Fetch quiz title and questions
      const [quizSnap, questionsSnap] = await Promise.all([
        quizId ? getDoc(doc(db, 'quizzes', quizId)) : Promise.resolve(null),
        quizId
          ? getDocs(query(collection(db, 'questions'), where('quizId', '==', quizId)))
          : Promise.resolve(null),
      ]);

      const quizTitle = quizSnap?.data()?.title || 'Untitled Quiz';

      // Build questions map
      const questionsMap = new Map<string, Question>();
      const questionsByIndex: Question[] = [];
      if (questionsSnap) {
        questionsSnap.docs.forEach((d) => {
          const q = { id: d.id, ...d.data() } as Question;
          questionsMap.set(d.id, q);
        });
        // Sort by natural order — use the order from the session's question flow
        // We can derive from analytics questionIndex
      }

      // Parse analytics
      const analytics = analyticsSnap.docs
        .map((d) => d.data() as QuestionAnalytics)
        .sort((a, b) => a.questionIndex - b.questionIndex);

      // Parse all answers
      const allAnswers = answersSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Answer));

      // Group answers by questionId
      const answersByQuestion = new Map<string, Answer[]>();
      for (const a of allAnswers) {
        const arr = answersByQuestion.get(a.questionId) || [];
        arr.push(a);
        answersByQuestion.set(a.questionId, arr);
      }

      // Build ordered question list from analytics indices + questions data
      const orderedQuestionIds: string[] = [];
      // Try to build from analytics — each analytics doc id is the questionId
      for (const aDoc of analyticsSnap.docs) {
        orderedQuestionIds.push(aDoc.id);
      }

      // Build answer distributions
      const answerDistributions: AnswerDistribution[] = [];
      orderedQuestionIds.forEach((qId, idx) => {
        const q = questionsMap.get(qId);
        if (!q) return;
        questionsByIndex[idx] = q;

        const qAnswers = answersByQuestion.get(qId) || [];

        // For matching/fill_blank, show correct vs incorrect counts instead of per-option distribution
        if (q.type === 'matching' || q.type === 'fill_blank') {
          const correctCount = qAnswers.filter((a) => a.correct).length;
          const incorrectCount = qAnswers.length - correctCount;
          answerDistributions.push({
            questionIndex: idx,
            questionText: q.text,
            options: q.options,
            correctAnswers: q.correctAnswers,
            distribution: [
              { label: 'Correct', count: correctCount, isCorrect: true },
              { label: 'Incorrect', count: incorrectCount, isCorrect: false },
            ],
            total: qAnswers.length,
          });
          return;
        }

        const dist = q.options.map((opt) => ({
          label: opt.length > 20 ? opt.slice(0, 18) + '..' : opt,
          count: qAnswers.filter((a) => {
            const sel = Array.isArray(a.selection) ? a.selection : [a.selection];
            return sel.includes(opt);
          }).length,
          isCorrect: q.correctAnswers.includes(opt),
        }));

        answerDistributions.push({
          questionIndex: idx,
          questionText: q.text,
          options: q.options,
          correctAnswers: q.correctAnswers,
          distribution: dist,
          total: qAnswers.length,
        });
      });

      // Response time trend (avg time per question)
      const responseTimeTrend = orderedQuestionIds.map((qId, idx) => {
        const qAnswers = answersByQuestion.get(qId) || [];
        const avgTime = qAnswers.length > 0
          ? qAnswers.reduce((sum, a) => sum + a.timeMs, 0) / qAnswers.length / 1000
          : 0;
        return { label: `Q${idx + 1}`, value: parseFloat(avgTime.toFixed(2)) };
      });

      // Compute aggregate stats
      const playerCount = playersSnap.size;
      const totalCorrect = allAnswers.filter((a) => a.correct).length;
      const avgAccuracy = allAnswers.length > 0 ? (totalCorrect / allAnswers.length) * 100 : 0;
      const totalPoints = allAnswers.reduce((sum, a) => sum + a.pointsAwarded, 0);
      const avgScore = playerCount > 0 ? Math.round(totalPoints / playerCount) : 0;
      const sessionDuration =
        startedAt && endedAt ? Math.round((endedAt - startedAt) / 1000) : null;

      const violations: ViolationSummary[] = violationsSnap.docs
        .map((d) => ({
          playerId: d.id,
          nickname: (d.data().nickname as string) || 'Unknown',
          totalViolations: (d.data().totalViolations as number) || 0,
        }))
        .filter((v) => v.totalViolations > 0)
        .sort((a, b) => b.totalViolations - a.totalViolations);

      setData({
        loading: false,
        sessionPin: pinCode,
        quizTitle,
        analytics,
        playerCount,
        avgScore,
        avgAccuracy: parseFloat(avgAccuracy.toFixed(1)),
        sessionDuration,
        answerDistributions,
        responseTimeTrend,
        violations,
      });
    };

    load();
  }, [sessionId]);

  return data;
}
