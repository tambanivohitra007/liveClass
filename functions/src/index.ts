import * as admin from "firebase-admin";
import * as crypto from "crypto";
import * as cheerio from "cheerio";
import * as nodemailer from "nodemailer";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onValueCreated } from "firebase-functions/v2/database";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";

admin.initializeApp();
const db = admin.firestore();
const rtdb = admin.database();
const storageBucket = admin.storage().bucket();

const REGION = "asia-southeast1";
const NUM_SHARDS = 10;
const geminiApiKey = defineSecret("GEMINI_API_KEY");

const FUNCTION_CONFIG = {
  region: REGION,
  memory: "256MiB" as const,
  minInstances: 0,
  maxInstances: 20,
};

// --- In-memory caches (persist across warm invocations) ---
const sessionDataCache = new Map<string, FirebaseFirestore.DocumentData>();
const questionDataCache = new Map<string, FirebaseFirestore.DocumentData>();
const playerDataCache = new Map<string, FirebaseFirestore.DocumentData>();

async function getSessionCached(sessionId: string): Promise<FirebaseFirestore.DocumentData | null> {
  if (sessionDataCache.has(sessionId)) return sessionDataCache.get(sessionId)!;
  const snap = await db.doc(`sessions/${sessionId}`).get();
  if (!snap.exists) return null;
  const data = snap.data()!;
  sessionDataCache.set(sessionId, data);
  return data;
}

async function getQuestionCached(questionId: string): Promise<FirebaseFirestore.DocumentData | null> {
  if (questionDataCache.has(questionId)) return questionDataCache.get(questionId)!;
  const snap = await db.doc(`questions/${questionId}`).get();
  if (!snap.exists) return null;
  const data = snap.data()!;
  questionDataCache.set(questionId, data);
  return data;
}

async function getPlayerCached(sessionId: string, playerId: string): Promise<FirebaseFirestore.DocumentData | null> {
  const key = `${sessionId}_${playerId}`;
  if (playerDataCache.has(key)) return playerDataCache.get(key)!;
  const snap = await db.doc(`sessions/${sessionId}/players/${playerId}`).get();
  if (!snap.exists) return null;
  const data = snap.data()!;
  playerDataCache.set(key, data);
  return data;
}

// --- Correctness checker (extracted for RTDB-only scoring) ---
function checkCorrectness(selection: string, question: FirebaseFirestore.DocumentData): boolean {
  const isPoll = question.type === "poll";
  const isSlide = question.type === "slide";

  if (isSlide) return false;
  if (isPoll) return true;

  if (question.type === "ordering") {
    try {
      const submitted = JSON.parse(selection) as string[];
      const expected: string[] = question.options || [];
      return submitted.length === expected.length &&
        submitted.every((item: string, idx: number) => item === expected[idx]);
    } catch {
      return false;
    }
  }

  if (question.type === "matching") {
    try {
      const pairs = JSON.parse(selection) as Record<string, string>;
      const options: string[] = question.options || [];
      const matchOpts: string[] = question.matchOptions || [];
      return options.length > 0 && options.every((left: string, idx: number) =>
        pairs[left] === matchOpts[idx]
      );
    } catch {
      return false;
    }
  }

  if (question.type === "fill_blank") {
    try {
      const answers = JSON.parse(selection) as string[];
      const expected: string[] = question.correctAnswers || [];
      return answers.length === expected.length && answers.every(
        (a: string, idx: number) => a.trim().toLowerCase() === expected[idx].trim().toLowerCase()
      );
    } catch {
      return false;
    }
  }

  if (question.type === "mcq" && question.correctAnswers && question.correctAnswers.length > 1) {
    try {
      const chosen = JSON.parse(selection) as string[];
      const expected: string[] = question.correctAnswers;
      return chosen.length === expected.length &&
        chosen.every((c: string) => expected.includes(c)) &&
        expected.every((e: string) => chosen.includes(e));
    } catch {
      return false;
    }
  }

  if (question.type === "code_output") {
    const expected: string[] = question.correctAnswers || [];
    return expected.some(
      (a: string) => a.trim().toLowerCase() === selection.trim().toLowerCase()
    );
  }

  // Default: mcq, tf
  return (question.correctAnswers || []).includes(selection);
}

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

// --- Email Helper ---
function getMailer(): nodemailer.Transporter | null {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({
    host,
    port: 587,
    secure: false,
    auth: { user, pass },
  });
}

async function sendNotificationEmail(
  to: string,
  subject: string,
  body: string
): Promise<void> {
  try {
    const mailer = getMailer();
    if (!mailer) return;
    await mailer.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      html: body,
    });
  } catch (err) {
    console.warn("Email send failed (non-fatal):", err);
  }
}

// --- Notification Helper ---
type NotificationType = "new_assignment" | "session_started" | "class_joined" | "class_removed";

interface NotificationPayload {
  type: NotificationType;
  title: string;
  message: string;
  metadata: Record<string, string | undefined>;
}

async function createNotificationsForClassroom(
  classroomId: string,
  excludeUserId: string,
  payload: NotificationPayload
): Promise<void> {
  const classroomDoc = await db.doc(`classrooms/${classroomId}`).get();
  if (!classroomDoc.exists) return;
  const classroomName = classroomDoc.data()?.name || "Unknown Class";

  const membersSnap = await db
    .collection(`classrooms/${classroomId}/members`)
    .where("role", "==", "student")
    .get();

  if (membersSnap.empty) return;

  const members = membersSnap.docs.filter((d) => d.data().userId !== excludeUserId);
  if (members.length === 0) return;

  const now = Date.now();

  // Batch write in chunks of 500
  for (let i = 0; i < members.length; i += 500) {
    const chunk = members.slice(i, i + 500);
    const batch = db.batch();
    for (const memberDoc of chunk) {
      const member = memberDoc.data();
      const notifRef = db.collection("notifications").doc();
      batch.set(notifRef, {
        userId: member.userId,
        type: payload.type,
        title: payload.title,
        message: payload.message,
        read: false,
        createdAt: now,
        metadata: { ...payload.metadata, classroomId, classroomName },
      });
    }
    await batch.commit();
  }

  // Fire-and-forget emails
  for (const memberDoc of members) {
    const email = memberDoc.data().email;
    if (email) {
      sendNotificationEmail(
        email,
        `${payload.title} — ${classroomName}`,
        `<h3>${payload.title}</h3><p>${payload.message}</p><p>Class: ${classroomName}</p>`
      );
    }
  }
}

