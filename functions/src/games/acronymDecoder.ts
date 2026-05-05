import { GameModuleServer, GameRound } from "./types";

interface AcronymEntry {
  abbr: string;
  full: string;
  category: string;
}

const ACRONYMS: AcronymEntry[] = [
  // Tech
  { abbr: "CPU", full: "Central Processing Unit", category: "tech" },
  { abbr: "GPU", full: "Graphics Processing Unit", category: "tech" },
  { abbr: "RAM", full: "Random Access Memory", category: "tech" },
  { abbr: "ROM", full: "Read Only Memory", category: "tech" },
  { abbr: "SSD", full: "Solid State Drive", category: "tech" },
  { abbr: "HTTP", full: "HyperText Transfer Protocol", category: "tech" },
  { abbr: "HTTPS", full: "HyperText Transfer Protocol Secure", category: "tech" },
  { abbr: "HTML", full: "HyperText Markup Language", category: "tech" },
  { abbr: "CSS", full: "Cascading Style Sheets", category: "tech" },
  { abbr: "API", full: "Application Programming Interface", category: "tech" },
  { abbr: "URL", full: "Uniform Resource Locator", category: "tech" },
  { abbr: "USB", full: "Universal Serial Bus", category: "tech" },
  { abbr: "LAN", full: "Local Area Network", category: "tech" },
  { abbr: "WAN", full: "Wide Area Network", category: "tech" },
  { abbr: "DNS", full: "Domain Name System", category: "tech" },
  { abbr: "SQL", full: "Structured Query Language", category: "tech" },
  { abbr: "PDF", full: "Portable Document Format", category: "tech" },
  { abbr: "JPEG", full: "Joint Photographic Experts Group", category: "tech" },
  { abbr: "WiFi", full: "Wireless Fidelity", category: "tech" },
  { abbr: "IoT", full: "Internet of Things", category: "tech" },
  // Science
  { abbr: "DNA", full: "Deoxyribonucleic Acid", category: "science" },
  { abbr: "RNA", full: "Ribonucleic Acid", category: "science" },
  { abbr: "ATP", full: "Adenosine Triphosphate", category: "science" },
  { abbr: "pH", full: "Potential of Hydrogen", category: "science" },
  { abbr: "UV", full: "Ultraviolet", category: "science" },
  { abbr: "IR", full: "Infrared", category: "science" },
  { abbr: "MRI", full: "Magnetic Resonance Imaging", category: "science" },
  { abbr: "CT", full: "Computed Tomography", category: "science" },
  { abbr: "LED", full: "Light Emitting Diode", category: "science" },
  { abbr: "AC", full: "Alternating Current", category: "science" },
  { abbr: "DC", full: "Direct Current", category: "science" },
  // Organizations
  { abbr: "NATO", full: "North Atlantic Treaty Organization", category: "organizations" },
  { abbr: "UNESCO", full: "United Nations Educational Scientific and Cultural Organization", category: "organizations" },
  { abbr: "WHO", full: "World Health Organization", category: "organizations" },
  { abbr: "NASA", full: "National Aeronautics and Space Administration", category: "organizations" },
  { abbr: "FBI", full: "Federal Bureau of Investigation", category: "organizations" },
  { abbr: "CIA", full: "Central Intelligence Agency", category: "organizations" },
  { abbr: "UN", full: "United Nations", category: "organizations" },
  { abbr: "EU", full: "European Union", category: "organizations" },
  { abbr: "FIFA", full: "Federation Internationale de Football Association", category: "organizations" },
  // General
  { abbr: "ASAP", full: "As Soon As Possible", category: "general" },
  { abbr: "FAQ", full: "Frequently Asked Questions", category: "general" },
  { abbr: "DIY", full: "Do It Yourself", category: "general" },
  { abbr: "ETA", full: "Estimated Time of Arrival", category: "general" },
  { abbr: "FYI", full: "For Your Information", category: "general" },
  { abbr: "RSVP", full: "Repondez S'il Vous Plait", category: "general" },
  { abbr: "VIP", full: "Very Important Person", category: "general" },
  { abbr: "ATM", full: "Automated Teller Machine", category: "general" },
  { abbr: "PIN", full: "Personal Identification Number", category: "general" },
];

function generateRounds(config: Record<string, unknown>, roundCount: number, timeLimitSec: number): GameRound[] {
  const categories = (config.categories as string[]) || ["tech", "science", "organizations", "general"];
  const filtered = ACRONYMS.filter((a) => categories.includes(a.category));
  const rounds: GameRound[] = [];

  for (let i = 0; i < roundCount; i++) {
    const entry = filtered[Math.floor(Math.random() * filtered.length)];
    rounds.push({
      type: entry.category,
      prompt: `What does "${entry.abbr}" stand for?`,
      answer: entry.full,
      timeLimitSec,
      meta: { abbreviation: entry.abbr, category: entry.category },
    });
  }
  return rounds;
}

function checkAnswer(submission: string, round: GameRound): boolean {
  const normalize = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ");
  return normalize(submission) === normalize(round.answer);
}

const acronymDecoderModule: GameModuleServer = {
  generateRounds,
  checkAnswer,
  validateConfig(config) {
    const cats = config.categories as string[] | undefined;
    if (cats && cats.length === 0) throw new Error("Select at least one category");
  },
};

export default acronymDecoderModule;
