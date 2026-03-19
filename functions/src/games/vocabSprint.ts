import { GameModuleServer, GameRound } from "./types";
import { generateWithGemini } from "./geminiHelper";

interface WordEntry {
  en: string;
  target: string;
}

const FRENCH_WORDS: WordEntry[] = [
  { en: "hello", target: "bonjour" },
  { en: "goodbye", target: "au revoir" },
  { en: "thank you", target: "merci" },
  { en: "please", target: "s'il vous plaît" },
  { en: "yes", target: "oui" },
  { en: "no", target: "non" },
  { en: "water", target: "eau" },
  { en: "bread", target: "pain" },
  { en: "house", target: "maison" },
  { en: "book", target: "livre" },
  { en: "cat", target: "chat" },
  { en: "dog", target: "chien" },
  { en: "friend", target: "ami" },
  { en: "school", target: "école" },
  { en: "time", target: "temps" },
  { en: "love", target: "amour" },
  { en: "sun", target: "soleil" },
  { en: "moon", target: "lune" },
  { en: "star", target: "étoile" },
  { en: "tree", target: "arbre" },
  { en: "flower", target: "fleur" },
  { en: "red", target: "rouge" },
  { en: "blue", target: "bleu" },
  { en: "green", target: "vert" },
  { en: "white", target: "blanc" },
  { en: "black", target: "noir" },
  { en: "big", target: "grand" },
  { en: "small", target: "petit" },
  { en: "good", target: "bon" },
  { en: "bad", target: "mauvais" },
  { en: "food", target: "nourriture" },
  { en: "music", target: "musique" },
];

const SPANISH_WORDS: WordEntry[] = [
  { en: "hello", target: "hola" },
  { en: "goodbye", target: "adiós" },
  { en: "thank you", target: "gracias" },
  { en: "please", target: "por favor" },
  { en: "yes", target: "sí" },
  { en: "no", target: "no" },
  { en: "water", target: "agua" },
  { en: "bread", target: "pan" },
  { en: "house", target: "casa" },
  { en: "book", target: "libro" },
  { en: "cat", target: "gato" },
  { en: "dog", target: "perro" },
  { en: "friend", target: "amigo" },
  { en: "school", target: "escuela" },
  { en: "time", target: "tiempo" },
  { en: "love", target: "amor" },
  { en: "sun", target: "sol" },
  { en: "moon", target: "luna" },
  { en: "star", target: "estrella" },
  { en: "tree", target: "árbol" },
  { en: "flower", target: "flor" },
  { en: "red", target: "rojo" },
  { en: "blue", target: "azul" },
  { en: "green", target: "verde" },
  { en: "white", target: "blanco" },
  { en: "black", target: "negro" },
  { en: "big", target: "grande" },
  { en: "small", target: "pequeño" },
  { en: "good", target: "bueno" },
  { en: "bad", target: "malo" },
  { en: "food", target: "comida" },
  { en: "music", target: "música" },
];

const JAPANESE_WORDS: WordEntry[] = [
  { en: "hello", target: "konnichiwa" },
  { en: "goodbye", target: "sayounara" },
  { en: "thank you", target: "arigatou" },
  { en: "please", target: "onegaishimasu" },
  { en: "yes", target: "hai" },
  { en: "no", target: "iie" },
  { en: "water", target: "mizu" },
  { en: "bread", target: "pan" },
  { en: "house", target: "ie" },
  { en: "book", target: "hon" },
  { en: "cat", target: "neko" },
  { en: "dog", target: "inu" },
  { en: "friend", target: "tomodachi" },
  { en: "school", target: "gakkou" },
  { en: "time", target: "jikan" },
  { en: "love", target: "ai" },
  { en: "sun", target: "taiyou" },
  { en: "moon", target: "tsuki" },
  { en: "star", target: "hoshi" },
  { en: "tree", target: "ki" },
  { en: "flower", target: "hana" },
  { en: "red", target: "aka" },
  { en: "blue", target: "ao" },
  { en: "green", target: "midori" },
  { en: "white", target: "shiro" },
  { en: "black", target: "kuro" },
  { en: "big", target: "ookii" },
  { en: "small", target: "chiisai" },
  { en: "good", target: "ii" },
  { en: "bad", target: "warui" },
  { en: "food", target: "tabemono" },
  { en: "music", target: "ongaku" },
];

