import { GameModuleServer, GameRound } from "./types";
import { generateWithGemini } from "./geminiHelper";

interface CodeSnippet {
  language: string;
  code: string;
  output: string;
  topic: string;
}

const SNIPPETS: CodeSnippet[] = [
  // Python
  { language: "python", code: "print(10 // 3)", output: "3", topic: "integer division" },
  { language: "python", code: "print(10 % 3)", output: "1", topic: "modulo" },
  { language: "python", code: "print(2 ** 10)", output: "1024", topic: "exponent" },
  { language: "python", code: "x = [1, 2, 3]\nprint(len(x))", output: "3", topic: "list length" },
  { language: "python", code: "print('hello'[1])", output: "e", topic: "string indexing" },
  { language: "python", code: "print('hello'[-1])", output: "o", topic: "negative indexing" },
  { language: "python", code: "print('ab' * 3)", output: "ababab", topic: "string repeat" },
  { language: "python", code: "x = [1, 2, 3]\nprint(x[:2])", output: "[1, 2]", topic: "slicing" },
  { language: "python", code: "print(type(3.14).__name__)", output: "float", topic: "type checking" },
  { language: "python", code: "print(bool(0))", output: "False", topic: "truthiness" },
  { language: "python", code: "print(bool(''))", output: "False", topic: "empty string truthiness" },
  { language: "python", code: "print(bool([]))", output: "False", topic: "empty list truthiness" },
  { language: "python", code: "print(max(3, 1, 4, 1, 5))", output: "5", topic: "max function" },
  { language: "python", code: "x = 'Hello'\nprint(x.upper())", output: "HELLO", topic: "string methods" },
  { language: "python", code: "print(list(range(5)))", output: "[0, 1, 2, 3, 4]", topic: "range" },
  { language: "python", code: "print(sum([1, 2, 3, 4]))", output: "10", topic: "sum" },
  { language: "python", code: "a, b = 5, 3\nprint(a - b)", output: "2", topic: "tuple unpacking" },
  { language: "python", code: "print('a' in 'abc')", output: "True", topic: "membership" },
  // JavaScript
  { language: "javascript", code: "console.log(typeof null)", output: "object", topic: "typeof quirk" },
  { language: "javascript", code: "console.log(0.1 + 0.2 === 0.3)", output: "false", topic: "floating point" },
  { language: "javascript", code: "console.log('5' + 3)", output: "53", topic: "type coercion" },
  { language: "javascript", code: "console.log('5' - 3)", output: "2", topic: "type coercion" },
  { language: "javascript", code: "console.log([1,2,3].length)", output: "3", topic: "array length" },
  { language: "javascript", code: "console.log(Math.floor(4.7))", output: "4", topic: "Math.floor" },
  { language: "javascript", code: "console.log(Math.ceil(4.1))", output: "5", topic: "Math.ceil" },
  { language: "javascript", code: "console.log(Boolean(0))", output: "false", topic: "Boolean coercion" },
  { language: "javascript", code: "console.log(Boolean(''))", output: "false", topic: "empty string" },
  { language: "javascript", code: "console.log(NaN === NaN)", output: "false", topic: "NaN comparison" },
  // C
  { language: "c", code: "int x = 7 / 2;\nprintf(\"%d\", x);", output: "3", topic: "integer division" },
  { language: "c", code: "int x = 5;\nprintf(\"%d\", x++);", output: "5", topic: "post-increment" },
  { language: "c", code: "int x = 5;\nprintf(\"%d\", ++x);", output: "6", topic: "pre-increment" },
  { language: "c", code: "printf(\"%d\", sizeof(char));", output: "1", topic: "sizeof" },
  { language: "c", code: "int a=3, b=4;\nprintf(\"%d\", a>b ? a : b);", output: "4", topic: "ternary" },
];

function generateRounds(config: Record<string, unknown>, roundCount: number, timeLimitSec: number): GameRound[] {
  const languages = (config.languages as string[]) || ["python", "javascript", "c"];
  const pool = SNIPPETS.filter((s) => languages.includes(s.language));
  const shuffled = pool.sort(() => Math.random() - 0.5);
  const rounds: GameRound[] = [];

  for (let i = 0; i < roundCount; i++) {
    const item = shuffled[i % shuffled.length];
    rounds.push({
      type: item.language,
      prompt: item.code,
      answer: item.output,
      timeLimitSec,
      meta: { language: item.language, topic: item.topic },
    });
  }
  return rounds;
}

function checkAnswer(submission: string, round: GameRound): boolean {
  const sub = submission.trim();
  const ans = round.answer;
  // Case-insensitive for boolean values
  if (["true", "false", "True", "False"].includes(ans)) {
    return sub.toLowerCase() === ans.toLowerCase();
  }
  return sub === ans;
}

async function generateRoundsAI(config: Record<string, unknown>, roundCount: number, timeLimitSec: number, apiKey: string): Promise<GameRound[] | null> {
  const languages = (config.languages as string[]) || ["python", "javascript", "c"];
  const langStr = languages.join(", ");

  const result = await generateWithGemini<Array<{ language: string; code: string; output: string }>>(
    apiKey,
    `Generate ${roundCount} unique "predict the output" code snippet questions for a programming quiz game.
Languages to use: ${langStr} (distribute evenly).
Each snippet should be 1-4 lines of code that produces a single deterministic output.
Focus on: type coercion, operator precedence, string operations, list/array methods, integer vs float division, boolean logic, indexing, slicing, built-in functions.
Do NOT repeat patterns. Make them tricky but fair — a student who knows the language should get it.
Return a JSON array: [{"language":"python","code":"print(...)","output":"expected output"}, ...]
The output must be exactly what gets printed (no quotes around strings unless they are part of the output).`,
    0.9,
  );

  if (!result || !Array.isArray(result) || result.length === 0) return null;

  return result.slice(0, roundCount).map((item) => ({
    type: item.language,
    prompt: item.code,
    answer: item.output,
    timeLimitSec,
    meta: { language: item.language, topic: "ai-generated" },
  }));
}

const codeOutputModule: GameModuleServer = {
  generateRounds,
  generateRoundsAI,
  checkAnswer,
};

export default codeOutputModule;