// --- Create Session ---
export const createSession = onCall(FUNCTION_CONFIG, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be logged in");
  }

  const { quizId, classroomId } = request.data as { quizId: string; classroomId?: string };
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
    ...(classroomId ? { classroomId } : {}),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  for (let i = 0; i < NUM_SHARDS; i++) {
    const shardRef = db.doc(
      `sessions/${sessionRef.id}/leaderboard_shards/${i}`
    );
    batch.set(shardRef, { players: {} });
  }

  await batch.commit();

  // Fire-and-forget: notify classroom students about the live session
  if (classroomId) {
    const quizTitle = quizDoc.data()?.title || "a quiz";
    createNotificationsForClassroom(classroomId, request.auth!.uid, {
      type: "session_started",
      title: "Live Session Started",
      message: `A live session for "${quizTitle}" has started! Join with PIN: ${pinCode}`,
      metadata: { sessionId: sessionRef.id, pinCode, quizTitle },
    }).catch((err) => console.warn("Notification error (non-fatal):", err));
  }

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

  // Auto-assign team if team mode is enabled (round-robin)
  let teamIndex: number | null = null;
  if (session.teamMode && session.teamCount) {
    const playersSnap = await db
      .collection(`sessions/${sessionId}/players`)
      .get();
    teamIndex = playersSnap.size % session.teamCount;
  }

  const playerRef = db.collection(`sessions/${sessionId}/players`).doc();
  await playerRef.set({
    sessionId,
    userId: request.auth?.uid || null,
    nickname,
    activeToken,
    ...(teamIndex !== null ? { teamIndex } : {}),
    joinedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Initialize RTDB score for live leaderboard
  await rtdb.ref(`scores/${sessionId}/${playerRef.id}`).set({
    totalPoints: 0,
    streak: 0,
    nickname,
  });

  // Assign rotating question subset for late joiners
  if (session.status === "live" && session.rotatingSetSize) {
    const questionsSnap = await db
      .collection("questions")
      .where("quizId", "==", session.quizId)
      .get();
    const total = questionsSnap.size;
    const size = Math.min(session.rotatingSetSize, total);
    const indices = Array.from({ length: total }, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    await playerRef.update({ questionSubset: indices.slice(0, size) });
  }

  return { playerId: playerRef.id, activeToken };
});

// --- Assign Question Subsets (Rotating Sets) ---
export const assignQuestionSubsets = onCall(FUNCTION_CONFIG, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be logged in");
  }

  const { sessionId } = request.data as { sessionId: string };
  if (!sessionId) {
    throw new HttpsError("invalid-argument", "sessionId is required");
  }

  const sessionDoc = await db.doc(`sessions/${sessionId}`).get();
  if (!sessionDoc.exists) {
    throw new HttpsError("not-found", "Session not found");
  }

  const session = sessionDoc.data()!;
  if (session.hostId !== request.auth.uid) {
    throw new HttpsError("permission-denied", "Not the host");
  }
  if (!session.rotatingSetSize) {
    throw new HttpsError("failed-precondition", "Rotating set size not configured");
  }

  const [questionsSnap, playersSnap] = await Promise.all([
    db.collection("questions").where("quizId", "==", session.quizId).get(),
    db.collection(`sessions/${sessionId}/players`).get(),
  ]);

  const total = questionsSnap.size;
  const size = Math.min(session.rotatingSetSize, total);

  const batch = db.batch();
  for (const playerDoc of playersSnap.docs) {
    // Fisher-Yates shuffle for each player independently
    const indices = Array.from({ length: total }, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    batch.update(playerDoc.ref, { questionSubset: indices.slice(0, size) });
  }

  await batch.commit();
  return { success: true };
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

  // Generate question order on first question if shuffle is enabled
  const updateData: Record<string, unknown> = {
    status: "live",
    currentQuestionIndex: qIndex,
    questionState: "live",
    questionStartedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (qIndex === 0 && session.shuffleQuestions) {
    const questionsSnap = await db
      .collection("questions")
      .where("quizId", "==", session.quizId)
      .get();
    const indices = Array.from({ length: questionsSnap.size }, (_, i) => i);
    // Fisher-Yates shuffle
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    updateData.questionOrder = indices;
  }

  await sessionDoc.ref.update(updateData);

  return { success: true };
});

// --- Internal scoring helper (shared by callable + RTDB trigger) ---
interface ScoreInput {
  sessionId: string;
  questionId: string;
  playerId: string;
  selection: string;
  timeMs: number;
  activeToken?: string;
  calledFromTrigger?: boolean;
}
interface ScoreResult {
  correct: boolean;
  pointsAwarded: number;
  rank: number;
  totalPoints: number;
  behindBy: number;
}

async function computeAndWriteScore(input: ScoreInput): Promise<ScoreResult> {
  const { sessionId, questionId, playerId, selection, timeMs, activeToken, calledFromTrigger } = input;

  // Parallel fetch: session, player, dupe check, question, and shard
  const answerId = `${questionId}_${playerId}`;
  const shardId = getShardId(playerId);
  const shardRef = db.doc(
    `sessions/${sessionId}/leaderboard_shards/${shardId}`
  );

  const [sessionDoc, playerDoc, existingAnswer, questionDoc, shardSnap] = await Promise.all([
    db.doc(`sessions/${sessionId}`).get(),
    db.doc(`sessions/${sessionId}/players/${playerId}`).get(),
    db.doc(`sessions/${sessionId}/answers/${answerId}`).get(),
    db.doc(`questions/${questionId}`).get(),
    shardRef.get(),
  ]);

  // Validate session
  if (!sessionDoc.exists) {
    throw new HttpsError("not-found", "Session not found");
  }
  if (!calledFromTrigger && sessionDoc.data()?.questionState !== "live") {
    throw new HttpsError("failed-precondition", "Question is not currently live");
  }

  // Validate player
  if (!playerDoc.exists) {
    throw new HttpsError("not-found", "Player not found in session");
  }
  const playerNickname: string = playerDoc.data()?.nickname || "";

  // Validate session token (anti-cheat)
  if (activeToken) {
    if (playerDoc.data()?.activeToken !== activeToken) {
      throw new HttpsError("permission-denied", "Invalid session token");
    }
  }

  // Prevent duplicate answers
  if (existingAnswer.exists) {
    throw new HttpsError("already-exists", "Already answered this question");
  }

  // Validate question
  if (!questionDoc.exists) {
    throw new HttpsError("not-found", "Question not found");
  }

  const question = questionDoc.data()!;

  // Type-aware correctness check
  let correct = false;
  const isPoll = question.type === 'poll';
  const isSlide = question.type === 'slide';

  if (isSlide) {
    return { correct: false, pointsAwarded: 0, rank: 0, totalPoints: 0, behindBy: 0 };
  } else if (isPoll) {
    correct = true;
  } else if (question.type === 'ordering') {
    try {
      const submitted = JSON.parse(selection) as string[];
      const expected: string[] = question.options || [];
      correct = submitted.length === expected.length &&
        submitted.every((item: string, idx: number) => item === expected[idx]);
    } catch {
      correct = false;
    }
  } else if (question.type === 'matching') {
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
  } else if (question.type === 'mcq' && question.correctAnswers.length > 1) {
    // Multi-answer MCQ: selection is a JSON array of chosen options
    try {
      const chosen = JSON.parse(selection) as string[];
      const expected: string[] = question.correctAnswers;
      correct = chosen.length === expected.length &&
        chosen.every((c: string) => expected.includes(c)) &&
        expected.every((e: string) => chosen.includes(e));
    } catch {
      // Fallback: single string sent for a multi-answer question
      correct = false;
    }
  } else if (question.type === 'code_output') {
    const expected: string[] = question.correctAnswers || [];
    correct = expected.some(
      (a: string) => a.trim().toLowerCase() === selection.trim().toLowerCase()
    );
  } else {
    correct = question.correctAnswers.includes(selection);
  }

  // Shard data (already fetched in parallel)
  const shardData = shardSnap.data() || { players: {} };
  const playerData = shardData.players[playerId] || {
    totalPoints: 0,
    streak: 0,
  };

  // Calculate points: base(1000) * timeRemaining% * correctness
  let pointsAwarded = 0;
  if (correct && !isPoll) {
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

  batch.set(
    shardRef,
    {
      players: {
        [playerId]: {
          totalPoints: playerData.totalPoints + pointsAwarded,
          streak: correct ? playerData.streak + 1 : 0,
          nickname: playerNickname,
        },
      },
    },
    { merge: true }
  );

  await batch.commit();

  // Compute rank info for personal feedback
  const newTotalPoints = playerData.totalPoints + pointsAwarded;
  const allShards = await db
    .collection(`sessions/${sessionId}/leaderboard_shards`)
    .get();
  const ranked: { pid: string; pts: number }[] = [];
  allShards.docs.forEach((s) => {
    const pl = s.data().players || {};
    for (const [pid, d] of Object.entries(pl)) {
      const pd = d as { totalPoints: number };
      ranked.push({ pid, pts: pid === playerId ? newTotalPoints : pd.totalPoints });
    }
  });
  ranked.sort((a, b) => b.pts - a.pts);
  const rank = ranked.findIndex((p) => p.pid === playerId) + 1;
  const behindBy = rank > 1 ? ranked[rank - 2].pts - newTotalPoints : 0;

  return { correct, pointsAwarded, rank, totalPoints: newTotalPoints, behindBy };
}

// --- Score Answer (callable — used by PlayAssignment) ---
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

  return computeAndWriteScore({ sessionId, questionId, playerId, selection, timeMs, activeToken });
});

