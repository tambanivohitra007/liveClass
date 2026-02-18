import * as admin from "firebase-admin";
import * as crypto from "crypto";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onValueCreated } from "firebase-functions/v2/database";
import { defineSecret } from "firebase-functions/params";

admin.initializeApp();
const db = admin.firestore();
const rtdb = admin.database();

const REGION = "asia-southeast1";
const NUM_SHARDS = 10;
const geminiApiKey = defineSecret("GEMINI_API_KEY");

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

  // Validate session is live (skip questionState check for trigger — answer was written during live phase)
  const sessionDoc = await db.doc(`sessions/${sessionId}`).get();
  if (!sessionDoc.exists) {
    throw new HttpsError("not-found", "Session not found");
  }
  if (!calledFromTrigger && sessionDoc.data()?.questionState !== "live") {
    throw new HttpsError("failed-precondition", "Question is not currently live");
  }

  // Fetch player doc for nickname + token validation
  const playerDoc = await db
    .doc(`sessions/${sessionId}/players/${playerId}`)
    .get();
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

  // Prevent duplicate answers (idempotency guard)
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
      const result = await computeAndWriteScore({
        sessionId,
        questionId,
        playerId,
        selection: data.selection,
        timeMs: data.timeMs,
        activeToken: data.activeToken,
        calledFromTrigger: true,
      });

      await resultRef.set({
        correct: result.correct,
        pointsAwarded: result.pointsAwarded,
        rank: result.rank,
        totalPoints: result.totalPoints,
        behindBy: result.behindBy,
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
    nickname: string;
    totalPoints: number;
    streak: number;
  }[] = [];

  shardsSnap.docs.forEach((shardDoc) => {
    const players = shardDoc.data().players || {};
    for (const [pid, data] of Object.entries(players)) {
      const pdata = data as { totalPoints: number; streak: number; nickname?: string };
      allPlayers.push({
        playerId: pid,
        nickname: pdata.nickname || "",
        totalPoints: pdata.totalPoints,
        streak: pdata.streak,
      });
    }
  });

  // Backfill nicknames from player docs if missing in shards
  const missingNicknames = allPlayers.filter((p) => !p.nickname);
  if (missingNicknames.length > 0) {
    const playersSnap2 = await db
      .collection(`sessions/${sessionId}/players`)
      .get();
    const nicknameMap = new Map<string, string>();
    playersSnap2.docs.forEach((d) => {
      nicknameMap.set(d.id, d.data().nickname || "");
    });
    missingNicknames.forEach((p) => {
      p.nickname = nicknameMap.get(p.playerId) || "";
    });
  }

  // Sort by totalPoints descending, take top 10
  allPlayers.sort((a, b) => b.totalPoints - a.totalPoints);
  const top10 = allPlayers.slice(0, 10).map((p, i) => ({
    playerId: p.playerId,
    nickname: p.nickname,
    totalPoints: p.totalPoints,
    rank: i + 1,
  }));

  // Get all answers for the CURRENT question (fix: filter by actual questionId)
  const questionsSnap = await db
    .collection("questions")
    .where("quizId", "==", session.quizId)
    .get();
  const questionsArr = questionsSnap.docs.map((d) => d.id);
  const qIdx = session.questionOrder
    ? session.questionOrder[session.currentQuestionIndex]
    : session.currentQuestionIndex;
  const currentQuestionId = questionsArr[qIdx];

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

  // Compute team scores if team mode is enabled
  let teamScoreSnapshot: { teamIndex: number; name: string; color: string; avgPoints: number }[] = [];
  if (session.teamMode && session.teams) {
    const playersSnap = await db
      .collection(`sessions/${sessionId}/players`)
      .get();
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

  // Check if this is the last question
  const totalQuestions = questionsArr.length;
  const isLastQuestion = session.currentQuestionIndex >= totalQuestions - 1;

  await sessionDoc.ref.update({
    questionState: "reveal",
    top10Snapshot: top10,
    ...(teamScoreSnapshot.length > 0 ? { teamScoreSnapshot } : {}),
    ...(isLastQuestion ? { status: "ended", endedAt: Date.now() } : {}),
  });

  // Clean up RTDB data for this session
  await Promise.all([
    rtdb.ref(`liveAnswers/${sessionId}`).remove(),
    rtdb.ref(`results/${sessionId}`).remove(),
    rtdb.ref(`answerCounts/${sessionId}`).remove(),
  ]);

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

// --- AI Question Generator ---
export const generateQuestions = onCall(
  { ...FUNCTION_CONFIG, memory: "512MiB" as const, secrets: [geminiApiKey] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be logged in");
    }

    const {
      topic,
      count = 5,
      questionType = "mcq",
      description = "",
      difficulty = "mixed",
      generateMeta = false,
    } = request.data as {
      topic: string;
      count?: number;
      questionType?: string;
      description?: string;
      difficulty?: string;
      generateMeta?: boolean;
    };

    if (!topic || topic.trim().length < 3) {
      throw new HttpsError("invalid-argument", "Topic must be at least 3 characters");
    }

    const clampedCount = Math.min(Math.max(count, 1), 10);

    const apiKey = geminiApiKey.value();
    if (!apiKey) {
      // Fallback: generate template questions without AI
      const fallbackQuestion = (i: number) => {
        const base = { type: questionType, text: `Question ${i + 1} about ${topic}` };
        switch (questionType) {
          case "tf":
            return { ...base, options: ["True", "False"], correctAnswers: ["True"], timeLimitSec: 15 };
          case "short":
            return { ...base, options: [], correctAnswers: [topic], timeLimitSec: 30 };
          case "matching":
            return { ...base, text: `Match the following about ${topic}`, options: ["Item A", "Item B", "Item C"], matchOptions: ["Match A", "Match B", "Match C"], correctAnswers: ["Item A", "Item B", "Item C"], timeLimitSec: 30 };
          case "ordering":
            return { ...base, text: `Put these in the correct order (${topic})`, options: ["First", "Second", "Third", "Fourth"], correctAnswers: ["First", "Second", "Third", "Fourth"], timeLimitSec: 30 };
          case "fill_blank":
            return { ...base, text: `The ___ is related to ${topic}`, options: [], correctAnswers: ["answer"], timeLimitSec: 25 };
          default:
            return { ...base, options: ["Option A", "Option B", "Option C", "Option D"], correctAnswers: ["Option A"], timeLimitSec: 20 };
        }
      };
      const questions = Array.from({ length: clampedCount }, (_, i) => fallbackQuestion(i));
      return {
        questions,
        ...(generateMeta ? { title: `Quiz: ${topic}`, description: `A quiz about ${topic}` } : {}),
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
    };

    const metaInstruction = generateMeta
      ? 'Return ONLY valid JSON: {"title":"...","description":"...","questions":[...]}'
      : "Return ONLY a valid JSON array. Each element:";

    const prompt = `Generate ${clampedCount} quiz questions about "${topic}".
${description ? `Context: ${description}` : ""}
Difficulty: ${difficulty}.
Question type: ${questionType}.

${metaInstruction}
${typeTemplates[questionType] || typeTemplates.mcq}
IMPORTANT: "correctAnswers" must contain the FULL TEXT of the correct option, copied exactly from the "options" array (same text, same casing). Do NOT use letter labels like "A", "B", "C", "D" — use the actual option text.
Make questions educational, varied in difficulty, and factually accurate.`;

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 4096, temperature: 0.7 },
          }),
        }
      );

      if (!res.ok) {
        const errBody = await res.text();
        console.error("Gemini API HTTP error:", res.status, errBody);
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
          return {
            type: questionType,
            text: q.text || "",
            options,
            ...(q.matchOptions ? { matchOptions: q.matchOptions as string[] } : {}),
            correctAnswers,
            timeLimitSec: (q.timeLimitSec as number) || 20,
          };
        }
      );

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
      const questionsMap = new Map<string, { text: string; type: string; correctAnswers: string[] }>();
      questionsSnap.docs.forEach((d) => {
        const data = d.data();
        questionsMap.set(d.id, {
          text: data.text,
          type: data.type,
          correctAnswers: data.correctAnswers || [],
        });
      });

      // Build answer details
      const answerDetails = answersSnap.docs.map((d) => {
        const a = d.data();
        const q = questionsMap.get(a.questionId);
        return {
          question: q?.text || "Unknown",
          type: q?.type || "mcq",
          selected: a.selection,
          correct: a.correct,
          points: a.pointsAwarded,
          timeMs: a.timeMs,
        };
      });

      const totalQuestions = questionsSnap.size;
      const correctCount = answerDetails.filter((a) => a.correct).length;
      const totalPoints = answerDetails.reduce((s, a) => s + a.points, 0);

      prompt = `You are an educational AI evaluator. Analyze this student's quiz performance and return a JSON evaluation.

Student: ${nickname}
Quiz: ${totalQuestions} questions
Score: ${correctCount}/${totalQuestions} correct (${totalPoints} points)

Answer details:
${answerDetails.map((a, i) => `Q${i + 1} [${a.type}]: "${a.question}" → answered "${a.selected}" → ${a.correct ? "CORRECT" : "INCORRECT"} (${a.points}pts, ${(a.timeMs / 1000).toFixed(1)}s)`).join("\n")}

Return ONLY valid JSON with this exact structure:
{
  "summary": "2-3 sentence overall assessment",
  "strengths": ["strength1", "strength2"],
  "weaknesses": ["weakness1", "weakness2"],
  "recommendations": ["recommendation1", "recommendation2"],
  "overallRating": "excellent|good|average|needs_improvement",
  "topicMastery": [{"topic": "topic name", "level": "strong|moderate|weak"}]
}`;
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
          ])
        )
      );
      console.log(`Cleaned up ${expiredSessions.size} expired sessions`);
    }
  }
);
