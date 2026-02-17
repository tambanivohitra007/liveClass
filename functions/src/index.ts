import * as admin from "firebase-admin";
import * as crypto from "crypto";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";

admin.initializeApp();
const db = admin.firestore();

const REGION = "asia-southeast1";
const NUM_SHARDS = 10;

const FUNCTION_CONFIG = {
  region: REGION,
  memory: "256MiB" as const,
  minInstances: 0,
  maxInstances: 20,
};

function generatePin(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function getShardId(playerId: string): number {
  let hash = 0;
  for (let i = 0; i < playerId.length; i++) {
    hash = (hash * 31 + playerId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % NUM_SHARDS;
}

// --- Create Session ---
export const createSession = onCall(FUNCTION_CONFIG, async (request) => {
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

  // Initialize 10 leaderboard shards
  const batch = db.batch();
  batch.set(sessionRef, {
    quizId,
    hostId: request.auth.uid,
    pinCode,
    status: "lobby",
    currentQuestionIndex: 0,
    questionState: "lobby",
    joinLocked: false,
    antiCheatEnabled: true,
    startedAt: null,
    endedAt: null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  for (let i = 0; i < NUM_SHARDS; i++) {
    const shardRef = db.doc(
      `sessions/${sessionRef.id}/leaderboard_shards/${i}`
    );
    batch.set(shardRef, { players: {} });
  }

  await batch.commit();

  return { sessionId: sessionRef.id };
});

// --- Join Session ---
export const joinSession = onCall(FUNCTION_CONFIG, async (request) => {
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

  // Generate session token for anti-cheat
  const activeToken = generateToken();

  const playerRef = db.collection(`sessions/${sessionId}/players`).doc();
  await playerRef.set({
    sessionId,
    userId: request.auth?.uid || null,
    nickname,
    activeToken,
    joinedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { playerId: playerRef.id, activeToken };
});

// --- Start Question ---
export const startQuestion = onCall(FUNCTION_CONFIG, async (request) => {
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
export const scoreAnswer = onCall(FUNCTION_CONFIG, async (request) => {
  const { sessionId, questionId, playerId, selection, timeMs, activeToken } =
    request.data as {
      sessionId: string;
      questionId: string;
      playerId: string;
      selection: string;
      timeMs: number;
      activeToken?: string;
    };

  // Validate session is live
  const sessionDoc = await db.doc(`sessions/${sessionId}`).get();
  if (!sessionDoc.exists || sessionDoc.data()?.questionState !== "live") {
    throw new HttpsError(
      "failed-precondition",
      "Question is not currently live"
    );
  }

  // Validate session token (anti-cheat)
  if (activeToken) {
    const playerDoc = await db
      .doc(`sessions/${sessionId}/players/${playerId}`)
      .get();
    if (!playerDoc.exists || playerDoc.data()?.activeToken !== activeToken) {
      throw new HttpsError("permission-denied", "Invalid session token");
    }
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

  // Type-aware correctness check
  let correct = false;
  if (question.type === 'matching') {
    try {
      const pairs = JSON.parse(selection) as Record<string, string>;
      const options: string[] = question.options || [];
      const matchOpts: string[] = question.matchOptions || [];
      correct = options.length > 0 && options.every((left: string, idx: number) =>
        pairs[left] === matchOpts[idx]
      );
    } catch {
      correct = false;
    }
  } else if (question.type === 'fill_blank') {
    try {
      const answers = JSON.parse(selection) as string[];
      const expected: string[] = question.correctAnswers || [];
      correct = answers.length === expected.length && answers.every(
        (a: string, idx: number) => a.trim().toLowerCase() === expected[idx].trim().toLowerCase()
      );
    } catch {
      correct = false;
    }
  } else {
    correct = question.correctAnswers.includes(selection);
  }

  // Read current player state from shard to compute streak
  const shardId = getShardId(playerId);
  const shardRef = db.doc(
    `sessions/${sessionId}/leaderboard_shards/${shardId}`
  );
  const shardSnap = await shardRef.get();
  const shardData = shardSnap.data() || { players: {} };
  const playerData = shardData.players[playerId] || {
    totalPoints: 0,
    streak: 0,
  };

  // Calculate points: base(1000) * timeRemaining% * correctness
  let pointsAwarded = 0;
  if (correct) {
    const timeFactor = Math.max(
      0,
      (question.timeLimitSec * 1000 - timeMs) / (question.timeLimitSec * 1000)
    );
    pointsAwarded = Math.round(1000 * timeFactor);

    // Streak bonus: +50 per consecutive correct
    const newStreak = playerData.streak + 1;
    pointsAwarded += newStreak * 50;
  }

  // Write answer + update shard atomically
  const batch = db.batch();

  batch.set(db.doc(`sessions/${sessionId}/answers/${answerId}`), {
    sessionId,
    playerId,
    questionId,
    selection,
    timeMs,
    correct,
    pointsAwarded,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Update leaderboard shard using dot notation for the specific player
  batch.set(
    shardRef,
    {
      players: {
        [playerId]: {
          totalPoints: playerData.totalPoints + pointsAwarded,
          streak: correct ? playerData.streak + 1 : 0,
        },
      },
    },
    { merge: true }
  );

  await batch.commit();

  return { correct, pointsAwarded };
});

// --- End Question ---
export const endQuestion = onCall(FUNCTION_CONFIG, async (request) => {
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

  // Aggregate leaderboard across all 10 shards
  const shardsSnap = await db
    .collection(`sessions/${sessionId}/leaderboard_shards`)
    .get();

  const allPlayers: {
    playerId: string;
    totalPoints: number;
    streak: number;
  }[] = [];

  shardsSnap.docs.forEach((shardDoc) => {
    const players = shardDoc.data().players || {};
    for (const [pid, data] of Object.entries(players)) {
      const pdata = data as { totalPoints: number; streak: number };
      allPlayers.push({
        playerId: pid,
        totalPoints: pdata.totalPoints,
        streak: pdata.streak,
      });
    }
  });

  // Sort by totalPoints descending, take top 10
  allPlayers.sort((a, b) => b.totalPoints - a.totalPoints);
  const top10 = allPlayers.slice(0, 10).map((p, i) => ({
    playerId: p.playerId,
    totalPoints: p.totalPoints,
    rank: i + 1,
  }));

  // Get all answers for the CURRENT question (fix: filter by actual questionId)
  const questionsSnap = await db
    .collection("questions")
    .where("quizId", "==", session.quizId)
    .get();
  const questionsArr = questionsSnap.docs.map((d) => d.id);
  const currentQuestionId = questionsArr[session.currentQuestionIndex];

  let totalCorrect = 0;
  let totalTime = 0;
  let totalAnswers = 0;

  if (currentQuestionId) {
    const answersSnap = await db
      .collection(`sessions/${sessionId}/answers`)
      .where("questionId", "==", currentQuestionId)
      .get();

    answersSnap.docs.forEach((d) => {
      const data = d.data();
      totalAnswers++;
      if (data.correct) totalCorrect++;
      totalTime += data.timeMs || 0;
    });
  }

  await db
    .doc(`sessions/${sessionId}/analytics/${currentQuestionId || session.currentQuestionIndex}`)
    .set({
      questionIndex: session.currentQuestionIndex,
      totalAnswers,
      correctCount: totalCorrect,
      correctPercent:
        totalAnswers > 0 ? (totalCorrect / totalAnswers) * 100 : 0,
      avgTimeMs: totalAnswers > 0 ? totalTime / totalAnswers : 0,
    });

  await sessionDoc.ref.update({
    questionState: "reveal",
    top10Snapshot: top10,
  });

  return { success: true, top10 };
});

// --- Export CSV ---
export const exportCsv = onCall(FUNCTION_CONFIG, async (request) => {
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

  const answersSnap = await db
    .collection(`sessions/${sessionId}/answers`)
    .get();

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

// --- Report Violation (Anti-Cheat) ---
export const reportViolation = onCall(FUNCTION_CONFIG, async (request) => {
  const { sessionId, playerId, type } = request.data as {
    sessionId: string;
    playerId: string;
    type: string;
  };

  if (!sessionId || !playerId || !type) {
    throw new HttpsError("invalid-argument", "sessionId, playerId, and type are required");
  }

  const validTypes = ["tab_hidden", "window_blur", "paste_attempt"];
  if (!validTypes.includes(type)) {
    throw new HttpsError("invalid-argument", "Invalid violation type");
  }

  const sessionDoc = await db.doc(`sessions/${sessionId}`).get();
  if (!sessionDoc.exists) {
    throw new HttpsError("not-found", "Session not found");
  }
  if (sessionDoc.data()?.status === "ended") {
    throw new HttpsError("failed-precondition", "Session has ended");
  }
  if (sessionDoc.data()?.antiCheatEnabled === false) {
    return { success: false, reason: "Anti-cheat is disabled" };
  }

  const playerDoc = await db.doc(`sessions/${sessionId}/players/${playerId}`).get();
  if (!playerDoc.exists) {
    throw new HttpsError("not-found", "Player not found in session");
  }

  const nickname = playerDoc.data()?.nickname || "Unknown";
  const violationRef = db.doc(`sessions/${sessionId}/violations/${playerId}`);

  await violationRef.set(
    {
      playerId,
      nickname,
      totalViolations: admin.firestore.FieldValue.increment(1),
      events: admin.firestore.FieldValue.arrayUnion({
        type,
        timestamp: Date.now(),
      }),
    },
    { merge: true }
  );

  return { success: true };
});

// --- TTL Cleanup: delete sessions older than 24 hours ---
export const cleanupExpiredSessions = onSchedule(
  {
    schedule: "every 6 hours",
    region: REGION,
    memory: "256MiB",
  },
  async () => {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const expiredSessions = await db
      .collection("sessions")
      .where("createdAt", "<", cutoff)
      .where("status", "!=", "ended")
      .limit(100)
      .get();

    const batch = db.batch();
    expiredSessions.docs.forEach((doc) => {
      batch.update(doc.ref, {
        status: "ended",
        endedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    if (!expiredSessions.empty) {
      await batch.commit();
      console.log(`Cleaned up ${expiredSessions.size} expired sessions`);
    }
  }
);
