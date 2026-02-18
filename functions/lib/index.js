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
exports.cleanupExpiredSessions = exports.generateQuestions = exports.reportViolation = exports.exportCsv = exports.endQuestion = exports.scoreAnswer = exports.startQuestion = exports.joinSession = exports.createSession = void 0;
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
    memory: "256MiB",
    minInstances: 0,
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
        antiCheatEnabled: true,
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
    // Auto-assign team if team mode is enabled (round-robin)
    let teamIndex = null;
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
    // Generate question order on first question if shuffle is enabled
    const updateData = {
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
    const isPoll = question.type === 'poll';
    const isSlide = question.type === 'slide';
    if (isSlide) {
        // Slides don't have answers
        return { correct: false, pointsAwarded: 0, rank: 0, totalPoints: 0, behindBy: 0 };
    }
    else if (isPoll) {
        // Polls accept any answer, no scoring
        correct = true;
    }
    else if (question.type === 'ordering') {
        try {
            const submitted = JSON.parse(selection);
            const expected = question.options || [];
            correct = submitted.length === expected.length &&
                submitted.every((item, idx) => item === expected[idx]);
        }
        catch {
            correct = false;
        }
    }
    else if (question.type === 'matching') {
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
    if (correct && !isPoll) {
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
    // Compute rank info for personal feedback
    const newTotalPoints = playerData.totalPoints + pointsAwarded;
    const allShards = await db
        .collection(`sessions/${sessionId}/leaderboard_shards`)
        .get();
    const ranked = [];
    allShards.docs.forEach((s) => {
        const pl = s.data().players || {};
        for (const [pid, d] of Object.entries(pl)) {
            const pd = d;
            ranked.push({ pid, pts: pid === playerId ? newTotalPoints : pd.totalPoints });
        }
    });
    ranked.sort((a, b) => b.pts - a.pts);
    const rank = ranked.findIndex((p) => p.pid === playerId) + 1;
    const behindBy = rank > 1 ? ranked[rank - 2].pts - newTotalPoints : 0;
    return { correct, pointsAwarded, rank, totalPoints: newTotalPoints, behindBy };
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
    // Compute team scores if team mode is enabled
    let teamScoreSnapshot = [];
    if (session.teamMode && session.teams) {
        const playersSnap = await db
            .collection(`sessions/${sessionId}/players`)
            .get();
        const playerTeams = new Map();
        playersSnap.docs.forEach((d) => {
            const data = d.data();
            if (data.teamIndex !== undefined) {
                playerTeams.set(d.id, data.teamIndex);
            }
        });
        const teamTotals = session.teams.map(() => ({ total: 0, count: 0 }));
        allPlayers.forEach((p) => {
            const ti = playerTeams.get(p.playerId);
            if (ti !== undefined && teamTotals[ti]) {
                teamTotals[ti].total += p.totalPoints;
                teamTotals[ti].count++;
            }
        });
        teamScoreSnapshot = session.teams.map((t, i) => ({
            teamIndex: i,
            name: t.name,
            color: t.color,
            avgPoints: teamTotals[i].count > 0
                ? Math.round(teamTotals[i].total / teamTotals[i].count)
                : 0,
        }));
        teamScoreSnapshot.sort((a, b) => b.avgPoints - a.avgPoints);
    }
    await sessionDoc.ref.update({
        questionState: "reveal",
        top10Snapshot: top10,
        ...(teamScoreSnapshot.length > 0 ? { teamScoreSnapshot } : {}),
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
// --- Report Violation (Anti-Cheat) ---
exports.reportViolation = (0, https_1.onCall)(FUNCTION_CONFIG, async (request) => {
    const { sessionId, playerId, type } = request.data;
    if (!sessionId || !playerId || !type) {
        throw new https_1.HttpsError("invalid-argument", "sessionId, playerId, and type are required");
    }
    const validTypes = ["tab_hidden", "window_blur", "paste_attempt"];
    if (!validTypes.includes(type)) {
        throw new https_1.HttpsError("invalid-argument", "Invalid violation type");
    }
    const sessionDoc = await db.doc(`sessions/${sessionId}`).get();
    if (!sessionDoc.exists) {
        throw new https_1.HttpsError("not-found", "Session not found");
    }
    if (sessionDoc.data()?.status === "ended") {
        throw new https_1.HttpsError("failed-precondition", "Session has ended");
    }
    if (sessionDoc.data()?.antiCheatEnabled === false) {
        return { success: false, reason: "Anti-cheat is disabled" };
    }
    const playerDoc = await db.doc(`sessions/${sessionId}/players/${playerId}`).get();
    if (!playerDoc.exists) {
        throw new https_1.HttpsError("not-found", "Player not found in session");
    }
    const nickname = playerDoc.data()?.nickname || "Unknown";
    const violationRef = db.doc(`sessions/${sessionId}/violations/${playerId}`);
    await violationRef.set({
        playerId,
        nickname,
        totalViolations: admin.firestore.FieldValue.increment(1),
        events: admin.firestore.FieldValue.arrayUnion({
            type,
            timestamp: Date.now(),
        }),
    }, { merge: true });
    return { success: true };
});
// --- AI Question Generator ---
exports.generateQuestions = (0, https_1.onCall)({ ...FUNCTION_CONFIG, memory: "512MiB" }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Must be logged in");
    }
    const { topic, count = 5, questionType = "mcq", description = "", difficulty = "mixed", generateMeta = false, } = request.data;
    if (!topic || topic.trim().length < 3) {
        throw new https_1.HttpsError("invalid-argument", "Topic must be at least 3 characters");
    }
    const clampedCount = Math.min(Math.max(count, 1), 10);
    const apiKey = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
        // Fallback: generate template questions without AI
        const fallbackQuestion = (i) => {
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
    const typeTemplates = {
        mcq: '{"text":"...","options":["A","B","C","D"],"correctAnswers":["A"],"timeLimitSec":20}',
        tf: '{"text":"...","options":["True","False"],"correctAnswers":["True"],"timeLimitSec":15}',
        short: '{"text":"...","options":[],"correctAnswers":["answer"],"timeLimitSec":30}',
        matching: '{"text":"Match the following","options":["left1","left2","left3"],"matchOptions":["right1","right2","right3"],"correctAnswers":["left1","left2","left3"],"timeLimitSec":30}',
        ordering: '{"text":"Put these in order","options":["first","second","third","fourth"],"correctAnswers":["first","second","third","fourth"],"timeLimitSec":30}',
        fill_blank: '{"text":"The ___ is the powerhouse of the ___","options":[],"correctAnswers":["mitochondria","cell"],"timeLimitSec":25}',
    };
    const metaInstruction = generateMeta
        ? 'Return ONLY valid JSON: {"title":"...","description":"...","questions":[...]}'
        : "Return ONLY a valid JSON array. Each element:";
    const isAnthropic = !!process.env.ANTHROPIC_API_KEY;
    const prompt = `Generate ${clampedCount} quiz questions about "${topic}".
${description ? `Context: ${description}` : ""}
Difficulty: ${difficulty}.
Question type: ${questionType}.

${metaInstruction}
${typeTemplates[questionType] || typeTemplates.mcq}
Make questions educational, varied in difficulty, and factually accurate.`;
    try {
        let responseText = "";
        if (isAnthropic) {
            const res = await fetch("https://api.anthropic.com/v1/messages", {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
                body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 4096, messages: [{ role: "user", content: prompt }] }),
            });
            const data = await res.json();
            responseText = data.content?.[0]?.text || "[]";
        }
        else {
            const res = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
                body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: prompt }], max_tokens: 4096 }),
            });
            const data = await res.json();
            responseText = data.choices?.[0]?.message?.content || "[]";
        }
        let questions;
        let title;
        let desc;
        if (generateMeta) {
            // Try to parse as { title, description, questions }
            const objMatch = responseText.match(/\{[\s\S]*\}/);
            if (!objMatch)
                throw new https_1.HttpsError("internal", "Failed to parse AI response");
            const parsed = JSON.parse(objMatch[0]);
            title = parsed.title;
            desc = parsed.description;
            questions = Array.isArray(parsed.questions) ? parsed.questions : [];
        }
        else {
            const jsonMatch = responseText.match(/\[[\s\S]*\]/);
            if (!jsonMatch)
                throw new https_1.HttpsError("internal", "Failed to parse AI response");
            questions = JSON.parse(jsonMatch[0]);
        }
        const mapped = questions.map((q) => ({
            type: questionType,
            text: q.text || "",
            options: q.options || [],
            ...(q.matchOptions ? { matchOptions: q.matchOptions } : {}),
            correctAnswers: q.correctAnswers || [],
            timeLimitSec: q.timeLimitSec || 20,
        }));
        return {
            questions: mapped,
            ...(generateMeta ? { title, description: desc } : {}),
        };
    }
    catch (err) {
        if (err instanceof https_1.HttpsError)
            throw err;
        throw new https_1.HttpsError("internal", "AI generation failed");
    }
});
// --- TTL Cleanup: delete sessions older than 24 hours ---
exports.cleanupExpiredSessions = (0, scheduler_1.onSchedule)({
    schedule: "every 6 hours",
    region: REGION,
    memory: "256MiB",
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