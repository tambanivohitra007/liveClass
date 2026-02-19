import { useEffect, useState } from 'react';
import { collection, getDocs, doc, getDoc, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Answer, Question } from '../types/models';

interface QuestionAnalytics {
  questionId: string;
  questionIndex: number;
  totalAnswers: number;
  correctCount: number;
  correctPercent: number;
  avgTimeMs: number;
}

interface AnswerDistribution {
  questionIndex: number;
  questionText: string;
  questionType: string;
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

interface PlayerStats {
  playerId: string;
  nickname: string;
  totalAnswers: number;
  correctAnswers: number;
  accuracyPercent: number;
  totalPoints: number;
}

interface SessionAnalyticsData {
  loading: boolean;
  sessionPin: string;
  quizId: string;
  quizTitle: string;
  analytics: QuestionAnalytics[];
  playerCount: number;
  avgScore: number;
  avgAccuracy: number;
  sessionDuration: number | null; // in seconds
  sessionStartedAt: number | null;
  answerDistributions: AnswerDistribution[];
  responseTimeTrend: { label: string; value: number }[];
  violations: ViolationSummary[];
  playerStats: PlayerStats[];
  allAnswers: Answer[];
}

export function useSessionAnalytics(sessionId: string | undefined): SessionAnalyticsData {
  const [data, setData] = useState<SessionAnalyticsData>({
    loading: true,
    sessionPin: '',
    quizId: '',
    quizTitle: '',
    analytics: [],
    playerCount: 0,
    avgScore: 0,
    avgAccuracy: 0,
    sessionDuration: null,
    sessionStartedAt: null,
    answerDistributions: [],
    responseTimeTrend: [],
    violations: [],
    playerStats: [],
    allAnswers: [],
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
        .map((d) => ({ ...d.data(), questionId: d.id } as QuestionAnalytics))
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
            questionType: q.type,
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
          questionType: q.type,
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
      const totalQuestions = orderedQuestionIds.length;
      const totalCorrect = allAnswers.filter((a) => a.correct).length;
      const totalExpected = playerCount * totalQuestions;
      const avgAccuracy = totalExpected > 0 ? (totalCorrect / totalExpected) * 100 : 0;
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

      // Per-player accuracy stats
      const playerNicknames = new Map<string, string>();
      playersSnap.docs.forEach((d) => {
        playerNicknames.set(d.id, d.data().nickname || 'Unknown');
      });

      const playerAccMap = new Map<string, { total: number; correct: number; points: number }>();
      // Initialize all players so those who answered nothing still appear
      playersSnap.docs.forEach((d) => {
        playerAccMap.set(d.id, { total: 0, correct: 0, points: 0 });
      });
      for (const a of allAnswers) {
        const entry = playerAccMap.get(a.playerId) || { total: 0, correct: 0, points: 0 };
        entry.total++;
        if (a.correct) entry.correct++;
        entry.points += a.pointsAwarded;
        playerAccMap.set(a.playerId, entry);
      }

      const playerStats: PlayerStats[] = Array.from(playerAccMap.entries())
        .map(([playerId, stats]) => ({
          playerId,
          nickname: playerNicknames.get(playerId) || 'Unknown',
          totalAnswers: stats.total,
          correctAnswers: stats.correct,
          accuracyPercent: totalQuestions > 0 ? parseFloat(((stats.correct / totalQuestions) * 100).toFixed(1)) : 0,
          totalPoints: stats.points,
        }))
        .sort((a, b) => b.totalPoints - a.totalPoints);

      setData({
        loading: false,
        sessionPin: pinCode,
        quizId,
        quizTitle,
        analytics,
        playerCount,
        avgScore,
        avgAccuracy: parseFloat(avgAccuracy.toFixed(1)),
        sessionDuration,
        sessionStartedAt: startedAt,
        answerDistributions,
        responseTimeTrend,
        violations,
        playerStats,
        allAnswers,
      });
    };

    load();
  }, [sessionId]);

  return data;
}