// --- Process Answer (RTDB trigger — used by PlayGame live mode) ---
// Zero Firestore ops during active answering. All scoring via RTDB + in-memory cache.
export const processAnswer = onValueCreated(
  {
    ref: "/liveAnswers/{sessionId}/{questionId}/{playerId}",
    region: REGION,
    memory: "256MiB",
    maxInstances: 20,
  },
  async (event) => {
    const { sessionId, questionId, playerId } = event.params;
    const data = event.data.val();
    const resultRef = rtdb.ref(`results/${sessionId}/${questionId}/${playerId}`);
    const countRef = rtdb.ref(`answerCounts/${sessionId}/${questionId}/count`);

    // Increment answer count FIRST so host sees it before scoring finishes
    await countRef.transaction((current: number | null) => (current || 0) + 1);

    try {
      // Fetch from in-memory cache (0 Firestore ops after first call)
      const [session, question, player] = await Promise.all([
        getSessionCached(sessionId),
        getQuestionCached(questionId),
        getPlayerCached(sessionId, playerId),
      ]);

      if (!session) throw new HttpsError("not-found", "Session not found");
      if (!question) throw new HttpsError("not-found", "Question not found");
      if (!player) throw new HttpsError("not-found", "Player not found");

      // Validate anti-cheat token
      if (data.activeToken && player.activeToken !== data.activeToken) {
        throw new HttpsError("permission-denied", "Invalid session token");
      }

      // Slide type: no scoring
      if (question.type === "slide") {
        await resultRef.set({
          correct: false, pointsAwarded: 0, rank: 0,
          totalPoints: 0, behindBy: 0,
          processedAt: admin.database.ServerValue.TIMESTAMP,
        });
        return;
      }

      // Check correctness using extracted helper
      const correct = checkCorrectness(data.selection, question);
      const isPoll = question.type === "poll";

      // Read current score from RTDB
      const scoreRef = rtdb.ref(`scores/${sessionId}/${playerId}`);
      const currentScoreSnap = await scoreRef.get();
      const currentScore = currentScoreSnap.val() || { totalPoints: 0, streak: 0 };

      // Calculate points: base(1000) * timeRemaining% + streak bonus
      let pointsAwarded = 0;
      let newStreak = 0;
      if (correct && !isPoll) {
        const timeFactor = Math.max(
          0,
          (question.timeLimitSec * 1000 - data.timeMs) / (question.timeLimitSec * 1000)
        );
        pointsAwarded = Math.round(1000 * timeFactor);
        newStreak = currentScore.streak + 1;
        pointsAwarded += newStreak * 50;
      } else if (correct) {
        // Poll: correct but 0 points
        newStreak = currentScore.streak;
      }

      const newTotalPoints = currentScore.totalPoints + pointsAwarded;

      // Update RTDB score atomically
      await scoreRef.transaction((current: { totalPoints: number; streak: number; nickname: string } | null) => {
        if (!current) return { totalPoints: pointsAwarded, streak: correct ? 1 : 0, nickname: player.nickname || "" };
        return {
          totalPoints: current.totalPoints + pointsAwarded,
          streak: correct && !isPoll ? current.streak + 1 : (correct ? current.streak : 0),
          nickname: current.nickname || player.nickname || "",
        };
      });

      // Store answer in _pending for batch persist at endQuestion
      await rtdb.ref(`_pending/${sessionId}/${questionId}/${playerId}`).set({
        selection: data.selection,
        timeMs: data.timeMs,
        correct,
        pointsAwarded,
      });

      // Compute rank from RTDB scores
      const allScoresSnap = await rtdb.ref(`scores/${sessionId}`).get();
      const allScores = allScoresSnap.val() || {};
      const ranked: { pid: string; pts: number }[] = [];
      for (const [pid, score] of Object.entries(allScores)) {
        const s = score as { totalPoints: number };
        ranked.push({ pid, pts: pid === playerId ? newTotalPoints : s.totalPoints });
      }
      ranked.sort((a, b) => b.pts - a.pts);
      const rank = ranked.findIndex((p) => p.pid === playerId) + 1;
      const behindBy = rank > 1 ? ranked[rank - 2].pts - newTotalPoints : 0;

      // Write result for student feedback
      await resultRef.set({
        correct,
        pointsAwarded,
        rank,
        totalPoints: newTotalPoints,
        behindBy,
        processedAt: admin.database.ServerValue.TIMESTAMP,
      });
    } catch (err) {
      // Write error result so player doesn't hang
      const message = err instanceof HttpsError ? err.message : "Scoring failed";
      await resultRef.set({
        correct: false,
        pointsAwarded: 0,
        rank: 0,
        totalPoints: 0,
        behindBy: 0,
        error: message,
        processedAt: admin.database.ServerValue.TIMESTAMP,
      });
    }
  }
);

