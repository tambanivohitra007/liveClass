import { GameModuleServer, GameRound } from "./types";

type Op = "+" | "-" | "×" | "÷";

function generateRounds(config: Record<string, unknown>, roundCount: number, timeLimitSec: number): GameRound[] {
  const operations = (config.operations as string[]) || ["+", "-", "×", "÷"];
  const difficulty = (config.difficulty as string) || "medium";
  const rounds: GameRound[] = [];

  const range = difficulty === "easy" ? 20 : difficulty === "medium" ? 100 : 999;

  for (let i = 0; i < roundCount; i++) {
    const op = operations[Math.floor(Math.random() * operations.length)] as Op;
    let a: number, b: number, answer: number;

    switch (op) {
      case "+":
        a = Math.floor(Math.random() * range) + 1;
        b = Math.floor(Math.random() * range) + 1;
        answer = a + b;
        break;
      case "-":
        a = Math.floor(Math.random() * range) + 1;
        b = Math.floor(Math.random() * a) + 1; // ensure positive result
        answer = a - b;
        break;
      case "×":
        a = Math.floor(Math.random() * (difficulty === "easy" ? 12 : difficulty === "medium" ? 20 : 50)) + 1;
        b = Math.floor(Math.random() * (difficulty === "easy" ? 12 : difficulty === "medium" ? 20 : 50)) + 1;
        answer = a * b;
        break;
      case "÷":
        b = Math.floor(Math.random() * (difficulty === "easy" ? 12 : difficulty === "medium" ? 20 : 50)) + 1;
        answer = Math.floor(Math.random() * (difficulty === "easy" ? 12 : difficulty === "medium" ? 20 : 50)) + 1;
        a = b * answer; // ensure clean division
        break;
      default:
        a = 1; b = 1; answer = 2;
    }

    rounds.push({
      type: op,
      prompt: `${a} ${op} ${b}`,
      answer: String(answer),
      timeLimitSec,
      meta: { a, b, operation: op },
    });
  }
  return rounds;
}

function checkAnswer(submission: string, round: GameRound): boolean {
  const sub = parseFloat(submission.trim());
  const ans = parseFloat(round.answer);
  return !isNaN(sub) && sub === ans;
}

const mentalMathModule: GameModuleServer = {
  generateRounds,
  checkAnswer,
  validateConfig(config) {
    const ops = config.operations as string[] | undefined;
    if (ops && ops.length === 0) throw new Error("Select at least one operation");
  },
};

export default mentalMathModule;
