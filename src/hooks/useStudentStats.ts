import { useEffect, useState } from 'react';
import { collectionGroup, collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Answer } from '../types/models';

interface RecentGame {
  sessionId: string;
  quizTitle: string;
  date: number;
  totalPoints: number;
  correctCount: number;
  totalQuestions: number;
  accuracy: number;
  bestStreak: number;
  rank: number | null;
  answers: GameAnswer[];
}

interface GameAnswer {
  questionId: string;
  questionText: string;
  selection: string | string[];
  correctAnswers: string[];
  correct: boolean;
  timeMs: number;
  pointsAwarded: number;
}

interface StudentStatsData {
  loading: boolean;
  gamesPlayed: number;
  totalPoints: number;
  bestStreak: number;
  avgAccuracy: number;
  recentGames: RecentGame[];
}

export function useStudentStats(userId: string | undefined): StudentStatsData {
  const [data, setData] = useState<StudentStatsData>({
    loading: true,
    gamesPlayed: 0,
    totalPoints: 0,
    bestStreak: 0,
    avgAccuracy: 0,
    recentGames: [],
  });

  useEffect(() => {
    if (!userId) return;

    const load = async () => {
      try {
        // Collection group query on 'players' where userId matches
        const playersSnap = await getDocs(
          query(collectionGroup(db, 'players'), where('userId', '==', userId))
        );

        if (playersSnap.empty) {
          setData({ loading: false, gamesPlayed: 0, totalPoints: 0, bestStreak: 0, avgAccuracy: 0, recentGames: [] });
          return;
        }

        // Extract session IDs and player IDs
        const sessions: { sessionId: string; playerId: string; joinedAt: number }[] = [];
        for (const d of playersSnap.docs) {
          // Parent collection path: sessions/{sessionId}/players
          const sessionId = d.ref.parent.parent?.id;
          if (sessionId) {
            sessions.push({
              sessionId,
              playerId: d.id,
              joinedAt: d.data().joinedAt || 0,
            });
          }
        }

        // Sort by joinedAt desc and take 20 most recent
        sessions.sort((a, b) => b.joinedAt - a.joinedAt);
        const recentSessions = sessions.slice(0, 20);

        // Cache quiz titles to avoid refetching
        const quizTitleCache = new Map<string, string>();

        // Fetch data for each session in parallel
        const gamePromises = recentSessions.map(async ({ sessionId, playerId }) => {
          try {
            // Fetch session doc + player's answers
            const [sessionSnap, answersSnap] = await Promise.all([
              getDoc(doc(db, 'sessions', sessionId)),
              getDocs(
                query(
                  collection(db, `sessions/${sessionId}/answers`),
                  where('playerId', '==', playerId)
                )
              ),
            ]);

            const sessionData = sessionSnap.data();
            if (!sessionData) return null;

            // Get quiz title
            const quizId = sessionData.quizId;
            let quizTitle = quizTitleCache.get(quizId) || '';
            if (!quizTitle && quizId) {
              const quizSnap = await getDoc(doc(db, 'quizzes', quizId));
              quizTitle = quizSnap.data()?.title || 'Untitled Quiz';
              quizTitleCache.set(quizId, quizTitle);
            }

            // Parse answers
            const answers = answersSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Answer));
            const totalPoints = answers.reduce((sum, a) => sum + a.pointsAwarded, 0);
            const correctCount = answers.filter((a) => a.correct).length;
            const accuracy = answers.length > 0 ? (correctCount / answers.length) * 100 : 0;

            // Compute best streak
            let bestStreak = 0;
            let currentStreak = 0;
            for (const a of answers) {
              if (a.correct) {
                currentStreak++;
                bestStreak = Math.max(bestStreak, currentStreak);
              } else {
                currentStreak = 0;
              }
            }

            // Get rank from leaderboard shard
            let rank: number | null = null;
            const shardId = getShardId(playerId);
            const shardSnap = await getDoc(
              doc(db, `sessions/${sessionId}/leaderboard_shards`, shardId)
            );
            if (shardSnap.exists()) {
              const players = shardSnap.data().players || {};
              if (players[playerId]) {
                rank = players[playerId].rank || null;
              }
            }

            // Fetch question texts for drill-down
            const questionIds = [...new Set(answers.map((a) => a.questionId))];
            const questionTexts = new Map<string, { text: string; correctAnswers: string[] }>();
            // Batch fetch questions (up to 30)
            for (const qId of questionIds.slice(0, 30)) {
              const qSnap = await getDoc(doc(db, 'questions', qId));
              if (qSnap.exists()) {
                const qData = qSnap.data();
                questionTexts.set(qId, { text: qData.text, correctAnswers: qData.correctAnswers });
              }
            }

            const gameAnswers: GameAnswer[] = answers.map((a) => ({
              questionId: a.questionId,
              questionText: questionTexts.get(a.questionId)?.text || 'Question',
              selection: a.selection,
              correctAnswers: questionTexts.get(a.questionId)?.correctAnswers || [],
              correct: a.correct,
              timeMs: a.timeMs,
              pointsAwarded: a.pointsAwarded,
            }));

            return {
              sessionId,
              quizTitle,
              date: sessionData.startedAt || sessionData.createdAt || 0,
              totalPoints,
              correctCount,
              totalQuestions: answers.length,
              accuracy: parseFloat(accuracy.toFixed(1)),
              bestStreak,
              rank,
              answers: gameAnswers,
            } as RecentGame;
          } catch {
            return null;
          }
        });

        const games = (await Promise.all(gamePromises)).filter(Boolean) as RecentGame[];
        games.sort((a, b) => b.date - a.date);

        // Aggregate stats
        const gamesPlayed = games.length;
        const totalPoints = games.reduce((sum, g) => sum + g.totalPoints, 0);
        const bestStreak = Math.max(0, ...games.map((g) => g.bestStreak));
        const totalCorrect = games.reduce((sum, g) => sum + g.correctCount, 0);
        const totalQuestions = games.reduce((sum, g) => sum + g.totalQuestions, 0);
        const avgAccuracy = totalQuestions > 0 ? parseFloat(((totalCorrect / totalQuestions) * 100).toFixed(1)) : 0;

        setData({
          loading: false,
          gamesPlayed,
          totalPoints,
          bestStreak,
          avgAccuracy,
          recentGames: games,
        });
      } catch {
        setData({ loading: false, gamesPlayed: 0, totalPoints: 0, bestStreak: 0, avgAccuracy: 0, recentGames: [] });
      }
    };

    load();
  }, [userId]);

  return data;
}

/** Replicate shard ID logic from Cloud Functions */
function getShardId(playerId: string): string {
  let hash = 0;
  for (let i = 0; i < playerId.length; i++) {
    const char = playerId.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return `shard_${Math.abs(hash) % 10}`;
}
