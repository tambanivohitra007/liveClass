import { GameModuleServer, GameRound } from "./types";

interface Conversion {
  from: string;
  to: string;
  factor: number;
  category: string;
}

const CONVERSIONS: Conversion[] = [
  // Data
  { from: "KB", to: "MB", factor: 1 / 1024, category: "data" },
  { from: "MB", to: "GB", factor: 1 / 1024, category: "data" },
  { from: "GB", to: "MB", factor: 1024, category: "data" },
  { from: "MB", to: "KB", factor: 1024, category: "data" },
  { from: "GB", to: "KB", factor: 1024 * 1024, category: "data" },
  { from: "KB", to: "GB", factor: 1 / (1024 * 1024), category: "data" },
  // Length
  { from: "mm", to: "cm", factor: 0.1, category: "length" },
  { from: "cm", to: "mm", factor: 10, category: "length" },
  { from: "cm", to: "m", factor: 0.01, category: "length" },
  { from: "m", to: "cm", factor: 100, category: "length" },
  { from: "m", to: "km", factor: 0.001, category: "length" },
  { from: "km", to: "m", factor: 1000, category: "length" },
  { from: "mm", to: "m", factor: 0.001, category: "length" },
  { from: "m", to: "mm", factor: 1000, category: "length" },
  // Mass
  { from: "g", to: "kg", factor: 0.001, category: "mass" },
  { from: "kg", to: "g", factor: 1000, category: "mass" },
  // Time
  { from: "ms", to: "s", factor: 0.001, category: "time" },
  { from: "s", to: "ms", factor: 1000, category: "time" },
  { from: "s", to: "min", factor: 1 / 60, category: "time" },
  { from: "min", to: "s", factor: 60, category: "time" },
  { from: "min", to: "hr", factor: 1 / 60, category: "time" },
  { from: "hr", to: "min", factor: 60, category: "time" },
  { from: "s", to: "hr", factor: 1 / 3600, category: "time" },
  { from: "hr", to: "s", factor: 3600, category: "time" },
];

function niceValue(conv: Conversion): number {
  // Generate values that produce clean answers
  if (conv.factor >= 1) {
    return Math.floor(Math.random() * 20) + 1;
  }
  // For shrinking conversions, use multiples that produce integers
  const inverse = Math.round(1 / conv.factor);
  return inverse * (Math.floor(Math.random() * 10) + 1);
}

function generateRounds(config: Record<string, unknown>, roundCount: number, timeLimitSec: number): GameRound[] {
  const categories = (config.categories as string[]) || ["data", "length", "mass", "time"];
  const filtered = CONVERSIONS.filter((c) => categories.includes(c.category));
  const rounds: GameRound[] = [];

  for (let i = 0; i < roundCount; i++) {
    const conv = filtered[Math.floor(Math.random() * filtered.length)];
    const value = niceValue(conv);
    const result = value * conv.factor;
    // Round to avoid floating point artifacts
    const answer = Number.isInteger(result) ? String(result) : String(parseFloat(result.toPrecision(10)));

    rounds.push({
      type: `${conv.from}2${conv.to}`,
      prompt: `Convert ${value} ${conv.from} to ${conv.to}`,
      answer,
      timeLimitSec,
      meta: { value, from: conv.from, to: conv.to, category: conv.category },
    });
  }
  return rounds;
}

function checkAnswer(submission: string, round: GameRound): boolean {
  const sub = parseFloat(submission.trim());
  const ans = parseFloat(round.answer);
  if (isNaN(sub)) return false;
  // Allow small floating point tolerance
  return Math.abs(sub - ans) < 0.001 || sub === ans;
}

const unitConverterModule: GameModuleServer = {
  generateRounds,
  checkAnswer,
  validateConfig(config) {
    const cats = config.categories as string[] | undefined;
    if (cats && cats.length === 0) throw new Error("Select at least one category");
  },
};

export default unitConverterModule;
