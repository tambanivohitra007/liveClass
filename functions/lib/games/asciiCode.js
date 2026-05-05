"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const PRINTABLE_CHARS = Array.from({ length: 95 }, (_, i) => ({
    char: String.fromCharCode(32 + i),
    code: 32 + i,
    label: 32 + i === 32 ? "SPACE" : String.fromCharCode(32 + i),
}));
// Common/interesting subset for easier mode
const COMMON_CHARS = PRINTABLE_CHARS.filter((c) => (c.code >= 48 && c.code <= 57) || // 0-9
    (c.code >= 65 && c.code <= 90) || // A-Z
    (c.code >= 97 && c.code <= 122) || // a-z
    [32, 33, 35, 42, 43, 45, 46, 48, 64].includes(c.code) // SPACE ! # * + - . 0 @
);
function generateRounds(config, roundCount, timeLimitSec) {
    const direction = config.direction || "both";
    const difficulty = config.difficulty || "common";
    const pool = difficulty === "all" ? PRINTABLE_CHARS : COMMON_CHARS;
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    const rounds = [];
    for (let i = 0; i < roundCount; i++) {
        const item = shuffled[i % shuffled.length];
        let type;
        if (direction === "char2code")
            type = "char2code";
        else if (direction === "code2char")
            type = "code2char";
        else
            type = Math.random() > 0.5 ? "char2code" : "code2char";
        rounds.push({
            type,
            prompt: type === "char2code" ? item.label : String(item.code),
            answer: type === "char2code" ? String(item.code) : item.label,
            timeLimitSec,
            meta: { char: item.label, code: item.code },
        });
    }
    return rounds;
}
function checkAnswer(submission, round) {
    if (round.type === "char2code") {
        return submission.trim() === round.answer;
    }
    // code2char: exact match (case-sensitive for letters)
    const sub = submission.trim();
    if (sub.toUpperCase() === "SPACE" && round.answer === "SPACE")
        return true;
    return sub === round.answer || sub.toUpperCase() === round.answer.toUpperCase();
}
const asciiCodeModule = {
    generateRounds: generateRounds,
    checkAnswer,
};
exports.default = asciiCodeModule;
//# sourceMappingURL=asciiCode.js.map