// --- End Question ---
// Reads scores + pending answers from RTDB, batch-persists to Firestore
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

  // Determine current question ID
  const questionsSnap = await db
    .collection("questions")
    .where("quizId", "==", session.quizId)
    .get();
  const questionsArr = questionsSnap.docs.map((d) => d.id);
  const qIdx = session.questionOrder
    ? session.questionOrder[session.currentQuestionIndex]
    : session.currentQuestionIndex;
  const currentQuestionId = questionsArr[qIdx];

  // Parallel fetch: RTDB scores, RTDB pending answers, Firestore players
  const [scoresSnap, pendingSnap, playersSnap] = await Promise.all([
    rtdb.ref(`scores/${sessionId}`).get(),
    currentQuestionId ? rtdb.ref(`_pending/${sessionId}/${currentQuestionId}`).get() : Promise.resolve(null),
    db.collection(`sessions/${sessionId}/players`).get(),
  ]);

  // Build nickname map from players
  const nicknameMap = new Map<string, string>();
  playersSnap.docs.forEach((d) => {
    nicknameMap.set(d.id, d.data().nickname || "");
  });

  // Build leaderboard from RTDB scores
  const allScores = scoresSnap.val() || {};
  const allPlayers: {
    playerId: string;
    nickname: string;
    totalPoints: number;
    streak: number;
  }[] = [];

  for (const [pid, score] of Object.entries(allScores)) {
    const s = score as { totalPoints: number; streak: number; nickname?: string };
    allPlayers.push({
      playerId: pid,
      nickname: s.nickname || nicknameMap.get(pid) || "",
      totalPoints: s.totalPoints,
      streak: s.streak,
    });
  }

  allPlayers.sort((a, b) => b.totalPoints - a.totalPoints);
  const top10 = allPlayers.slice(0, 10).map((p, i) => ({
    playerId: p.playerId,
    nickname: p.nickname,
    totalPoints: p.totalPoints,
    rank: i + 1,
  }));

  // Compute analytics from pending answers
  let totalCorrect = 0;
  let totalTime = 0;
  let totalAnswers = 0;
  const pendingAnswers = pendingSnap?.val() || {};

  // Batch-write: answer docs + leaderboard shards + analytics + session update
  const batch = db.batch();

  for (const [pid, answer] of Object.entries(pendingAnswers)) {
    const a = answer as { selection: string; timeMs: number; correct: boolean; pointsAwarded: number };
    totalAnswers++;
    if (a.correct) totalCorrect++;
    totalTime += a.timeMs || 0;

    // Persist answer doc to Firestore
    const answerId = `${currentQuestionId}_${pid}`;
    batch.set(db.doc(`sessions/${sessionId}/answers/${answerId}`), {
      sessionId,
      playerId: pid,
      questionId: currentQuestionId,
      selection: a.selection,
      timeMs: a.timeMs,
      correct: a.correct,
      pointsAwarded: a.pointsAwarded,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  // Sync RTDB scores → Firestore leaderboard_shards
  const shardGroups = new Map<number, Record<string, { totalPoints: number; streak: number; nickname: string }>>();
  for (const p of allPlayers) {
    const shardId = getShardId(p.playerId);
    if (!shardGroups.has(shardId)) shardGroups.set(shardId, {});
    shardGroups.get(shardId)![p.playerId] = {
      totalPoints: p.totalPoints,
      streak: p.streak,
      nickname: p.nickname,
    };
  }
  for (const [shardId, players] of shardGroups) {
    batch.set(
      db.doc(`sessions/${sessionId}/leaderboard_shards/${shardId}`),
      { players }
    );
  }

  // Analytics doc
  batch.set(
    db.doc(`sessions/${sessionId}/analytics/${currentQuestionId || session.currentQuestionIndex}`),
    {
      questionIndex: session.currentQuestionIndex,
      totalAnswers,
      correctCount: totalCorrect,
      correctPercent: playersSnap.size > 0 ? (totalCorrect / playersSnap.size) * 100 : 0,
      avgTimeMs: totalAnswers > 0 ? totalTime / totalAnswers : 0,
    }
  );

  // Compute team scores if team mode is enabled
  let teamScoreSnapshot: { teamIndex: number; name: string; color: string; avgPoints: number }[] = [];
  if (session.teamMode && session.teams) {
    const playerTeams = new Map<string, number>();
    playersSnap.docs.forEach((d) => {
      const data = d.data();
      if (data.teamIndex !== undefined) {
        playerTeams.set(d.id, data.teamIndex);
      }
    });

    const teamTotals: { total: number; count: number }[] =
      (session.teams as { name: string; color: string }[]).map(() => ({ total: 0, count: 0 }));

    allPlayers.forEach((p) => {
      const ti = playerTeams.get(p.playerId);
      if (ti !== undefined && teamTotals[ti]) {
        teamTotals[ti].total += p.totalPoints;
        teamTotals[ti].count++;
      }
    });

    teamScoreSnapshot = (session.teams as { name: string; color: string }[]).map((t, i) => ({
      teamIndex: i,
      name: t.name,
      color: t.color,
      avgPoints: teamTotals[i].count > 0
        ? Math.round(teamTotals[i].total / teamTotals[i].count)
        : 0,
    }));
    teamScoreSnapshot.sort((a, b) => b.avgPoints - a.avgPoints);
  }

  // Session update
  batch.update(sessionDoc.ref, {
    questionState: "reveal",
    top10Snapshot: top10,
    ...(teamScoreSnapshot.length > 0 ? { teamScoreSnapshot } : {}),
  });

  // Commit Firestore batch + clean up RTDB in parallel
  await Promise.all([
    batch.commit(),
    rtdb.ref(`liveAnswers/${sessionId}`).remove(),
    rtdb.ref(`results/${sessionId}`).remove(),
    rtdb.ref(`answerCounts/${sessionId}`).remove(),
    currentQuestionId ? rtdb.ref(`_pending/${sessionId}/${currentQuestionId}`).remove() : Promise.resolve(),
    // Do NOT clean scores/ — needed for next question + Leaderboard subscriptions
  ]);

  // Clear question cache for this question (won't be needed again)
  if (currentQuestionId) questionDataCache.delete(currentQuestionId);

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

  const [answersSnap, playersSnap] = await Promise.all([
    db.collection(`sessions/${sessionId}/answers`).get(),
    db.collection(`sessions/${sessionId}/players`).get(),
  ]);
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

// --- PDF Helper: download from Storage and return base64 ---
async function getPdfBase64(storagePath: string): Promise<string> {
  const file = storageBucket.file(storagePath);
  const [exists] = await file.exists();
  if (!exists) {
    throw new HttpsError("not-found", "PDF file not found in storage");
  }
  const [metadata] = await file.getMetadata();
  const size = Number(metadata.size || 0);
  if (size === 0) {
    throw new HttpsError("invalid-argument", "PDF file is empty");
  }
  if (size > 10 * 1024 * 1024) {
    throw new HttpsError("invalid-argument", "PDF file exceeds 10MB limit");
  }
  const [buffer] = await file.download();
  return buffer.toString("base64");
}

// --- URL Helper: fetch and extract text content ---
async function extractUrlContent(targetUrl: string): Promise<{ text: string; title: string }> {
  // Block private/internal IPs
  const urlObj = new URL(targetUrl);
  const hostname = urlObj.hostname.toLowerCase();
  const blockedPatterns = ["localhost", "127.", "10.", "192.168.", "172.16.", "172.17.", "172.18.", "172.19.", "172.20.", "172.21.", "172.22.", "172.23.", "172.24.", "172.25.", "172.26.", "172.27.", "172.28.", "172.29.", "172.30.", "172.31.", "0.0.0.0", "::1", "[::1]"];
  if (blockedPatterns.some((p) => hostname.startsWith(p) || hostname === p)) {
    throw new HttpsError("invalid-argument", "Private/internal addresses are not allowed");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(targetUrl, {
      signal: controller.signal,
      headers: { "User-Agent": "LiveClassBot/1.0" },
      redirect: "follow",
    });
    clearTimeout(timeout);

    if (!res.ok) {
      throw new HttpsError("internal", `URL returned HTTP ${res.status}`);
    }

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
      throw new HttpsError("invalid-argument", "URL must point to an HTML or text page");
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    // Remove non-content elements
    $("script, style, nav, header, footer, aside, iframe, noscript").remove();

    // Extract title
    const pageTitle = $("title").first().text().trim() || $("h1").first().text().trim() || "";

    // Extract main content: prefer <article> or <main>, fallback to <body>
    let textContent = "";
    const mainEl = $("article").first().length ? $("article").first() : $("main").first().length ? $("main").first() : $("body");
    textContent = mainEl.text();

    // Clean whitespace
    textContent = textContent.replace(/\s+/g, " ").trim();

    // Truncate to 15000 chars
    if (textContent.length > 15000) {
      textContent = textContent.substring(0, 15000) + "...";
    }

    if (textContent.length < 50) {
      throw new HttpsError("invalid-argument", "Not enough content extracted from URL — the page may be empty or use client-side rendering");
    }

    return { text: textContent, title: pageTitle };
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof HttpsError) throw err;
    if ((err as Error).name === "AbortError") {
      throw new HttpsError("deadline-exceeded", "URL took too long to respond");
    }
    throw new HttpsError("internal", `Could not access URL: ${(err as Error).message}`);
  }
}

// --- AI Question Generator ---
export const generateQuestions = onCall(
  { ...FUNCTION_CONFIG, memory: "1GiB" as const, secrets: [geminiApiKey] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be logged in");
    }

    const {
      source = "topic",
      topic = "",
      count = 5,
      questionType = "mcq",
      description = "",
      difficulty = "mixed",
      generateMeta = false,
      pdfStoragePath,
      url,
      additionalContext = "",
    } = request.data as {
      source?: "topic" | "pdf" | "url";
      topic?: string;
      count?: number;
      questionType?: string;
      description?: string;
      difficulty?: string;
      generateMeta?: boolean;
      pdfStoragePath?: string;
      url?: string;
      additionalContext?: string;
    };

    // Source-specific validation
    if (source === "topic") {
      if (!topic || topic.trim().length < 3) {
        throw new HttpsError("invalid-argument", "Topic must be at least 3 characters");
      }
    } else if (source === "pdf") {
      if (!pdfStoragePath) {
        throw new HttpsError("invalid-argument", "PDF storage path is required");
      }
    } else if (source === "url") {
      if (!url) {
        throw new HttpsError("invalid-argument", "URL is required");
      }
      try {
        const parsed = new URL(url);
        if (!["http:", "https:"].includes(parsed.protocol)) {
          throw new Error("Invalid protocol");
        }
      } catch {
        throw new HttpsError("invalid-argument", "Invalid URL — must be a valid HTTP/HTTPS URL");
      }
    } else {
      throw new HttpsError("invalid-argument", "Invalid source — must be topic, pdf, or url");
    }

    const clampedCount = Math.min(Math.max(count, 1), 10);

    const apiKey = geminiApiKey.value();
    if (!apiKey) {
      // Fallback: generate template questions without AI
      const label = source === "topic" ? topic : source === "url" ? "URL content" : "PDF content";
      const mixedTypes = ["mcq", "tf", "short", "matching", "fill_blank"];
      const fallbackQuestion = (i: number) => {
        const effectiveType = isMixed ? mixedTypes[i % mixedTypes.length] : questionType;
        const base = { type: effectiveType, text: `Question ${i + 1} about ${label}` };
        switch (effectiveType) {
          case "tf":
            return { ...base, options: ["True", "False"], correctAnswers: ["True"], timeLimitSec: 15 };
          case "short":
            return { ...base, options: [], correctAnswers: [label], timeLimitSec: 30 };
          case "matching":
            return { ...base, text: `Match the following about ${label}`, options: ["Item A", "Item B", "Item C"], matchOptions: ["Match A", "Match B", "Match C"], correctAnswers: ["Item A", "Item B", "Item C"], timeLimitSec: 30 };
          case "ordering":
            return { ...base, text: `Put these in the correct order (${label})`, options: ["First", "Second", "Third", "Fourth"], correctAnswers: ["First", "Second", "Third", "Fourth"], timeLimitSec: 30 };
          case "fill_blank":
            return { ...base, text: `The ___ is related to ${label}`, options: [], correctAnswers: ["answer"], timeLimitSec: 25 };
          case "code_output":
            return { ...base, text: `What does this code output?`, options: [], correctAnswers: ["output"], codeSnippet: "console.log('Hello');", codeLanguage: "javascript", timeLimitSec: 30 };
          default:
            return { ...base, options: ["Option A", "Option B", "Option C", "Option D"], correctAnswers: ["Option A"], timeLimitSec: 20 };
        }
      };
      const questions = Array.from({ length: clampedCount }, (_, i) => fallbackQuestion(i));
      return {
        questions,
        ...(generateMeta ? { title: `Quiz: ${label}`, description: `A quiz about ${label}` } : {}),
        note: "AI API key not configured. Template questions generated — edit them manually.",
      };
    }

    // Build per-type JSON template for the prompt
    const typeTemplates: Record<string, string> = {
      mcq: '{"text":"What is the capital of France?","options":["Paris","London","Berlin","Madrid"],"correctAnswers":["Paris"],"timeLimitSec":20}',
      tf: '{"text":"The Earth is flat.","options":["True","False"],"correctAnswers":["False"],"timeLimitSec":15}',
      short: '{"text":"What gas do plants absorb?","options":[],"correctAnswers":["carbon dioxide"],"timeLimitSec":30}',
      matching: '{"text":"Match the following","options":["left1","left2","left3"],"matchOptions":["right1","right2","right3"],"correctAnswers":["left1","left2","left3"],"timeLimitSec":30}',
      ordering: '{"text":"Put these in order","options":["first","second","third","fourth"],"correctAnswers":["first","second","third","fourth"],"timeLimitSec":30}',
      fill_blank: '{"text":"The ___ is the powerhouse of the ___","options":[],"correctAnswers":["mitochondria","cell"],"timeLimitSec":25}',
      code_output: '{"text":"What does this code output?","options":[],"correctAnswers":["Hello World"],"codeSnippet":"print(\'Hello World\')","codeLanguage":"python","timeLimitSec":30}',
    };

    const metaInstruction = generateMeta
      ? 'Return ONLY valid JSON: {"title":"...","description":"...","questions":[...]}'
      : "Return ONLY a valid JSON array. Each element:";

    const isMixed = questionType === "mixed";

    const codeOutputInstruction = (questionType === "code_output" || isMixed)
      ? `For code_output questions: generate a realistic code snippet in "codeSnippet" that tests understanding of programming concepts (variable tracing, loops, functions, type coercion, etc.). Set "codeLanguage" to the language used — choose from: javascript, python, java, c, c++, c#, php, typescript, dart, go, ruby, kotlin, swift, rust. Set "options" to []. Put the exact expected program/console output as a string in "correctAnswers". The "text" field should be a short prompt like "What does this code output?" or "What is printed by this program?". Vary the languages and concepts across questions.`
      : "";

    // Templates with "type" field included for mixed mode
    const mixedTemplates: Record<string, string> = {
      mcq: '{"type":"mcq","text":"What is the capital of France?","options":["Paris","London","Berlin","Madrid"],"correctAnswers":["Paris"],"timeLimitSec":20}',
      tf: '{"type":"tf","text":"The Earth is flat.","options":["True","False"],"correctAnswers":["False"],"timeLimitSec":15}',
      short: '{"type":"short","text":"What gas do plants absorb?","options":[],"correctAnswers":["carbon dioxide"],"timeLimitSec":30}',
      matching: '{"type":"matching","text":"Match the following","options":["left1","left2","left3"],"matchOptions":["right1","right2","right3"],"correctAnswers":["left1","left2","left3"],"timeLimitSec":30}',
      ordering: '{"type":"ordering","text":"Put these in order","options":["first","second","third","fourth"],"correctAnswers":["first","second","third","fourth"],"timeLimitSec":30}',
      fill_blank: '{"type":"fill_blank","text":"The ___ is the powerhouse of the ___","options":[],"correctAnswers":["mitochondria","cell"],"timeLimitSec":25}',
      code_output: '{"type":"code_output","text":"What does this code output?","options":[],"correctAnswers":["Hello World"],"codeSnippet":"print(\'Hello World\')","codeLanguage":"python","timeLimitSec":30}',
    };

    const mixedTypeInstructions = isMixed
      ? `Generate a VARIETY of question types. Each question MUST include a "type" field with one of: "mcq", "tf", "short", "matching", "ordering", "fill_blank", "code_output".
Try to use at least 3 different types. Here are the JSON templates for each type:
MCQ: ${mixedTemplates.mcq}
True/False: ${mixedTemplates.tf}
Short Answer: ${mixedTemplates.short}
Matching: ${mixedTemplates.matching}
Ordering: ${mixedTemplates.ordering}
Fill in the Blank: ${mixedTemplates.fill_blank}
Code Output: ${mixedTemplates.code_output}`
      : `Question type: ${questionType}.

${metaInstruction}
${typeTemplates[questionType] || typeTemplates.mcq}`;

    const commonInstructions = `Generate ${clampedCount} quiz questions.
${additionalContext ? `Additional context: ${additionalContext}` : ""}
Difficulty: ${difficulty}.
${mixedTypeInstructions}
${!isMixed ? "" : metaInstruction}
IMPORTANT: "correctAnswers" must contain the FULL TEXT of the correct option, copied exactly from the "options" array (same text, same casing). Do NOT use letter labels like "A", "B", "C", "D" — use the actual option text.
${codeOutputInstruction}
Make questions educational, varied in difficulty, and factually accurate.`;

    // Build source-specific prompt + Gemini parts
    let geminiParts: Record<string, unknown>[];
    let maxOutputTokens = 4096;

    if (source === "pdf") {
      const pdfBase64 = await getPdfBase64(pdfStoragePath!);
      const pdfPrompt = `Based on the content of this PDF document, ${commonInstructions}
${description ? `Context: ${description}` : ""}`;
      geminiParts = [
        { inline_data: { mime_type: "application/pdf", data: pdfBase64 } },
        { text: pdfPrompt },
      ];
      maxOutputTokens = 8192;
    } else if (source === "url") {
      const { text: webText, title: webTitle } = await extractUrlContent(url!);
      const urlPrompt = `Based on the following web page content, ${commonInstructions}
${description ? `Context: ${description}` : ""}
Web page title: "${webTitle}"

--- WEB PAGE CONTENT ---
${webText}
--- END WEB PAGE CONTENT ---`;
      geminiParts = [{ text: urlPrompt }];
      maxOutputTokens = 8192;
    } else {
      // topic mode (original behavior)
      const topicPrompt = `About "${topic}". ${commonInstructions}
${description ? `Context: ${description}` : ""}`;
      geminiParts = [{ text: topicPrompt }];
    }

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: geminiParts }],
            generationConfig: { maxOutputTokens, temperature: 0.7 },
          }),
        }
      );

      if (!res.ok) {
        const errBody = await res.text();
        console.error("Gemini API HTTP error:", res.status, errBody);
        // Check for PDF-specific errors
        if (source === "pdf" && (errBody.includes("password") || errBody.includes("encrypted"))) {
          throw new HttpsError("invalid-argument", "Could not read PDF — it may be password-protected");
        }
        throw new HttpsError("internal", `Gemini API error: ${res.status}`);
      }

      const data = await res.json();

      // Check for API-level errors (bad key, quota, blocked, etc.)
      if (data.error) {
        console.error("Gemini API error:", JSON.stringify(data.error));
        throw new HttpsError("internal", data.error.message || "Gemini API error");
      }

      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) {
        console.error("Gemini returned no text. Full response:", JSON.stringify(data));
        throw new HttpsError("internal", "Gemini returned an empty response");
      }

      // Strip markdown code fences (```json ... ```)
      const responseText = rawText.replace(/```(?:json)?\s*/gi, "").replace(/```\s*/g, "").trim();

      let questions: Record<string, unknown>[];
      let title: string | undefined;
      let desc: string | undefined;

      if (generateMeta) {
        const objMatch = responseText.match(/\{[\s\S]*\}/);
        if (!objMatch) throw new HttpsError("internal", "Failed to parse AI response as object");
        const parsed = JSON.parse(objMatch[0]);
        title = parsed.title;
        desc = parsed.description;
        questions = Array.isArray(parsed.questions) ? parsed.questions : [];
      } else {
        const jsonMatch = responseText.match(/\[[\s\S]*\]/);
        if (!jsonMatch) throw new HttpsError("internal", "Failed to parse AI response as array");
        questions = JSON.parse(jsonMatch[0]);
      }

      if (questions.length === 0) {
        throw new HttpsError("internal", "AI returned 0 questions — try again");
      }

      // Normalize correctAnswers: AI may return correctAnswer (singular), a string, or an array
      const normalizeCorrectAnswers = (q: Record<string, unknown>): string[] => {
        const raw = q.correctAnswers ?? q.correctAnswer ?? q.correct_answer ?? q.answer;
        if (!raw) return [];
        if (Array.isArray(raw)) return raw.map(String);
        return [String(raw)];
      };

      // Map letter labels (A-F) to option indices
      const letterToIndex: Record<string, number> = { A: 0, B: 1, C: 2, D: 3, E: 4, F: 5 };

      const mapped = questions.map(
        (q: Record<string, unknown>) => {
          const options = (q.options as string[]) || [];
          const correctAnswers = normalizeCorrectAnswers(q).map((ca) => {
            // Ensure correctAnswer text exactly matches an option
            const exact = options.find((o) => o === ca);
            if (exact) return exact;
            const fuzzy = options.find((o) => o.trim().toLowerCase() === ca.trim().toLowerCase());
            if (fuzzy) return fuzzy;
            // Fallback: AI returned a letter label (A, B, C, D) — resolve to actual option text
            const idx = letterToIndex[ca.trim().toUpperCase()];
            if (idx !== undefined && idx < options.length) return options[idx];
            return ca;
          });
          const validTypes = ["mcq", "tf", "short", "matching", "ordering", "fill_blank", "code_output"];
          const resolvedType = isMixed && validTypes.includes(q.type as string)
            ? q.type as string
            : (isMixed ? "mcq" : questionType);
          return {
            type: resolvedType,
            text: q.text || "",
            options,
            ...(q.matchOptions ? { matchOptions: q.matchOptions as string[] } : {}),
            ...(q.codeSnippet ? { codeSnippet: q.codeSnippet as string } : {}),
            ...(q.codeLanguage ? { codeLanguage: q.codeLanguage as string } : {}),
            correctAnswers,
            timeLimitSec: (q.timeLimitSec as number) || 20,
          };
        }
      );

      // Clean up temporary PDF from storage after successful generation
      if (source === "pdf" && pdfStoragePath) {
        storageBucket.file(pdfStoragePath).delete().catch(() => {});
      }

      return {
        questions: mapped,
        ...(generateMeta ? { title, description: desc } : {}),
      };
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      console.error("AI generation failed:", err);
      throw new HttpsError("internal", "AI generation failed");
    }
  }
);

