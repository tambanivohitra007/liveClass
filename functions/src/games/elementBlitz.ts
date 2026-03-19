import { GameModuleServer, GameRound } from "./types";

interface Element {
  number: number;
  symbol: string;
  name: string;
}

const ELEMENTS: Element[] = [
  { number: 1, symbol: "H", name: "Hydrogen" },
  { number: 2, symbol: "He", name: "Helium" },
  { number: 3, symbol: "Li", name: "Lithium" },
  { number: 4, symbol: "Be", name: "Beryllium" },
  { number: 5, symbol: "B", name: "Boron" },
  { number: 6, symbol: "C", name: "Carbon" },
  { number: 7, symbol: "N", name: "Nitrogen" },
  { number: 8, symbol: "O", name: "Oxygen" },
  { number: 9, symbol: "F", name: "Fluorine" },
  { number: 10, symbol: "Ne", name: "Neon" },
  { number: 11, symbol: "Na", name: "Sodium" },
  { number: 12, symbol: "Mg", name: "Magnesium" },
  { number: 13, symbol: "Al", name: "Aluminum" },
  { number: 14, symbol: "Si", name: "Silicon" },
  { number: 15, symbol: "P", name: "Phosphorus" },
  { number: 16, symbol: "S", name: "Sulfur" },
  { number: 17, symbol: "Cl", name: "Chlorine" },
  { number: 18, symbol: "Ar", name: "Argon" },
  { number: 19, symbol: "K", name: "Potassium" },
  { number: 20, symbol: "Ca", name: "Calcium" },
  { number: 21, symbol: "Sc", name: "Scandium" },
  { number: 22, symbol: "Ti", name: "Titanium" },
  { number: 23, symbol: "V", name: "Vanadium" },
  { number: 24, symbol: "Cr", name: "Chromium" },
  { number: 25, symbol: "Mn", name: "Manganese" },
  { number: 26, symbol: "Fe", name: "Iron" },
  { number: 27, symbol: "Co", name: "Cobalt" },
  { number: 28, symbol: "Ni", name: "Nickel" },
  { number: 29, symbol: "Cu", name: "Copper" },
  { number: 30, symbol: "Zn", name: "Zinc" },
  { number: 31, symbol: "Ga", name: "Gallium" },
  { number: 32, symbol: "Ge", name: "Germanium" },
  { number: 33, symbol: "As", name: "Arsenic" },
  { number: 34, symbol: "Se", name: "Selenium" },
  { number: 35, symbol: "Br", name: "Bromine" },
  { number: 36, symbol: "Kr", name: "Krypton" },
];

type Direction = "name2symbol" | "symbol2name" | "name2number" | "number2name";

function generateRounds(config: Record<string, unknown>, roundCount: number, timeLimitSec: number): GameRound[] {
  const directions = (config.directions as string[]) || ["name2symbol", "symbol2name"];
  const rounds: GameRound[] = [];

  for (let i = 0; i < roundCount; i++) {
    const dir = directions[Math.floor(Math.random() * directions.length)] as Direction;
    const el = ELEMENTS[Math.floor(Math.random() * ELEMENTS.length)];
    let prompt: string, answer: string;

    switch (dir) {
      case "name2symbol":
        prompt = `What is the symbol for ${el.name}?`;
        answer = el.symbol;
        break;
      case "symbol2name":
        prompt = `What element has the symbol ${el.symbol}?`;
        answer = el.name;
        break;
      case "name2number":
        prompt = `What is the atomic number of ${el.name}?`;
        answer = String(el.number);
        break;
      case "number2name":
        prompt = `What element has atomic number ${el.number}?`;
        answer = el.name;
        break;
    }

    rounds.push({
      type: dir,
      prompt,
      answer,
      timeLimitSec,
      meta: { element: el.name, symbol: el.symbol, number: el.number },
    });
  }
  return rounds;
}

function checkAnswer(submission: string, round: GameRound): boolean {
  const sub = submission.trim().toLowerCase();
  const ans = round.answer.toLowerCase();
  return sub === ans;
}

const elementBlitzModule: GameModuleServer = {
  generateRounds,
  checkAnswer,
  validateConfig(config) {
    const dirs = config.directions as string[] | undefined;
    if (dirs && dirs.length === 0) throw new Error("Select at least one direction");
  },
};

export default elementBlitzModule;
