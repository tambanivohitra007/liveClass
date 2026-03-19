import { GameModuleServer, GameRound } from "./types";

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function generateRounds(config: Record<string, unknown>, roundCount: number, timeLimitSec: number): GameRound[] {
  const types = (config.conversionTypes as string[]) || ["frac2dec", "dec2frac", "frac2pct", "pct2frac"];
  const rounds: GameRound[] = [];

  const fractions: [number, number][] = [
    [1,2],[1,3],[2,3],[1,4],[3,4],[1,5],[2,5],[3,5],[4,5],
    [1,6],[5,6],[1,8],[3,8],[5,8],[7,8],[1,10],[3,10],[7,10],[9,10],
    [1,20],[1,25],[1,50],[1,100],[2,3],[5,6],[7,8],[11,20],
  ];

  for (let i = 0; i < roundCount; i++) {
    const type = types[i % types.length];
    const [num, den] = fractions[Math.floor(Math.random() * fractions.length)];
    const decimal = +(num / den).toFixed(4);
    const pct = +(decimal * 100).toFixed(2);
    const g = gcd(num, den);
    const simplified = `${num / g}/${den / g}`;

    let prompt: string;
    let answer: string;

    switch (type) {
      case "frac2dec":
        prompt = `${num}/${den}`;
        answer = String(decimal % 1 === 0 ? decimal : parseFloat(decimal.toFixed(4)));
        break;
      case "dec2frac":
        prompt = String(decimal);
        answer = simplified;
        break;
      case "frac2pct":
        prompt = `${num}/${den}`;
        answer = pct % 1 === 0 ? String(pct) : String(parseFloat(pct.toFixed(2)));
        break;
      case "pct2frac":
        prompt = `${pct}%`;
        answer = simplified;
        break;
      default:
        prompt = `${num}/${den}`;
        answer = String(decimal);
    }

    rounds.push({
      type,
      prompt,
      answer,
      timeLimitSec,
      meta: { num, den, decimal, pct },
    });
  }
  return rounds;
}

function checkAnswer(submission: string, round: GameRound): boolean {
  const sub = submission.trim();
  const ans = round.answer;

  // Direct match
  if (sub === ans) return true;

  // Numeric comparison (for decimals/percentages)
  if (!isNaN(Number(sub)) && !isNaN(Number(ans))) {
    return Math.abs(Number(sub) - Number(ans)) < 0.01;
  }

  // Fraction comparison: compare as decimals
  if (sub.includes("/") && ans.includes("/")) {
    const [sn, sd] = sub.split("/").map(Number);
    const [an, ad] = ans.split("/").map(Number);
    if (sd && ad) return Math.abs(sn / sd - an / ad) < 0.001;
  }

  // Allow "0.5" for "1/2" type answers
  if (sub.includes("/")) {
    const [sn, sd] = sub.split("/").map(Number);
    if (sd) return Math.abs(sn / sd - Number(ans)) < 0.001;
  }
  if (ans.includes("/")) {
    const [an, ad] = ans.split("/").map(Number);
    if (ad) return Math.abs(Number(sub) - an / ad) < 0.001;
  }

  return false;
}

const fractionFighterModule: GameModuleServer = {
  generateRounds,
  checkAnswer,
};

export default fractionFighterModule;