// --- AI Evaluation ---
export const evaluateSession = onCall(
  { ...FUNCTION_CONFIG, memory: "512MiB" as const, secrets: [geminiApiKey] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be logged in");
    }

    const { sessionId, mode, playerId, questionIndex } = request.data as {
      sessionId: string;
      mode: "participant" | "question";
      playerId?: string;
      questionIndex?: number;
    };

    if (!sessionId || !mode) {
      throw new HttpsError("invalid-argument", "sessionId and mode are required");
    }

    // Verify caller is the host
    const sessionDoc = await db.doc(`sessions/${sessionId}`).get();
    if (!sessionDoc.exists) {
      throw new HttpsError("not-found", "Session not found");
    }
    if (sessionDoc.data()?.hostId !== request.auth.uid) {
      throw new HttpsError("permission-denied", "Not the host");
    }

    const session = sessionDoc.data()!;

    // Cache key
    const cacheId = mode === "participant"
      ? `participant_${playerId}`
      : `question_${questionIndex}`;

    // Check cache
    const cacheRef = db.doc(`sessions/${sessionId}/evaluations/${cacheId}`);
    const cached = await cacheRef.get();
    if (cached.exists) {
      return { evaluation: cached.data()?.evaluation, cached: true };
    }

    // Gather data based on mode
    let prompt: string;

    // Store question details for merging after AI response (participant mode)
    let questionDetailsForMerge: {
      questionIndex: number;
      questionText: string;
      status: "correct" | "incorrect" | "unattempted";
      studentAnswer: string | null;
      correctAnswer: string;
      points: number;
    }[] = [];

    if (mode === "participant") {
      if (!playerId) {
        throw new HttpsError("invalid-argument", "playerId is required for participant mode");
      }

      // Get player info
      const playerDoc = await db.doc(`sessions/${sessionId}/players/${playerId}`).get();
      if (!playerDoc.exists) {
        throw new HttpsError("not-found", "Player not found");
      }
      const nickname = playerDoc.data()?.nickname || "Unknown";

      // Get all answers for this player
      const answersSnap = await db
        .collection(`sessions/${sessionId}/answers`)
        .where("playerId", "==", playerId)
        .get();

      // Get questions data
      const questionsSnap = await db
        .collection("questions")
        .where("quizId", "==", session.quizId)
        .get();
      const questionsArr = questionsSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      // Build answers map keyed by questionId for O(1) lookup
      const answersMap = new Map<string, { selection: string | string[]; correct: boolean; pointsAwarded: number; timeMs: number }>();
      answersSnap.docs.forEach((d) => {
        const a = d.data();
        answersMap.set(a.questionId, {
          selection: a.selection,
          correct: a.correct,
          pointsAwarded: a.pointsAwarded,
          timeMs: a.timeMs,
        });
      });

      // Use questionOrder if available, otherwise natural order
      const questionOrder = session.questionOrder || questionsArr.map((_: unknown, i: number) => i);

      // Build answer details for ALL questions (including unattempted)
      const answerLines: string[] = [];
      questionDetailsForMerge = [];
      let correctCount = 0;
      let totalPoints = 0;

      for (let qi = 0; qi < questionOrder.length; qi++) {
        const actualIdx = questionOrder[qi];
        const q = questionsArr[actualIdx] as Record<string, unknown> | undefined;
        if (!q) continue;

        const qId = q.id as string;
        const qText = (q.text as string) || "Unknown";
        const qType = (q.type as string) || "mcq";
        const correctAnswers = (q.correctAnswers as string[]) || [];
        const answer = answersMap.get(qId);

        if (answer) {
          const status = answer.correct ? "correct" : "incorrect";
          if (answer.correct) correctCount++;
          totalPoints += answer.pointsAwarded;

          answerLines.push(
            `Q${qi + 1} [${qType}]: "${qText}" → answered "${answer.selection}" → ${answer.correct ? "CORRECT" : "INCORRECT"} (${answer.pointsAwarded}pts, ${(answer.timeMs / 1000).toFixed(1)}s)`
          );
          questionDetailsForMerge.push({
            questionIndex: qi,
            questionText: qText,
            status,
            studentAnswer: String(answer.selection),
            correctAnswer: correctAnswers.join(", "),
            points: answer.pointsAwarded,
          });
        } else {
          answerLines.push(
            `Q${qi + 1} [${qType}]: "${qText}" → UNATTEMPTED (0pts)`
          );
          questionDetailsForMerge.push({
            questionIndex: qi,
            questionText: qText,
            status: "unattempted",
            studentAnswer: null,
            correctAnswer: correctAnswers.join(", "),
            points: 0,
          });
        }
      }

      const totalQuestions = questionOrder.length;

      prompt = `You are an educational AI evaluator. Analyze this student's quiz performance and return a JSON evaluation.

Student: ${nickname}
Quiz: ${totalQuestions} questions
Score: ${correctCount}/${totalQuestions} correct (${totalPoints} points)

Answer details:
${answerLines.join("\n")}

Return ONLY valid JSON with this exact structure:
{
  "summary": "2-3 sentence overall assessment",
  "strengths": ["strength1", "strength2"],
  "weaknesses": ["weakness1", "weakness2"],
  "recommendations": ["recommendation1", "recommendation2"],
  "overallRating": "excellent|good|average|needs_improvement",
  "topicMastery": [{"topic": "topic name", "level": "strong|moderate|weak"}],
  "questionBreakdown": [{"questionIndex": 0, "status": "correct|incorrect|unattempted", "explanation": "Brief explanation of performance on this question"}]
}

For questionBreakdown, include one entry per question in order. The explanation should be 1 sentence: why the answer was correct, what went wrong, or why skipping matters.`;
    } else {
      if (questionIndex === undefined || questionIndex === null) {
        throw new HttpsError("invalid-argument", "questionIndex is required for question mode");
      }

      // Get questions
      const questionsSnap = await db
        .collection("questions")
        .where("quizId", "==", session.quizId)
        .get();
      const questionsArr = questionsSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      const questionOrder = session.questionOrder || questionsArr.map((_: unknown, i: number) => i);
      const actualIdx = questionOrder[questionIndex] ?? questionIndex;
      const question = questionsArr[actualIdx];
      if (!question) {
        throw new HttpsError("not-found", "Question not found at given index");
      }

      // Get all answers for this question
      const answersSnap = await db
        .collection(`sessions/${sessionId}/answers`)
        .where("questionId", "==", question.id)
        .get();

      const answers = answersSnap.docs.map((d) => d.data());
      const totalAnswers = answers.length;
      const correctCount = answers.filter((a) => a.correct).length;
      const avgTimeMs = totalAnswers > 0
        ? answers.reduce((s, a) => s + (a.timeMs || 0), 0) / totalAnswers
        : 0;

      // Count answer selections
      const selectionCounts = new Map<string, number>();
      answers.forEach((a) => {
        const sel = String(a.selection);
        selectionCounts.set(sel, (selectionCounts.get(sel) || 0) + 1);
      });

      const qData = question as Record<string, unknown>;

      prompt = `You are an educational AI evaluator. Analyze this quiz question's quality and student responses, then return a JSON evaluation.

Question [${qData.type || "mcq"}]: "${qData.text}"
Options: ${JSON.stringify(qData.options || [])}
Correct answers: ${JSON.stringify(qData.correctAnswers || [])}
Time limit: ${qData.timeLimitSec || 20}s

Student responses (${totalAnswers} total):
- Correct: ${correctCount} (${totalAnswers > 0 ? ((correctCount / totalAnswers) * 100).toFixed(0) : 0}%)
- Avg response time: ${(avgTimeMs / 1000).toFixed(1)}s
- Answer distribution: ${JSON.stringify(Object.fromEntries(selectionCounts))}

Return ONLY valid JSON with this exact structure:
{
  "summary": "2-3 sentence analysis of question quality and student performance",
  "difficultyRating": "too_easy|appropriate|too_hard",
  "qualityScore": 7,
  "commonMistakes": ["mistake1", "mistake2"],
  "suggestions": ["suggestion1", "suggestion2"],
  "discriminationIndex": "good|fair|poor"
}`;
    }

    // Call Gemini API
    const apiKey = geminiApiKey.value();
    if (!apiKey) {
      throw new HttpsError("failed-precondition", "AI API key not configured");
    }

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 2048, temperature: 0.3 },
          }),
        }
      );

      if (!res.ok) {
        const errBody = await res.text();
        console.error("Gemini API error:", res.status, errBody);
        throw new HttpsError("internal", `Gemini API error: ${res.status}`);
      }

      const data = await res.json();
      if (data.error) {
        console.error("Gemini API error:", JSON.stringify(data.error));
        throw new HttpsError("internal", data.error.message || "Gemini API error");
      }

      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) {
        throw new HttpsError("internal", "Gemini returned an empty response");
      }

      // Parse JSON from response
      const cleaned = rawText.replace(/```(?:json)?\s*/gi, "").replace(/```\s*/g, "").trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new HttpsError("internal", "Failed to parse AI evaluation response");
      }

      const evaluation = JSON.parse(jsonMatch[0]);

      // Merge structural question data into questionBreakdown (participant mode)
      if (mode === "participant" && questionDetailsForMerge.length > 0) {
        const aiBreakdown = evaluation.questionBreakdown || [];
        evaluation.questionBreakdown = questionDetailsForMerge.map((detail) => {
          const aiEntry = aiBreakdown.find(
            (e: { questionIndex: number }) => e.questionIndex === detail.questionIndex
          );
          return {
            ...detail,
            explanation: aiEntry?.explanation || "",
          };
        });
      }

      // Cache to Firestore
      await cacheRef.set({
        evaluation,
        mode,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { evaluation, cached: false };
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      console.error("AI evaluation failed:", err);
      throw new HttpsError("internal", "AI evaluation failed");
    }
  }
);

