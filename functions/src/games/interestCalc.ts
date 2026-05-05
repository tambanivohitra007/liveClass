import { GameModuleServer, GameRound } from "./types";

function generateRounds(config: Record<string, unknown>, roundCount: number, timeLimitSec: number): GameRound[] {
  const type = (config.type as string) || "both";
  const difficulty = (config.difficulty as string) || "easy";
  const rounds: GameRound[] = [];
  const types = type === "both" ? ["simple", "compound"] : [type];

  for (let i = 0; i < roundCount; i++) {
    const qType = types[Math.floor(Math.random() * types.length)];

    let P: number, R: number, T: number;
    if (difficulty === "easy") {
      P = (Math.floor(Math.random() * 10) + 1) * 100; // 100-1000
      R = (Math.floor(Math.random() * 10) + 1) * 2;    // 2-20%
      T = Math.floor(Math.random() * 5) + 1;            // 1-5 years
    } else {
      P = (Math.floor(Math.random() * 50) + 1) * 100;  // 100-5000
      R = Math.floor(Math.random() * 15) + 1;           // 1-15%
      T = Math.floor(Math.random() * 10) + 1;           // 1-10 years
    }

    let prompt: string, answer: number;

    if (qType === "simple") {
      const interest = (P * R * T) / 100;
      prompt = `Simple Interest: P=$${P}, R=${R}%, T=${T} yr. Find the interest.`;
      answer = interest;
    } else {
      // Compound interest: A = P(1 + R/100)^T
      const amount = P * Math.pow(1 + R / 100, T);
      answer = Math.round(amount * 100) / 100;
      prompt = `Compound Amount: P=$${P}, R=${R}%, T=${T} yr. Find the total amount.`;
    }

    rounds.push({
      type: qType,
      prompt,
      answer: String(answer),
      timeLimitSec,
      meta: { principal: P, rate: R, time: T, calcType: qType },
    });
  }
  return rounds;
}

function checkAnswer(submission: string, round: GameRound): boolean {
  const sub = parseFloat(submission.trim());
  const ans = parseFloat(round.answer);
  if (isNaN(sub)) return false;
  // Allow rounding tolerance for compound interest
  return Math.abs(sub - ans) < 0.5;
}

const interestCalcModule: GameModuleServer = {
  generateRounds,
  checkAnswer,
  validateConfig(config) {
    const t = config.type as string | undefined;
    if (t && !["simple", "compound", "both"].includes(t)) throw new Error("Invalid type");
  },
};

export default interestCalcModule;
