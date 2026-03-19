import { GameModuleServer, GameRound } from "./types";

type QType = "percent_of" | "what_percent" | "percent_of_what";

function generateRounds(config: Record<string, unknown>, roundCount: number, timeLimitSec: number): GameRound[] {
  const difficulty = (config.difficulty as string) || "medium";
  const rounds: GameRound[] = [];
  const types: QType[] = ["percent_of", "what_percent", "percent_of_what"];

  for (let i = 0; i < roundCount; i++) {
    const qType = types[Math.floor(Math.random() * types.length)];
    let prompt: string, answer: number;

    if (difficulty === "easy") {
      const percents = [10, 20, 25, 50, 75, 100];
      const p = percents[Math.floor(Math.random() * percents.length)];
      const base = (Math.floor(Math.random() * 20) + 1) * 10;

      switch (qType) {
        case "percent_of":
          prompt = `What is ${p}% of ${base}?`;
          answer = (p / 100) * base;
          break;
        case "what_percent":
          answer = p;
          prompt = `${(p / 100) * base} is what % of ${base}?`;
          break;
        case "percent_of_what":
          answer = base;
          prompt = `${(p / 100) * base} is ${p}% of what?`;
          break;
      }
    } else if (difficulty === "medium") {
      const p = (Math.floor(Math.random() * 19) + 1) * 5; // 5,10,...,95
      const base = (Math.floor(Math.random() * 50) + 1) * 10;

      switch (qType) {
        case "percent_of":
          prompt = `What is ${p}% of ${base}?`;
          answer = (p / 100) * base;
          break;
        case "what_percent":
          answer = p;
          prompt = `${(p / 100) * base} is what % of ${base}?`;
          break;
        case "percent_of_what":
          answer = base;
          prompt = `${(p / 100) * base} is ${p}% of what?`;
          break;
      }
    } else {
      // hard: arbitrary percentages
      const p = Math.floor(Math.random() * 99) + 1;
      const base = (Math.floor(Math.random() * 100) + 1) * 5;

      switch (qType) {
        case "percent_of":
          prompt = `What is ${p}% of ${base}?`;
          answer = (p / 100) * base;
          break;
        case "what_percent":
          answer = p;
          prompt = `${(p / 100) * base} is what % of ${base}?`;
          break;
        case "percent_of_what":
          answer = base;
          prompt = `${(p / 100) * base} is ${p}% of what?`;
          break;
      }
    }

    rounds.push({
      type: qType,
      prompt: prompt!,
      answer: String(answer!),
      timeLimitSec,
      meta: { questionType: qType },
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

const percentageProModule: GameModuleServer = {
  generateRounds,
  checkAnswer,
  validateConfig(config) {
    const d = config.difficulty as string | undefined;
    if (d && !["easy", "medium", "hard"].includes(d)) throw new Error("Invalid difficulty");
  },
};

export default percentageProModule;