// --- Classroom: Generate Join Code ---
const JOIN_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I, O, 0, 1
function generateJoinCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += JOIN_CODE_CHARS[Math.floor(Math.random() * JOIN_CODE_CHARS.length)];
  }
  return code;
}

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

// --- Create Classroom ---
export const createClassroom = onCall(FUNCTION_CONFIG, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be logged in");
  }

  const { name, description = "", color = "brand" } = request.data as {
    name: string;
    description?: string;
    color?: string;
  };

  if (!name || name.trim().length === 0) {
    throw new HttpsError("invalid-argument", "Name is required");
  }
  if (name.trim().length > 100) {
    throw new HttpsError("invalid-argument", "Name too long");
  }

  // Generate unique join code
  let joinCode = generateJoinCode();
  let existing = await db
    .collection("classrooms")
    .where("joinCode", "==", joinCode)
    .get();
  while (!existing.empty) {
    joinCode = generateJoinCode();
    existing = await db
      .collection("classrooms")
      .where("joinCode", "==", joinCode)
      .get();
  }

  const now = Date.now();
  const classroomRef = db.collection("classrooms").doc();

  await classroomRef.set({
    name: name.trim(),
    description: description.trim(),
    color,
    ownerId: request.auth.uid,
    joinCode,
    joinCodeExpiresAt: now + FOURTEEN_DAYS_MS,
    studentCount: 0,
    coTeacherCount: 0,
    createdAt: now,
    updatedAt: now,
  });

  return { classroomId: classroomRef.id, joinCode };
});