const WORD_BANKS: Record<string, WordEntry[]> = {
  french: FRENCH_WORDS,
  spanish: SPANISH_WORDS,
  japanese: JAPANESE_WORDS,
};

const LANG_LABELS: Record<string, string> = {
  french: "French",
  spanish: "Spanish",
  japanese: "Japanese",
};

function generateRounds(config: Record<string, unknown>, roundCount: number, timeLimitSec: number): GameRound[] {
  const language = (config.language as string) || "french";
  const direction = (config.direction as string) || "both";
  const words = WORD_BANKS[language] || FRENCH_WORDS;
  const langLabel = LANG_LABELS[language] || language;
  const rounds: GameRound[] = [];

  for (let i = 0; i < roundCount; i++) {
    const word = words[Math.floor(Math.random() * words.length)];
    let dir = direction;
    if (dir === "both") {
      dir = Math.random() < 0.5 ? "en2target" : "target2en";
    }

    let prompt: string, answer: string;
    if (dir === "en2target") {
      prompt = `Translate "${word.en}" to ${langLabel}`;
      answer = word.target;
    } else {
      prompt = `Translate "${word.target}" to English`;
      answer = word.en;
    }

    rounds.push({
      type: dir,
      prompt,
      answer,
      timeLimitSec,
      meta: { english: word.en, target: word.target, language },
    });
  }
  return rounds;
}

function checkAnswer(submission: string, round: GameRound): boolean {
  const normalize = (s: string) =>
    s.trim().toLowerCase()
      .replace(/['']/g, "'")
      .replace(/[àâä]/g, "a")
      .replace(/[éèêë]/g, "e")
      .replace(/[îï]/g, "i")
      .replace(/[ôö]/g, "o")
      .replace(/[ùûü]/g, "u")
      .replace(/[ñ]/g, "n");
  return normalize(submission) === normalize(round.answer);
}

async function generateRoundsAI(config: Record<string, unknown>, roundCount: number, timeLimitSec: number, apiKey: string): Promise<GameRound[] | null> {
  const language = (config.language as string) || "french";
  const direction = (config.direction as string) || "both";
  const langName = language.charAt(0).toUpperCase() + language.slice(1);

  const result = await generateWithGemini<Array<{ english: string; translation: string }>>(
    apiKey,
    `Generate ${roundCount} unique English-${langName} vocabulary pairs for a language learning game.
Mix everyday words: food, animals, colors, body parts, weather, emotions, travel, school, family, clothing, nature.
${language === "japanese" ? "Use romaji for Japanese (e.g. 'neko' not 'ねこ')." : "Include accents where appropriate."}
Avoid very obscure words — target A1-B1 level.
Return JSON array: [{"english":"cat","translation":"${language === "french" ? "chat" : language === "spanish" ? "gato" : "neko"}"}, ...]`,
    0.9,
  );

  if (!result || !Array.isArray(result) || result.length === 0) return null;

  const rounds: GameRound[] = [];
  for (let i = 0; i < Math.min(roundCount, result.length); i++) {
    const item = result[i];
    let type: string;
    if (direction === "en2target") type = "en2target";
    else if (direction === "target2en") type = "target2en";
    else type = i % 2 === 0 ? "en2target" : "target2en";

    rounds.push({
      type,
      prompt: type === "en2target" ? item.english : item.translation,
      answer: type === "en2target" ? item.translation.toUpperCase() : item.english.toUpperCase(),
      timeLimitSec,
      meta: { english: item.english, translation: item.translation, language },
    });
  }
  return rounds;
}

const vocabSprintModule: GameModuleServer = {
  generateRounds,
  generateRoundsAI,
  checkAnswer,
  validateConfig(config) {
    const lang = config.language as string | undefined;
    if (lang && !WORD_BANKS[lang]) throw new Error("Invalid language");
  },
};

export default vocabSprintModule;
