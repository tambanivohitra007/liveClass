"use strict";
/**
 * Pure logic functions extracted from index.ts for testability.
 * No Firebase dependencies — safe to import in unit tests.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkCorrectness = checkCorrectness;
exports.generatePin = generatePin;
exports.getShardId = getShardId;
exports.calculatePoints = calculatePoints;
exports.validateNickname = validateNickname;
/** Check if a student's answer is correct based on question type */
function checkCorrectness(selection, question) {
    const isPoll = question.type === "poll";
    const isSlide = question.type === "slide";
    if (isSlide)
        return false;
    if (isPoll)
        return true;
    if (question.type === "ordering") {
        try {
            const submitted = JSON.parse(selection);
            const expected = question.options || [];
            return submitted.length === expected.length &&
                submitted.every((item, idx) => item === expected[idx]);
        }
        catch {
            return false;
        }
    }
    if (question.type === "matching") {
        try {
            const pairs = JSON.parse(selection);
            const options = question.options || [];
            const matchOpts = question.matchOptions || [];
            return options.length > 0 && options.every((left, idx) => pairs[left] === matchOpts[idx]);
        }
        catch {
            return false;
        }
    }
    if (question.type === "fill_blank") {
        try {
            const answers = JSON.parse(selection);
            const expected = question.correctAnswers || [];
            return answers.length === expected.length && answers.every((a, idx) => a.trim().toLowerCase() === expected[idx].trim().toLowerCase());
        }
        catch {
            return false;
        }
    }
    if (question.type === "mcq" && question.correctAnswers && question.correctAnswers.length > 1) {
        try {
            const chosen = JSON.parse(selection);
            const expected = question.correctAnswers;
            return chosen.length === expected.length &&
                chosen.every((c) => expected.includes(c)) &&
                expected.every((e) => chosen.includes(e));
        }
        catch {
            return false;
        }
    }
    if (question.type === "code_output") {
        const expected = question.correctAnswers || [];
        return expected.some((a) => a.trim().toLowerCase() === selection.trim().toLowerCase());
    }
    // Default: mcq, tf
    return (question.correctAnswers || []).includes(selection);
}
/** Generate a 6-digit PIN code */
function generatePin() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}
/** Get leaderboard shard ID for a player (0 to NUM_SHARDS-1) */
function getShardId(playerId, numShards = 10) {
    let hash = 0;
    for (let i = 0; i < playerId.length; i++) {
        hash = (hash * 31 + playerId.charCodeAt(i)) | 0;
    }
    return Math.abs(hash) % numShards;
}
/** Calculate points for a correct answer based on time remaining */
function calculatePoints(timeLimitSec, timeMs, currentStreak) {
    const timeFactor = Math.max(0, (timeLimitSec * 1000 - timeMs) / (timeLimitSec * 1000));
    let pointsAwarded = Math.round(1000 * timeFactor);
    const newStreak = currentStreak + 1;
    pointsAwarded += newStreak * 50;
    return { pointsAwarded, newStreak };
}
/** Validate nickname (length, non-empty) */
function validateNickname(nickname) {
    if (!nickname || nickname.trim().length === 0) {
        return { valid: false, error: "Nickname is required" };
    }
    if (nickname.length > 20) {
        return { valid: false, error: "Nickname too long" };
    }
    return { valid: true };
}
//# sourceMappingURL=logic.js.map