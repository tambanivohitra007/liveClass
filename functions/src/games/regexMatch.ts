import { GameModuleServer, GameRound } from "./types";

interface RegexItem {
  pattern: string;
  testString: string;
  matches: boolean;
  explanation: string;
}

const REGEX_ITEMS: RegexItem[] = [
  // Basic character classes
  { pattern: "\\d+", testString: "abc", matches: false, explanation: "\\d matches digits only" },
  { pattern: "\\d+", testString: "123", matches: true, explanation: "\\d matches digits" },
  { pattern: "\\w+", testString: "hello_world", matches: true, explanation: "\\w matches word characters" },
  { pattern: "\\w+", testString: "!@#$", matches: false, explanation: "\\w doesn't match special chars" },
  { pattern: "\\s", testString: "hello world", matches: true, explanation: "\\s matches whitespace" },
  { pattern: "\\s", testString: "helloworld", matches: false, explanation: "no whitespace present" },
  // Anchors
  { pattern: "^hello", testString: "hello world", matches: true, explanation: "^ matches start of string" },
  { pattern: "^hello", testString: "say hello", matches: false, explanation: "string doesn't start with hello" },
  { pattern: "world$", testString: "hello world", matches: true, explanation: "$ matches end of string" },
  { pattern: "world$", testString: "world hello", matches: false, explanation: "string doesn't end with world" },
  // Quantifiers
  { pattern: "a{3}", testString: "aaa", matches: true, explanation: "{3} means exactly 3" },
  { pattern: "a{3}", testString: "aa", matches: false, explanation: "only 2 a's, need 3" },
  { pattern: "colou?r", testString: "color", matches: true, explanation: "? makes u optional" },
  { pattern: "colou?r", testString: "colour", matches: true, explanation: "? makes u optional" },
  { pattern: "go+d", testString: "god", matches: true, explanation: "+ means one or more" },
  { pattern: "go+d", testString: "goood", matches: true, explanation: "+ matches multiple" },
  { pattern: "go*d", testString: "gd", matches: true, explanation: "* means zero or more" },
  // Character sets
  { pattern: "[aeiou]", testString: "xyz", matches: false, explanation: "no vowels in xyz" },
  { pattern: "[aeiou]", testString: "hello", matches: true, explanation: "e and o are vowels" },
  { pattern: "[A-Z]", testString: "hello", matches: false, explanation: "no uppercase letters" },
  { pattern: "[A-Z]", testString: "Hello", matches: true, explanation: "H is uppercase" },
  { pattern: "[0-9]{3}", testString: "42", matches: false, explanation: "only 2 digits, need 3" },
  { pattern: "[0-9]{3}", testString: "123", matches: true, explanation: "3 consecutive digits" },
  // Alternation & groups
  { pattern: "cat|dog", testString: "I have a cat", matches: true, explanation: "| means or" },
  { pattern: "cat|dog", testString: "I have a fish", matches: false, explanation: "neither cat nor dog" },
  // Dot
  { pattern: "h.t", testString: "hot", matches: true, explanation: ". matches any character" },
  { pattern: "h.t", testString: "ht", matches: false, explanation: ". needs exactly one char" },
  // Escape
  { pattern: "3\\.14", testString: "3.14", matches: true, explanation: "\\. matches literal dot" },
  { pattern: "3\\.14", testString: "3X14", matches: false, explanation: "\\. only matches dot" },
];

function generateRounds(config: Record<string, unknown>, roundCount: number, timeLimitSec: number): GameRound[] {
  const shuffled = [...REGEX_ITEMS].sort(() => Math.random() - 0.5);
  const rounds: GameRound[] = [];

  for (let i = 0; i < roundCount; i++) {
    const item = shuffled[i % shuffled.length];
    rounds.push({
      type: "does_match",
      prompt: `/${item.pattern}/ test "${item.testString}"`,
      answer: item.matches ? "YES" : "NO",
      timeLimitSec,
      meta: {
        pattern: item.pattern,
        testString: item.testString,
        explanation: item.explanation,
        options: [{ value: "YES", label: "Matches" }, { value: "NO", label: "No Match" }],
        inputType: "mcq",
      },
    });
  }
  return rounds;
}

function checkAnswer(submission: string, round: GameRound): boolean {
  return submission.trim().toUpperCase() === round.answer;
}

const regexMatchModule: GameModuleServer = {
  generateRounds: generateRounds,
  checkAnswer,
};

export default regexMatchModule;
