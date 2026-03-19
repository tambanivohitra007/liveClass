import { GameModuleServer, GameRound } from "./types";

type Gate = "AND" | "OR" | "NOT" | "XOR" | "NAND" | "NOR";

function evalGate(gate: Gate, a: number, b: number): number {
  switch (gate) {
    case "AND": return a & b;
    case "OR": return a | b;
    case "NOT": return a === 0 ? 1 : 0;
    case "XOR": return a ^ b;
    case "NAND": return (a & b) === 1 ? 0 : 1;
    case "NOR": return (a | b) === 1 ? 0 : 1;
  }
}

function generateRounds(config: Record<string, unknown>, roundCount: number, timeLimitSec: number): GameRound[] {
  const gates = (config.gates as string[]) || ["AND", "OR", "NOT", "XOR"];
  const difficulty = (config.difficulty as string) || "single";
  const rounds: GameRound[] = [];

  for (let i = 0; i < roundCount; i++) {
    const gate = gates[Math.floor(Math.random() * gates.length)] as Gate;
    const a = Math.round(Math.random());
    const b = Math.round(Math.random());

    if (difficulty === "chain" && gate !== "NOT") {
      // Two gates chained: (A gate1 B) gate2 C
      const gate2 = gates[Math.floor(Math.random() * gates.length)] as Gate;
      const c = Math.round(Math.random());
      const intermediate = evalGate(gate, a, b);
      const result = gate2 === "NOT" ? evalGate("NOT", intermediate, 0) : evalGate(gate2, intermediate, c);
      const prompt = gate2 === "NOT"
        ? `NOT (${a} ${gate} ${b})`
        : `(${a} ${gate} ${b}) ${gate2} ${c}`;

      rounds.push({
        type: "chain",
        prompt,
        answer: String(result),
        timeLimitSec,
        meta: { gates: [gate, gate2], inputs: [a, b, c], inputType: "toggle_single" },
      });
    } else {
      const result = evalGate(gate, a, b);
      const prompt = gate === "NOT" ? `NOT ${a}` : `${a} ${gate} ${b}`;

      rounds.push({
        type: "single",
        prompt,
        answer: String(result),
        timeLimitSec,
        meta: { gate, inputs: gate === "NOT" ? [a] : [a, b], inputType: "toggle_single" },
      });
    }
  }
  return rounds;
}

function checkAnswer(submission: string, round: GameRound): boolean {
  return submission.trim() === round.answer;
}

const logicGateModule: GameModuleServer = {
  generateRounds: generateRounds,
  checkAnswer,
  validateConfig(config) {
    const gates = config.gates as string[] | undefined;
    if (gates && gates.length === 0) throw new Error("Select at least one gate type");
  },
};

export default logicGateModule;
