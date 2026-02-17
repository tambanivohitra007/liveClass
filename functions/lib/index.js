"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanupExpiredSessions = exports.exportCsv = exports.endQuestion = exports.scoreAnswer = exports.startQuestion = exports.joinSession = exports.createSession = void 0;
const admin = __importStar(require("firebase-admin"));
const crypto = __importStar(require("crypto"));
const https_1 = require("firebase-functions/v2/https");
const scheduler_1 = require("firebase-functions/v2/scheduler");
admin.initializeApp();
const db = admin.firestore();
const REGION = "asia-southeast1";
const NUM_SHARDS = 10;
const FUNCTION_CONFIG = {
    region: REGION,
    memory: "512MiB",
    minInstances: 1,
    maxInstances: 20,
};
function generatePin() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}
function generateToken() {
    return crypto.randomBytes(32).toString("hex");
}
function getShardId(playerId) {
    let hash = 0;
    for (let i = 0; i < playerId.length; i++) {
        hash = (hash * 31 + playerId.charCodeAt(i)) | 0;
    }
    return Math.abs(hash) % NUM_SHARDS;
}
// --- Create Session ---
exports.createSession = (0, https_1.onCall)(FUNCTION_CONFIG, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Must be logged in");
    }
    const { quizId } = request.data;
    if (!quizId) {
        throw new https_1.HttpsError("invalid-argument", "quizId is required");
    }
    const quizDoc = await db.doc(`quizzes/${quizId}`).get();
    if (!quizDoc.exists) {
        throw new https_1.HttpsError("not-found", "Quiz not found");
    }
    if (quizDoc.data()?.ownerId !== request.auth.uid) {
        throw new https_1.HttpsError("permission-denied", "Not your quiz");
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
        startedAt: null,
        endedAt: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    for (let i = 0; i < NUM_SHARDS; i++) {
        const shardRef = db.doc(`sessions/${sessionRef.id}/leaderboard_shards/${i}`);
        batch.set(shardRef, { players: {} });
    }
    await batch.commit();
    return { sessionId: sessionRef.id };
});
// --- Join Session ---
exports.joinSession = (0, https_1.onCall)(FUNCTION_CONFIG, async (request) => {
    const { sessionId, nickname } = request.data;
    if (!sessionId || !nickname) {
        throw new https_1.HttpsError("invalid-argument", "sessionId and nickname are required");
    }
    if (nickname.length > 20) {
        throw new https_1.HttpsError("invalid-argument", "Nickname too long");
    }
    const sessionDoc = await db.doc(`sessions/${sessionId}`).get();
    if (!sessionDoc.exists) {
        throw new https_1.HttpsError("not-found", "Session not found");
    }
    const session = sessionDoc.data();
    if (session.status === "ended") {
        throw new https_1.HttpsError("failed-precondition", "Session has ended");
    }
    if (session.joinLocked) {
        throw new https_1.HttpsError("failed-precondition", "Session is locked");
    }
    // Check nickname uniqueness
    const existing = await db
        .collection(`sessions/${sessionId}/players`)
        .where("nickname", "==", nickname)
        .get();
    if (!existing.empty) {
        throw new https_1.HttpsError("already-exists", "Nickname already taken");
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
exports.startQuestion = (0, https_1.onCall)(FUNCTION_CONFIG, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Must be logged in");
    }
    const { sessionId, qIndex } = request.data;
    const sessionDoc = await db.doc(`sessions/${sessionId}`).get();
    if (!sessionDoc.exists) {
        throw new https_1.HttpsError("not-found", "Session not found");
    }
    const session = sessionDoc.data();
    if (session.hostId !== request.auth.uid) {
        throw new https_1.HttpsError("permission-denied", "Not the host");
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
exports.scoreAnswer = (0, https_1.onCall)(FUNCTION_CONFIG, async (request) => {
    const { sessionId, questionId, playerId, selection, timeMs, activeToken } = request.data;
    // Validate session is live
    const sessionDoc = await db.doc(`sessions/${sessionId}`).get();
    if (!sessionDoc.exists || sessionDoc.data()?.questionState !== "live") {
        throw new https_1.HttpsError("failed-precondition", "Question is not currently live");
    }
    // Validate session token (anti-cheat)
    if (activeToken) {
        const playerDoc = await db
            .doc(`sessions/${sessionId}/players/${playerId}`)
            .get();
        if (!playerDoc.exists || playerDoc.data()?.activeToken !== activeToken) {
            throw new https_1.HttpsError("permission-denied", "Invalid session token");
        }
    }
    // Prevent duplicate answers
    const answerId = `${questionId}_${playerId}`;
    const existingAnswer = await db
        .doc(`sessions/${sessionId}/answers/${answerId}`)
        .get();
    if (existingAnswer.exists) {
        throw new https_1.HttpsError("already-exists", "Already answered this question");
    }
    // Get question to check correctness
    const questionDoc = await db.doc(`questions/${questionId}`).get();
    if (!questionDoc.exists) {
        throw new https_1.HttpsError("not-found", "Question not found");
    }
    const question = questionDoc.data();
    // Type-aware correctness check
    let correct = false;
    if (question.type === 'matching') {
        try {
            const pairs = JSON.parse(selection);
            const options = question.options || [];
            const matchOpts = question.matchOptions || [];
            correct = options.length > 0 && options.every((left, idx) => pairs[left] === matchOpts[idx]);
        }
        catch {
            correct = false;
        }
    }
    else if (question.type === 'fill_blank') {
        try {
            const answers = JSON.parse(selection);
            const expected = question.correctAnswers || [];
            correct = answers.length === expected.length && answers.every((a, idx) => a.trim().toLowerCase() === expected[idx].trim().toLowerCase());
        }
        catch {
            correct = false;
        }
    }
    else {
        correct = question.correctAnswers.includes(selection);
    }
    // Read current player state from shard to compute streak
    const shardId = getShardId(playerId);
    const shardRef = db.doc(`sessions/${sessionId}/leaderboard_shards/${shardId}`);
    const shardSnap = await shardRef.get();
    const shardData = shardSnap.data() || { players: {} };
    const playerData = shardData.players[playerId] || {
        totalPoints: 0,
        streak: 0,
    };
    // Calculate points: base(1000) * timeRemaining% * correctness
    let pointsAwarded = 0;
    if (correct) {
        const timeFactor = Math.max(0, (question.timeLimitSec * 1000 - timeMs) / (question.timeLimitSec * 1000));
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
    batch.set(shardRef, {
        players: {
            [playerId]: {
                totalPoints: playerData.totalPoints + pointsAwarded,
                streak: correct ? playerData.streak + 1 : 0,
            },
        },
    }, { merge: true });
    await batch.commit();
    return { correct, pointsAwarded };
});
// --- End Question ---
exports.endQuestion = (0, https_1.onCall)(FUNCTION_CONFIG, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Must be logged in");
    }
    const { sessionId } = request.data;
    const sessionDoc = await db.doc(`sessions/${sessionId}`).get();
    if (!sessionDoc.exists) {
        throw new https_1.HttpsError("not-found", "Session not found");
    }
    const session = sessionDoc.data();
    if (session.hostId !== request.auth.uid) {
        throw new https_1.HttpsError("permission-denied", "Not the host");
    }
    // Aggregate leaderboard across all 10 shards
    const shardsSnap = await db
        .collection(`sessions/${sessionId}/leaderboard_shards`)
        .get();
    const allPlayers = [];
    shardsSnap.docs.forEach((shardDoc) => {
        const players = shardDoc.data().players || {};
        for (const [pid, data] of Object.entries(players)) {
            const pdata = data;
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
            if (data.correct)
                totalCorrect++;
            totalTime += data.timeMs || 0;
        });
    }
    await db
        .doc(`sessions/${sessionId}/analytics/${currentQuestionId || session.currentQuestionIndex}`)
        .set({
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
exports.exportCsv = (0, https_1.onCall)(FUNCTION_CONFIG, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Must be logged in");
    }
    const { sessionId } = request.data;
    const sessionDoc = await db.doc(`sessions/${sessionId}`).get();
    if (!sessionDoc.exists) {
        throw new https_1.HttpsError("not-found", "Session not found");
    }
    if (sessionDoc.data()?.hostId !== request.auth.uid) {
        throw new https_1.HttpsError("permission-denied", "Not the host");
    }
    const answersSnap = await db
        .collection(`sessions/${sessionId}/answers`)
        .get();
    const playersSnap = await db
        .collection(`sessions/${sessionId}/players`)
        .get();
    const playerMap = new Map();
    playersSnap.docs.forEach((d) => {
        playerMap.set(d.id, d.data().nickname);
    });
    const header = "sessionId,playerNickname,playerId,questionId,selection,correct,timeMs,pointsAwarded";
    const rows = answersSnap.docs.map((d) => {
        const a = d.data();
        const nickname = playerMap.get(a.playerId) || "Unknown";
        return `${sessionId},"${nickname}",${a.playerId},${a.questionId},"${a.selection}",${a.correct},${a.timeMs},${a.pointsAwarded}`;
    });
    return { csv: [header, ...rows].join("\n") };
});
// --- TTL Cleanup: delete sessions older than 24 hours ---
exports.cleanupExpiredSessions = (0, scheduler_1.onSchedule)({
    schedule: "every 6 hours",
    region: REGION,
    memory: "512MiB",
}, async () => {
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
});
//# sourceMappingURL=index.js.map