import { GameModuleServer, GameRound } from "./types";

const BASE_NAMES: Record<string, string> = { "2": "Binary", "8": "Octal", "10": "Decimal", "16": "Hex" };
const BASE_PREFIXES: Record<string, string> = { "2": "0b", "8": "0o", "10": "", "16": "0x" };

function toBase(value: number, base: number): string {
  if (base === 16) return value.toString(16).toUpperCase();
  return value.toString(base);
}

function generateRounds(config: Record<string, unknown>, roundCount: number, timeLimitSec: number): GameRound[] {
  const bases = (config.bases as string[]) || ["2", "8", "10", "16"];
  const maxValue = (config.maxValue as number) || 255;
  const rounds: GameRound[] = [];

  for (let i = 0; i < roundCount; i++) {
    // Pick two different bases
    const shuffledBases = [...bases].sort(() => Math.random() - 0.5);
    const fromBase = shuffledBases[0];
    const toBaseKey = shuffledBases[1] || (fromBase === "10" ? "16" : "10");
    const value = Math.floor(Math.random() * (maxValue + 1));
    const fromStr = toBase(value, parseInt(fromBase));
    const toStr = toBase(value, parseInt(toBaseKey));

    rounds.push({
      type: `base${fromBase}to${toBaseKey}`,
      prompt: `${BASE_PREFIXES[fromBase]}${fromStr}`,
      answer: toStr.toUpperCase(),
      timeLimitSec,
      meta: {
        fromBase: parseInt(fromBase),
        toBase: parseInt(toBaseKey),
        fromName: BASE_NAMES[fromBase],
        toName: BASE_NAMES[toBaseKey],
        value,
      },
    });
  }
  return rounds;
}

function checkAnswer(submission: string, round: GameRound): boolean {
  // Strip common prefixes
  let sub = submission.trim().toUpperCase().replace(/^0[XBOB]+/i, "");
  let ans = round.answer.toUpperCase().replace(/^0[XBOB]+/i, "");
  // Remove leading zeros for comparison
  sub = sub.replace(/^0+/, "") || "0";
  ans = ans.replace(/^0+/, "") || "0";
  return sub === ans;
}

const baseConverterModule: GameModuleServer = {
  generateRounds: generateRounds,
  checkAnswer,
  validateConfig(config) {
    const bases = config.bases as string[] | undefined;
    if (bases && bases.length < 2) throw new Error("Select at least two bases");
  },
};

export default baseConverterModule;
