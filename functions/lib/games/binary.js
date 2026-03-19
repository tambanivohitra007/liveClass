"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function generateBinaryRounds(config, roundCount, timeLimitSec) {
    const difficulty = config.difficulty || "8bit";
    const conversionTypes = config.conversionTypes || ["dec2bin", "bin2dec"];
    const bits = difficulty === "4bit" ? 4 : 8;
    const maxVal = bits === 4 ? 15 : 255;
    const rounds = [];
    for (let i = 0; i < roundCount; i++) {
        const type = conversionTypes[i % conversionTypes.length];
        const value = Math.floor(Math.random() * (maxVal + 1));
        const binStr = value.toString(2).padStart(bits, "0");
        const hexStr = value.toString(16).toUpperCase().padStart(bits / 4, "0");
        const decStr = value.toString(10);
        let prompt;
        let answer;
        switch (type) {
            case "dec2bin":
                prompt = decStr;
                answer = binStr;
                break;
            case "bin2dec":
                prompt = binStr;
                answer = decStr;
                break;
            case "dec2hex":
                prompt = decStr;
                answer = hexStr;
                break;
            case "hex2dec":
                prompt = hexStr;
                answer = decStr;
                break;
            case "hex2bin":
                prompt = hexStr;
                answer = binStr;
                break;
            case "bin2hex":
                prompt = binStr;
                answer = hexStr;
                break;
            default:
                prompt = decStr;
                answer = binStr;
        }
        rounds.push({
            type,
            prompt,
            answer,
            timeLimitSec,
            meta: { bits },
        });
    }
    return rounds;
}
function checkBinaryAnswer(submission, round) {
    const sub = submission.toUpperCase().replace(/^0+/, "");
    const ans = round.answer.toUpperCase().replace(/^0+/, "");
    return sub === ans || submission.toUpperCase() === round.answer.toUpperCase();
}
function validateConfig(config) {
    const types = config.conversionTypes;
    if (!Array.isArray(types) || types.length === 0) {
        throw new Error("At least one conversion type is required");
    }
    const difficulty = config.difficulty;
    if (difficulty !== "4bit" && difficulty !== "8bit") {
        throw new Error("Difficulty must be 4bit or 8bit");
    }
}
const binaryModule = {
    generateRounds: generateBinaryRounds,
    checkAnswer: checkBinaryAnswer,
    validateConfig,
};
exports.default = binaryModule;
//# sourceMappingURL=binary.js.map