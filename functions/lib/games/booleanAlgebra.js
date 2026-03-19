"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function generateExpressions() {
    const exprs = [];
    const ops = ["AND", "OR"];
    // Simple: A OP B
    for (const a of [0, 1]) {
        for (const b of [0, 1]) {
            for (const op of ops) {
                const result = op === "AND" ? a & b : a | b;
                exprs.push({ expr: `${a} ${op} ${b}`, result: String(result) });
            }
            exprs.push({ expr: `${a} XOR ${b}`, result: String(a ^ b) });
        }
        exprs.push({ expr: `NOT ${a}`, result: String(a === 0 ? 1 : 0) });
    }
    // Compound: NOT (A OP B), A OP (B OP C)
    for (const a of [0, 1]) {
        for (const b of [0, 1]) {
            for (const op of ops) {
                const r = op === "AND" ? a & b : a | b;
                exprs.push({ expr: `NOT (${a} ${op} ${b})`, result: String(r === 1 ? 0 : 1) });
            }
            for (const c of [0, 1]) {
                exprs.push({ expr: `(${a} AND ${b}) OR ${c}`, result: String((a & b) | c) });
                exprs.push({ expr: `(${a} OR ${b}) AND ${c}`, result: String((a | b) & c) });
                exprs.push({ expr: `${a} AND (${b} OR ${c})`, result: String(a & (b | c)) });
            }
        }
    }
    return exprs;
}
const ALL_EXPRS = generateExpressions();
function generateRounds(config, roundCount, timeLimitSec) {
    const difficulty = config.difficulty || "mixed";
    let pool = ALL_EXPRS;
    if (difficulty === "simple")
        pool = pool.filter((e) => !e.expr.includes("("));
    else if (difficulty === "compound")
        pool = pool.filter((e) => e.expr.includes("("));
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    const rounds = [];
    for (let i = 0; i < roundCount; i++) {
        const item = shuffled[i % shuffled.length];
        rounds.push({
            type: difficulty,
            prompt: item.expr,
            answer: item.result,
            timeLimitSec,
            meta: { inputType: "toggle_single" },
        });
    }
    return rounds;
}
function checkAnswer(submission, round) {
    return submission.trim() === round.answer;
}
const booleanAlgebraModule = {
    generateRounds: generateRounds,
    checkAnswer,
};
exports.default = booleanAlgebraModule;
//# sourceMappingURL=booleanAlgebra.js.map