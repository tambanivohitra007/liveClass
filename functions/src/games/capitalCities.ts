import { GameModuleServer, GameRound } from "./types";

interface CityEntry {
  country: string;
  capital: string;
  region: string;
}

const CITIES: CityEntry[] = [
  // Asia
  { country: "Japan", capital: "Tokyo", region: "asia" },
  { country: "South Korea", capital: "Seoul", region: "asia" },
  { country: "China", capital: "Beijing", region: "asia" },
  { country: "India", capital: "New Delhi", region: "asia" },
  { country: "Thailand", capital: "Bangkok", region: "asia" },
  { country: "Vietnam", capital: "Hanoi", region: "asia" },
  { country: "Indonesia", capital: "Jakarta", region: "asia" },
  { country: "Philippines", capital: "Manila", region: "asia" },
  { country: "Malaysia", capital: "Kuala Lumpur", region: "asia" },
  { country: "Singapore", capital: "Singapore", region: "asia" },
  { country: "Myanmar", capital: "Naypyidaw", region: "asia" },
  { country: "Cambodia", capital: "Phnom Penh", region: "asia" },
  // Europe
  { country: "France", capital: "Paris", region: "europe" },
  { country: "Germany", capital: "Berlin", region: "europe" },
  { country: "United Kingdom", capital: "London", region: "europe" },
  { country: "Italy", capital: "Rome", region: "europe" },
  { country: "Spain", capital: "Madrid", region: "europe" },
  { country: "Portugal", capital: "Lisbon", region: "europe" },
  { country: "Netherlands", capital: "Amsterdam", region: "europe" },
  { country: "Belgium", capital: "Brussels", region: "europe" },
  { country: "Switzerland", capital: "Bern", region: "europe" },
  { country: "Austria", capital: "Vienna", region: "europe" },
  { country: "Poland", capital: "Warsaw", region: "europe" },
  { country: "Sweden", capital: "Stockholm", region: "europe" },
  { country: "Norway", capital: "Oslo", region: "europe" },
  { country: "Denmark", capital: "Copenhagen", region: "europe" },
  { country: "Finland", capital: "Helsinki", region: "europe" },
  { country: "Greece", capital: "Athens", region: "europe" },
  // Americas
  { country: "United States", capital: "Washington, D.C.", region: "americas" },
  { country: "Canada", capital: "Ottawa", region: "americas" },
  { country: "Mexico", capital: "Mexico City", region: "americas" },
  { country: "Brazil", capital: "Brasilia", region: "americas" },
  { country: "Argentina", capital: "Buenos Aires", region: "americas" },
  { country: "Colombia", capital: "Bogota", region: "americas" },
  { country: "Peru", capital: "Lima", region: "americas" },
  { country: "Chile", capital: "Santiago", region: "americas" },
  { country: "Cuba", capital: "Havana", region: "americas" },
  { country: "Jamaica", capital: "Kingston", region: "americas" },
  // Africa
  { country: "Egypt", capital: "Cairo", region: "africa" },
  { country: "South Africa", capital: "Pretoria", region: "africa" },
  { country: "Nigeria", capital: "Abuja", region: "africa" },
  { country: "Kenya", capital: "Nairobi", region: "africa" },
  { country: "Ethiopia", capital: "Addis Ababa", region: "africa" },
  { country: "Morocco", capital: "Rabat", region: "africa" },
  { country: "Ghana", capital: "Accra", region: "africa" },
  { country: "Tanzania", capital: "Dodoma", region: "africa" },
  // Oceania
  { country: "Australia", capital: "Canberra", region: "oceania" },
  { country: "New Zealand", capital: "Wellington", region: "oceania" },
  { country: "Fiji", capital: "Suva", region: "oceania" },
  { country: "Papua New Guinea", capital: "Port Moresby", region: "oceania" },
];

function generateRounds(config: Record<string, unknown>, roundCount: number, timeLimitSec: number): GameRound[] {
  const direction = (config.direction as string) || "both";
  const regions = (config.regions as string[]) || ["asia", "europe", "americas", "africa", "oceania"];
  const filtered = CITIES.filter((c) => regions.includes(c.region));
  const rounds: GameRound[] = [];

  for (let i = 0; i < roundCount; i++) {
    const entry = filtered[Math.floor(Math.random() * filtered.length)];
    let dir = direction;
    if (dir === "both") {
      dir = Math.random() < 0.5 ? "country2capital" : "capital2country";
    }

    let prompt: string, answer: string;
    if (dir === "country2capital") {
      prompt = `What is the capital of ${entry.country}?`;
      answer = entry.capital;
    } else {
      prompt = `${entry.capital} is the capital of which country?`;
      answer = entry.country;
    }

    rounds.push({
      type: dir,
      prompt,
      answer,
      timeLimitSec,
      meta: { country: entry.country, capital: entry.capital, region: entry.region },
    });
  }
  return rounds;
}

function checkAnswer(submission: string, round: GameRound): boolean {
  const normalize = (s: string) => s.trim().toLowerCase().replace(/[.,]/g, "");
  return normalize(submission) === normalize(round.answer);
}

const capitalCitiesModule: GameModuleServer = {
  generateRounds,
  checkAnswer,
  validateConfig(config) {
    const regions = config.regions as string[] | undefined;
    if (regions && regions.length === 0) throw new Error("Select at least one region");
  },
};

export default capitalCitiesModule;