// --- Join Classroom ---
export const joinClassroom = onCall(FUNCTION_CONFIG, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be logged in");
  }

  const { code } = request.data as { code: string };
  if (!code || code.trim().length !== 6) {
    throw new HttpsError("invalid-argument", "Invalid join code");
  }

  const upperCode = code.trim().toUpperCase();

  // Find classroom by join code
  const snap = await db
    .collection("classrooms")
    .where("joinCode", "==", upperCode)
    .limit(1)
    .get();

  if (snap.empty) {
    throw new HttpsError("not-found", "No classroom found with that code");
  }

  const classroomDoc = snap.docs[0];
  const classroom = classroomDoc.data();

  // Check expiry
  if (Date.now() > classroom.joinCodeExpiresAt) {
    throw new HttpsError("failed-precondition", "This join code has expired");
  }

  // Check not already a member
  const memberDoc = await db
    .doc(`classrooms/${classroomDoc.id}/members/${request.auth.uid}`)
    .get();
  if (memberDoc.exists) {
    throw new HttpsError("already-exists", "You are already a member of this class");
  }

  // Check not the owner
  if (classroom.ownerId === request.auth.uid) {
    throw new HttpsError("already-exists", "You are the owner of this class");
  }

  // Get user info for denormalization
  const userDoc = await db.doc(`users/${request.auth.uid}`).get();
  const userData = userDoc.data() || {};

  const batch = db.batch();

  batch.set(
    db.doc(`classrooms/${classroomDoc.id}/members/${request.auth.uid}`),
    {
      userId: request.auth.uid,
      displayName: userData.displayName || "",
      email: userData.email || request.auth.token.email || "",
      role: "student",
      joinedAt: Date.now(),
    }
  );

  batch.update(classroomDoc.ref, {
    studentCount: admin.firestore.FieldValue.increment(1),
    updatedAt: Date.now(),
  });

  await batch.commit();

  // Fire-and-forget: notify the joining student
  db.collection("notifications").add({
    userId: request.auth!.uid,
    type: "class_joined",
    title: "Joined Class",
    message: `You have joined "${classroom.name}"`,
    read: false,
    createdAt: Date.now(),
    metadata: { classroomId: classroomDoc.id, classroomName: classroom.name },
  }).catch((err) => console.warn("Notification error (non-fatal):", err));

  const memberEmail = userData.email || request.auth!.token.email || "";
  if (memberEmail) {
    sendNotificationEmail(
      memberEmail,
      `Joined Class — ${classroom.name}`,
      `<h3>Joined Class</h3><p>You have joined "${classroom.name}".</p>`
    );
  }

  return { classroomId: classroomDoc.id, name: classroom.name };
});

// --- Add Co-Teacher ---
export const addCoTeacher = onCall(FUNCTION_CONFIG, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be logged in");
  }

  const { classroomId, email } = request.data as {
    classroomId: string;
    email: string;
  };

  if (!classroomId || !email) {
    throw new HttpsError("invalid-argument", "classroomId and email are required");
  }

  // Check caller is owner or co-teacher
  const classroomDoc = await db.doc(`classrooms/${classroomId}`).get();
  if (!classroomDoc.exists) {
    throw new HttpsError("not-found", "Classroom not found");
  }

  const classroom = classroomDoc.data()!;
  const isOwner = classroom.ownerId === request.auth.uid;
  const callerMember = await db
    .doc(`classrooms/${classroomId}/members/${request.auth.uid}`)
    .get();
  const isCoTeacher = callerMember.exists && callerMember.data()?.role === "co-teacher";

  if (!isOwner && !isCoTeacher) {
    throw new HttpsError("permission-denied", "Only the owner or co-teachers can add co-teachers");
  }

  // Find user by email
  const usersSnap = await db
    .collection("users")
    .where("email", "==", email.trim().toLowerCase())
    .limit(1)
    .get();

  if (usersSnap.empty) {
    throw new HttpsError("not-found", "No user found with that email");
  }

  const targetUser = usersSnap.docs[0];
  const targetUserId = targetUser.id;
  const targetData = targetUser.data();

  // Check not already a member
  const existingMember = await db
    .doc(`classrooms/${classroomId}/members/${targetUserId}`)
    .get();
  if (existingMember.exists) {
    throw new HttpsError("already-exists", "This user is already a member");
  }

  // Check not the owner
  if (classroom.ownerId === targetUserId) {
    throw new HttpsError("already-exists", "This user is already the owner");
  }

  const batch = db.batch();

  batch.set(
    db.doc(`classrooms/${classroomId}/members/${targetUserId}`),
    {
      userId: targetUserId,
      displayName: targetData.displayName || "",
      email: targetData.email || email.trim().toLowerCase(),
      role: "co-teacher",
      joinedAt: Date.now(),
    }
  );

  batch.update(classroomDoc.ref, {
    coTeacherCount: admin.firestore.FieldValue.increment(1),
    updatedAt: Date.now(),
  });

  await batch.commit();

  return { success: true, displayName: targetData.displayName || email };
});

// --- Remove Classroom Member ---
export const removeClassroomMember = onCall(FUNCTION_CONFIG, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be logged in");
  }

  const { classroomId, userId } = request.data as {
    classroomId: string;
    userId: string;
  };

  if (!classroomId || !userId) {
    throw new HttpsError("invalid-argument", "classroomId and userId are required");
  }

  const classroomDoc = await db.doc(`classrooms/${classroomId}`).get();
  if (!classroomDoc.exists) {
    throw new HttpsError("not-found", "Classroom not found");
  }

  const classroom = classroomDoc.data()!;

  // Can't remove the owner
  if (classroom.ownerId === userId) {
    throw new HttpsError("failed-precondition", "Cannot remove the classroom owner");
  }

  // Check caller is owner or co-teacher
  const isOwner = classroom.ownerId === request.auth.uid;
  const callerMember = await db
    .doc(`classrooms/${classroomId}/members/${request.auth.uid}`)
    .get();
  const isCoTeacher = callerMember.exists && callerMember.data()?.role === "co-teacher";

  if (!isOwner && !isCoTeacher) {
    throw new HttpsError("permission-denied", "Only the owner or co-teachers can remove members");
  }

  const memberDoc = await db
    .doc(`classrooms/${classroomId}/members/${userId}`)
    .get();
  if (!memberDoc.exists) {
    throw new HttpsError("not-found", "Member not found");
  }

  const memberRole = memberDoc.data()?.role;
  const countField = memberRole === "co-teacher" ? "coTeacherCount" : "studentCount";

  const memberEmail = memberDoc.data()?.email || "";
  const classroomName = classroom.name || "Unknown Class";

  const batch = db.batch();
  batch.delete(memberDoc.ref);
  batch.update(classroomDoc.ref, {
    [countField]: admin.firestore.FieldValue.increment(-1),
    updatedAt: Date.now(),
  });

  await batch.commit();

  // Fire-and-forget: notify the removed student
  db.collection("notifications").add({
    userId,
    type: "class_removed",
    title: "Removed from Class",
    message: `You have been removed from "${classroomName}"`,
    read: false,
    createdAt: Date.now(),
    metadata: { classroomId, classroomName },
  }).catch((err) => console.warn("Notification error (non-fatal):", err));

  if (memberEmail) {
    sendNotificationEmail(
      memberEmail,
      `Removed from Class — ${classroomName}`,
      `<h3>Removed from Class</h3><p>You have been removed from "${classroomName}".</p>`
    );
  }

  return { success: true };
});

