import { GameModuleServer, GameRound } from "./types";

function generateRounds(config: Record<string, unknown>, roundCount: number, timeLimitSec: number): GameRound[] {
  const difficulty = (config.difficulty as string) || "medium";
  const rounds: GameRound[] = [];

  for (let i = 0; i < roundCount; i++) {
    let prompt: string, answer: number;

    if (difficulty === "easy") {
      // ax + b = c  =>  x = (c - b) / a
      const a = Math.floor(Math.random() * 9) + 2; // 2-10
      const x = Math.floor(Math.random() * 21) - 10; // -10 to 10
      const b = Math.floor(Math.random() * 21) - 10;
      const c = a * x + b;
      prompt = `Solve for x: ${a}x ${b >= 0 ? "+ " + b : "- " + Math.abs(b)} = ${c}`;
      answer = x;
    } else if (difficulty === "medium") {
      // ax + b = cx + d  =>  x = (d - b) / (a - c)
      let a: number, cCoeff: number;
      do {
        a = Math.floor(Math.random() * 9) + 2;
        cCoeff = Math.floor(Math.random() * 9) + 1;
      } while (a === cCoeff);
      const x = Math.floor(Math.random() * 21) - 10;
      const b = Math.floor(Math.random() * 21) - 10;
      const d = a * x + b - cCoeff * x;
      const fmtLeft = `${a}x ${b >= 0 ? "+ " + b : "- " + Math.abs(b)}`;
      const fmtRight = `${cCoeff}x ${d >= 0 ? "+ " + d : "- " + Math.abs(d)}`;
      prompt = `Solve for x: ${fmtLeft} = ${fmtRight}`;
      answer = x;
    } else {
      // Hard: fractions like (ax + b) / d = c  =>  x = (c*d - b) / a
      const a = Math.floor(Math.random() * 5) + 2;
      const x = Math.floor(Math.random() * 21) - 10;
      const b = Math.floor(Math.random() * 21) - 10;
      const d = Math.floor(Math.random() * 4) + 2; // divisor 2-5
      const numerator = a * x + b;
      const c = numerator / d;
      // Ensure clean answer
      if (!Number.isInteger(c)) {
        // Retry with clean values
        const cleanX = Math.floor(Math.random() * 11) - 5;
        const cleanB = 0;
        const cleanNum = a * cleanX + cleanB;
        const cleanC = cleanNum / d;
        if (Number.isInteger(cleanC)) {
          prompt = `Solve for x: (${a}x) / ${d} = ${cleanC}`;
          answer = cleanX;
        } else {
          // Fallback to easy format
          const fb = Math.floor(Math.random() * 21) - 10;
          const fc = a * cleanX + fb;
          prompt = `Solve for x: ${a}x ${fb >= 0 ? "+ " + fb : "- " + Math.abs(fb)} = ${fc}`;
          answer = cleanX;
        }
      } else {
        prompt = `Solve for x: (${a}x ${b >= 0 ? "+ " + b : "- " + Math.abs(b)}) / ${d} = ${c}`;
        answer = x;
      }
    }

    rounds.push({
      type: difficulty,
      prompt,
      answer: String(answer),
      timeLimitSec,
      meta: { difficulty },
    });
  }
  return rounds;
}

function checkAnswer(submission: string, round: GameRound): boolean {
  const sub = parseFloat(submission.trim());
  const ans = parseFloat(round.answer);
  if (isNaN(sub)) return false;
  return Math.abs(sub - ans) < 0.01;
}

const equationSolverModule: GameModuleServer = {
  generateRounds,
  checkAnswer,
  validateConfig(config) {
    const d = config.difficulty as string | undefined;
    if (d && !["easy", "medium", "hard"].includes(d)) throw new Error("Invalid difficulty");
  },
};

export default equationSolverModule;
