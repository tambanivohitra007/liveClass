import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";

admin.initializeApp();
const db = admin.firestore();

const REGION = "asia-southeast1";

function generatePin(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// --- Create Session ---
export const createSession = onCall({ region: REGION }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be logged in");
  }

  const { quizId } = request.data as { quizId: string };
  if (!quizId) {
    throw new HttpsError("invalid-argument", "quizId is required");
  }

  const quizDoc = await db.doc(`quizzes/${quizId}`).get();
  if (!quizDoc.exists) {
    throw new HttpsError("not-found", "Quiz not found");
  }
  if (quizDoc.data()?.ownerId !== request.auth.uid) {
    throw new HttpsError("permission-denied", "Not your quiz");
  }

  let pinCode = generatePin();
  // Ensure PIN is unique among active sessions
  let existing = await db
    .collection("sessions")
    .where("pinCode", "==", pinCode)
    .where("status", "!=", "ended")
    .get();
  while (!existing.empty) {
    pinCode = generatePin();
    existing = await db
      .collection("sessions")
      .where("pinCode", "==", pinCode)
      .where("status", "!=", "ended")
      .get();
  }

  const sessionRef = db.collection("sessions").doc();
  await sessionRef.set({
    quizId,
    hostId: request.auth.uid,
    pinCode,
    status: "lobby",
    currentQuestionIndex: 0,
    questionState: "lobby",
    joinLocked: false,
    startedAt: null,
    endedAt: null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { sessionId: sessionRef.id };
});

// --- Join Session ---
export const joinSession = onCall({ region: REGION }, async (request) => {
  const { sessionId, nickname } = request.data as {
    sessionId: string;
    nickname: string;
  };

  if (!sessionId || !nickname) {
    throw new HttpsError(
      "invalid-argument",
      "sessionId and nickname are required"
    );
  }

  if (nickname.length > 20) {
    throw new HttpsError("invalid-argument", "Nickname too long");
  }

  const sessionDoc = await db.doc(`sessions/${sessionId}`).get();
  if (!sessionDoc.exists) {
    throw new HttpsError("not-found", "Session not found");
  }

  const session = sessionDoc.data()!;
  if (session.status === "ended") {
    throw new HttpsError("failed-precondition", "Session has ended");
  }
  if (session.joinLocked) {
    throw new HttpsError("failed-precondition", "Session is locked");
  }

  // Check nickname uniqueness
  const existing = await db
    .collection(`sessions/${sessionId}/players`)
    .where("nickname", "==", nickname)
    .get();
  if (!existing.empty) {
    throw new HttpsError("already-exists", "Nickname already taken");
  }

  const playerRef = db.collection(`sessions/${sessionId}/players`).doc();
  await playerRef.set({
    sessionId,
    userId: request.auth?.uid || null,
    nickname,
    joinedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { playerId: playerRef.id };
});

// --- Start Question ---
export const startQuestion = onCall({ region: REGION }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be logged in");
  }

  const { sessionId, qIndex } = request.data as {
    sessionId: string;
    qIndex: number;
  };

  const sessionDoc = await db.doc(`sessions/${sessionId}`).get();
  if (!sessionDoc.exists) {
    throw new HttpsError("not-found", "Session not found");
  }

  const session = sessionDoc.data()!;
  if (session.hostId !== request.auth.uid) {
    throw new HttpsError("permission-denied", "Not the host");
  }

  await sessionDoc.ref.update({
    status: "live",
    currentQuestionIndex: qIndex,
    questionState: "live",
    questionStartedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { success: true };
});

// --- Score Answer ---
export const scoreAnswer = onCall({ region: REGION }, async (request) => {
  const { sessionId, questionId, playerId, selection, timeMs } =
    request.data as {
      sessionId: string;
      questionId: string;
      playerId: string;
      selection: string;
      timeMs: number;
    };

  // Validate session is live
  const sessionDoc = await db.doc(`sessions/${sessionId}`).get();
  if (!sessionDoc.exists || sessionDoc.data()?.questionState !== "live") {
    throw new HttpsError(
      "failed-precondition",
      "Question is not currently live"
    );
  }

  // Prevent duplicate answers
  const answerId = `${questionId}_${playerId}`;
  const existingAnswer = await db
    .doc(`sessions/${sessionId}/answers/${answerId}`)
    .get();
  if (existingAnswer.exists) {
    throw new HttpsError("already-exists", "Already answered this question");
  }

  // Get question to check correctness
  const questionDoc = await db.doc(`questions/${questionId}`).get();
  if (!questionDoc.exists) {
    throw new HttpsError("not-found", "Question not found");
  }

  const question = questionDoc.data()!;
  const correct = question.correctAnswers.includes(selection);

  // Calculate points: base(1000) * timeRemaining% * correctness
  let pointsAwarded = 0;
  if (correct) {
    const timeFactor = Math.max(
      0,
      (question.timeLimitSec * 1000 - timeMs) / (question.timeLimitSec * 1000)
    );
    pointsAwarded = Math.round(1000 * timeFactor);

    // Check streak for bonus
    const leaderboardDoc = await db
      .doc(`sessions/${sessionId}/leaderboard_shards/${playerId}`)
      .get();
    if (leaderboardDoc.exists) {
      const streak = (leaderboardDoc.data()?.streak || 0) + 1;
      pointsAwarded += streak * 50;
    } else {
      pointsAwarded += 50; // First correct = streak of 1
    }
  }

  // Write answer
  await db.doc(`sessions/${sessionId}/answers/${answerId}`).set({
    sessionId,
    playerId,
    questionId,
    selection,
    timeMs,
    correct,
    pointsAwarded,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Update leaderboard shard
  const shardRef = db.doc(
    `sessions/${sessionId}/leaderboard_shards/${playerId}`
  );
  const shard = await shardRef.get();
  if (shard.exists) {
    await shardRef.update({
      totalPoints: admin.firestore.FieldValue.increment(pointsAwarded),
      streak: correct ? admin.firestore.FieldValue.increment(1) : 0,
    });
  } else {
    await shardRef.set({
      playerId,
      totalPoints: pointsAwarded,
      streak: correct ? 1 : 0,
    });
  }

  return { correct, pointsAwarded };
});

// --- End Question ---
export const endQuestion = onCall({ region: REGION }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be logged in");
  }

  const { sessionId } = request.data as { sessionId: string };

  const sessionDoc = await db.doc(`sessions/${sessionId}`).get();
  if (!sessionDoc.exists) {
    throw new HttpsError("not-found", "Session not found");
  }

  const session = sessionDoc.data()!;
  if (session.hostId !== request.auth.uid) {
    throw new HttpsError("permission-denied", "Not the host");
  }

  // Aggregate leaderboard: get all shards, compute top 10
  const shardsSnap = await db
    .collection(`sessions/${sessionId}/leaderboard_shards`)
    .orderBy("totalPoints", "desc")
    .limit(10)
    .get();

  const top10 = shardsSnap.docs.map((d, i) => ({
    playerId: d.id,
    totalPoints: d.data().totalPoints,
    rank: i + 1,
  }));

  // Compute per-question analytics
  const answersSnap = await db
    .collection(`sessions/${sessionId}/answers`)
    .where("questionId", "==", session.quizId) // will be filtered by current question
    .get();

  const questionId =
    `q${session.currentQuestionIndex}` || session.currentQuestionIndex;

  let totalCorrect = 0;
  let totalTime = 0;
  let totalAnswers = 0;
  answersSnap.docs.forEach((d) => {
    const data = d.data();
    totalAnswers++;
    if (data.correct) totalCorrect++;
    totalTime += data.timeMs || 0;
  });

  await db.doc(`sessions/${sessionId}/analytics/${questionId}`).set({
    questionIndex: session.currentQuestionIndex,
    totalAnswers,
    correctCount: totalCorrect,
    correctPercent: totalAnswers > 0 ? (totalCorrect / totalAnswers) * 100 : 0,
    avgTimeMs: totalAnswers > 0 ? totalTime / totalAnswers : 0,
  });

  await sessionDoc.ref.update({
    questionState: "reveal",
    top10Snapshot: top10,
  });

  return { success: true, top10 };
});

// --- Export CSV ---
export const exportCsv = onCall({ region: REGION }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be logged in");
  }

  const { sessionId } = request.data as { sessionId: string };

  const sessionDoc = await db.doc(`sessions/${sessionId}`).get();
  if (!sessionDoc.exists) {
    throw new HttpsError("not-found", "Session not found");
  }
  if (sessionDoc.data()?.hostId !== request.auth.uid) {
    throw new HttpsError("permission-denied", "Not the host");
  }

  // Get all answers
  const answersSnap = await db
    .collection(`sessions/${sessionId}/answers`)
    .get();

  // Get all players for nickname lookup
  const playersSnap = await db
    .collection(`sessions/${sessionId}/players`)
    .get();
  const playerMap = new Map<string, string>();
  playersSnap.docs.forEach((d) => {
    playerMap.set(d.id, d.data().nickname);
  });

  const header =
    "sessionId,playerNickname,playerId,questionId,selection,correct,timeMs,pointsAwarded";
  const rows = answersSnap.docs.map((d) => {
    const a = d.data();
    const nickname = playerMap.get(a.playerId) || "Unknown";
    return `${sessionId},"${nickname}",${a.playerId},${a.questionId},"${a.selection}",${a.correct},${a.timeMs},${a.pointsAwarded}`;
  });

  return { csv: [header, ...rows].join("\n") };
});
