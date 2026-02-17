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
exports.exportCsv = exports.endQuestion = exports.scoreAnswer = exports.startQuestion = exports.joinSession = exports.createSession = void 0;
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
admin.initializeApp();
const db = admin.firestore();
const REGION = "asia-southeast1";
function generatePin() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}
// --- Create Session ---
exports.createSession = (0, https_1.onCall)({ region: REGION }, async (request) => {
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
exports.joinSession = (0, https_1.onCall)({ region: REGION }, async (request) => {
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
exports.startQuestion = (0, https_1.onCall)({ region: REGION }, async (request) => {
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
exports.scoreAnswer = (0, https_1.onCall)({ region: REGION }, async (request) => {
    const { sessionId, questionId, playerId, selection, timeMs } = request.data;
    // Validate session is live
    const sessionDoc = await db.doc(`sessions/${sessionId}`).get();
    if (!sessionDoc.exists || sessionDoc.data()?.questionState !== "live") {
        throw new https_1.HttpsError("failed-precondition", "Question is not currently live");
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
    const correct = question.correctAnswers.includes(selection);
    // Calculate points: base(1000) * timeRemaining% * correctness
    let pointsAwarded = 0;
    if (correct) {
        const timeFactor = Math.max(0, (question.timeLimitSec * 1000 - timeMs) / (question.timeLimitSec * 1000));
        pointsAwarded = Math.round(1000 * timeFactor);
        // Check streak for bonus
        const leaderboardDoc = await db
            .doc(`sessions/${sessionId}/leaderboard_shards/${playerId}`)
            .get();
        if (leaderboardDoc.exists) {
            const streak = (leaderboardDoc.data()?.streak || 0) + 1;
            pointsAwarded += streak * 50;
        }
        else {
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
    const shardRef = db.doc(`sessions/${sessionId}/leaderboard_shards/${playerId}`);
    const shard = await shardRef.get();
    if (shard.exists) {
        await shardRef.update({
            totalPoints: admin.firestore.FieldValue.increment(pointsAwarded),
            streak: correct ? admin.firestore.FieldValue.increment(1) : 0,
        });
    }
    else {
        await shardRef.set({
            playerId,
            totalPoints: pointsAwarded,
            streak: correct ? 1 : 0,
        });
    }
    return { correct, pointsAwarded };
});
// --- End Question ---
exports.endQuestion = (0, https_1.onCall)({ region: REGION }, async (request) => {
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
    const questionId = `q${session.currentQuestionIndex}` || session.currentQuestionIndex;
    let totalCorrect = 0;
    let totalTime = 0;
    let totalAnswers = 0;
    answersSnap.docs.forEach((d) => {
        const data = d.data();
        totalAnswers++;
        if (data.correct)
            totalCorrect++;
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
exports.exportCsv = (0, https_1.onCall)({ region: REGION }, async (request) => {
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
    // Get all answers
    const answersSnap = await db
        .collection(`sessions/${sessionId}/answers`)
        .get();
    // Get all players for nickname lookup
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
//# sourceMappingURL=index.js.map