// --- Regenerate Join Code ---
export const regenerateJoinCode = onCall(FUNCTION_CONFIG, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be logged in");
  }

  const { classroomId } = request.data as { classroomId: string };
  if (!classroomId) {
    throw new HttpsError("invalid-argument", "classroomId is required");
  }

  const classroomDoc = await db.doc(`classrooms/${classroomId}`).get();
  if (!classroomDoc.exists) {
    throw new HttpsError("not-found", "Classroom not found");
  }

  const classroom = classroomDoc.data()!;

  // Check caller is owner or co-teacher
  const isOwner = classroom.ownerId === request.auth.uid;
  const callerMember = await db
    .doc(`classrooms/${classroomId}/members/${request.auth.uid}`)
    .get();
  const isCoTeacher = callerMember.exists && callerMember.data()?.role === "co-teacher";

  if (!isOwner && !isCoTeacher) {
    throw new HttpsError("permission-denied", "Only the owner or co-teachers can regenerate the join code");
  }

  // Generate unique new code
  let joinCode = generateJoinCode();
  let existing = await db
    .collection("classrooms")
    .where("joinCode", "==", joinCode)
    .get();
  while (!existing.empty) {
    joinCode = generateJoinCode();
    existing = await db
      .collection("classrooms")
      .where("joinCode", "==", joinCode)
      .get();
  }

  await classroomDoc.ref.update({
    joinCode,
    joinCodeExpiresAt: Date.now() + FOURTEEN_DAYS_MS,
    updatedAt: Date.now(),
  });

  return { joinCode, expiresAt: Date.now() + FOURTEEN_DAYS_MS };
});

// --- End Student-Paced Session ---
// Reads scores + ALL pending answers from RTDB, batch-persists to Firestore
export const endStudentPacedSession = onCall(FUNCTION_CONFIG, async (request) => {
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

  // Parallel fetch: RTDB scores, RTDB pending (all questions), Firestore questions + players
  const [scoresSnap, pendingSnap, questionsSnap, playersSnap] = await Promise.all([
    rtdb.ref(`scores/${sessionId}`).get(),
    rtdb.ref(`_pending/${sessionId}`).get(),
    db.collection("questions").where("quizId", "==", session.quizId).get(),
    db.collection(`sessions/${sessionId}/players`).get(),
  ]);

  // Build nickname map
  const nicknameMap = new Map<string, string>();
  playersSnap.docs.forEach((d) => {
    nicknameMap.set(d.id, d.data().nickname || "");
  });

  // Build leaderboard from RTDB scores
  const allScores = scoresSnap.val() || {};
  const allPlayers: {
    playerId: string;
    nickname: string;
    totalPoints: number;
    streak: number;
  }[] = [];

  for (const [pid, score] of Object.entries(allScores)) {
    const s = score as { totalPoints: number; streak: number; nickname?: string };
    allPlayers.push({
      playerId: pid,
      nickname: s.nickname || nicknameMap.get(pid) || "",
      totalPoints: s.totalPoints,
      streak: s.streak,
    });
  }

  allPlayers.sort((a, b) => b.totalPoints - a.totalPoints);
  const top10 = allPlayers.slice(0, 10).map((p, i) => ({
    playerId: p.playerId,
    nickname: p.nickname,
    totalPoints: p.totalPoints,
    rank: i + 1,
  }));

  // Process ALL pending answers across all questions
  const allPending = pendingSnap?.val() || {};
  const answersByQuestion = new Map<string, { correct: number; total: number; time: number }>();

  const batch = db.batch();

  for (const [questionId, players] of Object.entries(allPending)) {
    const playerAnswers = players as Record<string, { selection: string; timeMs: number; correct: boolean; pointsAwarded: number }>;
    for (const [pid, a] of Object.entries(playerAnswers)) {
      // Persist answer doc to Firestore
      const answerId = `${questionId}_${pid}`;
      batch.set(db.doc(`sessions/${sessionId}/answers/${answerId}`), {
        sessionId,
        playerId: pid,
        questionId,
        selection: a.selection,
        timeMs: a.timeMs,
        correct: a.correct,
        pointsAwarded: a.pointsAwarded,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Accumulate analytics per question
      const stats = answersByQuestion.get(questionId) || { correct: 0, total: 0, time: 0 };
      stats.total++;
      if (a.correct) stats.correct++;
      stats.time += a.timeMs || 0;
      answersByQuestion.set(questionId, stats);
    }
  }

  // Sync RTDB scores → Firestore leaderboard_shards
  const shardGroups = new Map<number, Record<string, { totalPoints: number; streak: number; nickname: string }>>();
  for (const p of allPlayers) {
    const shardId = getShardId(p.playerId);
    if (!shardGroups.has(shardId)) shardGroups.set(shardId, {});
    shardGroups.get(shardId)![p.playerId] = {
      totalPoints: p.totalPoints,
      streak: p.streak,
      nickname: p.nickname,
    };
  }
  for (const [shardId, players] of shardGroups) {
    batch.set(
      db.doc(`sessions/${sessionId}/leaderboard_shards/${shardId}`),
      { players }
    );
  }

  // Write per-question analytics
  for (const qDoc of questionsSnap.docs) {
    const qId = qDoc.id;
    const stats = answersByQuestion.get(qId) || { correct: 0, total: 0, time: 0 };
    batch.set(
      db.doc(`sessions/${sessionId}/analytics/${qId}`),
      {
        totalAnswers: stats.total,
        correctCount: stats.correct,
        correctPercent: stats.total > 0 ? (stats.correct / stats.total) * 100 : 0,
        avgTimeMs: stats.total > 0 ? stats.time / stats.total : 0,
      }
    );
  }

  batch.update(sessionDoc.ref, {
    status: "ended",
    endedAt: Date.now(),
    questionState: "ended",
    top10Snapshot: top10,
  });

  await Promise.all([
    batch.commit(),
    rtdb.ref(`liveAnswers/${sessionId}`).remove(),
    rtdb.ref(`results/${sessionId}`).remove(),
    rtdb.ref(`answerCounts/${sessionId}`).remove(),
    rtdb.ref(`studentProgress/${sessionId}`).remove(),
    rtdb.ref(`scores/${sessionId}`).remove(),
    rtdb.ref(`_pending/${sessionId}`).remove(),
  ]);

  // Clear caches for this session
  sessionDataCache.delete(sessionId);

  return { success: true, top10 };
});

// --- Firestore Trigger: Assignment Created ---
export const onAssignmentCreated = onDocumentCreated(
  { document: "assignments/{assignmentId}", region: REGION, memory: "256MiB" },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const classroomId = data.classroomId as string | undefined;
    if (!classroomId) return;

    const ownerId = data.ownerId as string;
    const assignmentId = event.params.assignmentId;

    // Fetch quiz title
    let quizTitle = "a quiz";
    const quizId = data.quizId as string | undefined;
    if (quizId) {
      const quizDoc = await db.doc(`quizzes/${quizId}`).get();
      if (quizDoc.exists) {
        quizTitle = quizDoc.data()?.title || quizTitle;
      }
    }

    await createNotificationsForClassroom(classroomId, ownerId, {
      type: "new_assignment",
      title: "New Assignment",
      message: `A new assignment for "${quizTitle}" has been posted`,
      metadata: { assignmentId, quizTitle },
    });
  }
);

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
      // Clean up RTDB data for expired sessions
      await Promise.all(
        expiredSessions.docs.map((d) =>
          Promise.all([
            rtdb.ref(`liveAnswers/${d.id}`).remove(),
            rtdb.ref(`results/${d.id}`).remove(),
            rtdb.ref(`answerCounts/${d.id}`).remove(),
            rtdb.ref(`scores/${d.id}`).remove(),
            rtdb.ref(`_pending/${d.id}`).remove(),
          ])
        )
      );
      console.log(`Cleaned up ${expiredSessions.size} expired sessions`);
    }
  }
);
