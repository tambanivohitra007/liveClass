import { GameModuleServer, GameRound } from "./types";
import { generateWithGemini } from "./geminiHelper";

interface SqlItem {
  table: string;
  query: string;
  output: string;
  topic: string;
}

const SQL_ITEMS: SqlItem[] = [
  // Table: students (id, name, age, grade)
  { table: "students: (1,'Alice',20,'A'), (2,'Bob',22,'B'), (3,'Carol',21,'A'), (4,'Dave',23,'C')", query: "SELECT COUNT(*) FROM students;", output: "4", topic: "COUNT" },
  { table: "students: (1,'Alice',20,'A'), (2,'Bob',22,'B'), (3,'Carol',21,'A'), (4,'Dave',23,'C')", query: "SELECT MAX(age) FROM students;", output: "23", topic: "MAX" },
  { table: "students: (1,'Alice',20,'A'), (2,'Bob',22,'B'), (3,'Carol',21,'A'), (4,'Dave',23,'C')", query: "SELECT MIN(age) FROM students;", output: "20", topic: "MIN" },
  { table: "students: (1,'Alice',20,'A'), (2,'Bob',22,'B'), (3,'Carol',21,'A'), (4,'Dave',23,'C')", query: "SELECT AVG(age) FROM students;", output: "21.5", topic: "AVG" },
  { table: "students: (1,'Alice',20,'A'), (2,'Bob',22,'B'), (3,'Carol',21,'A'), (4,'Dave',23,'C')", query: "SELECT COUNT(*) FROM students WHERE grade='A';", output: "2", topic: "WHERE + COUNT" },
  { table: "students: (1,'Alice',20,'A'), (2,'Bob',22,'B'), (3,'Carol',21,'A'), (4,'Dave',23,'C')", query: "SELECT name FROM students WHERE age > 21 ORDER BY name LIMIT 1;", output: "Bob", topic: "WHERE + ORDER + LIMIT" },
  { table: "students: (1,'Alice',20,'A'), (2,'Bob',22,'B'), (3,'Carol',21,'A'), (4,'Dave',23,'C')", query: "SELECT SUM(age) FROM students;", output: "86", topic: "SUM" },
  // Table: products (id, name, price, qty)
  { table: "products: (1,'Pen',2,100), (2,'Book',15,50), (3,'Bag',30,20), (4,'Pen',3,80)", query: "SELECT COUNT(DISTINCT name) FROM products;", output: "3", topic: "COUNT DISTINCT" },
  { table: "products: (1,'Pen',2,100), (2,'Book',15,50), (3,'Bag',30,20), (4,'Pen',3,80)", query: "SELECT SUM(price * qty) FROM products WHERE name='Pen';", output: "440", topic: "SUM expression" },
  { table: "products: (1,'Pen',2,100), (2,'Book',15,50), (3,'Bag',30,20), (4,'Pen',3,80)", query: "SELECT MAX(price) FROM products;", output: "30", topic: "MAX" },
  { table: "products: (1,'Pen',2,100), (2,'Book',15,50), (3,'Bag',30,20), (4,'Pen',3,80)", query: "SELECT name FROM products ORDER BY price DESC LIMIT 1;", output: "Bag", topic: "ORDER DESC LIMIT" },
  // Simple math/logic queries
  { table: "(no table)", query: "SELECT 5 + 3;", output: "8", topic: "arithmetic" },
  { table: "(no table)", query: "SELECT 10 % 3;", output: "1", topic: "modulo" },
  { table: "(no table)", query: "SELECT LENGTH('hello');", output: "5", topic: "LENGTH" },
  { table: "(no table)", query: "SELECT UPPER('hello');", output: "HELLO", topic: "UPPER" },
  { table: "(no table)", query: "SELECT CONCAT('foo', 'bar');", output: "foobar", topic: "CONCAT" },
  { table: "(no table)", query: "SELECT ROUND(3.7);", output: "4", topic: "ROUND" },
  { table: "(no table)", query: "SELECT ABS(-42);", output: "42", topic: "ABS" },
  { table: "(no table)", query: "SELECT COALESCE(NULL, 'default');", output: "default", topic: "COALESCE" },
];

function generateRounds(config: Record<string, unknown>, roundCount: number, timeLimitSec: number): GameRound[] {
  const shuffled = [...SQL_ITEMS].sort(() => Math.random() - 0.5);
  const rounds: GameRound[] = [];

  for (let i = 0; i < roundCount; i++) {
    const item = shuffled[i % shuffled.length];
    rounds.push({
      type: item.topic,
      prompt: item.query,
      answer: item.output,
      timeLimitSec,
      meta: { table: item.table, topic: item.topic, language: "sql" },
    });
  }
  return rounds;
}

function checkAnswer(submission: string, round: GameRound): boolean {
  const sub = submission.trim();
  const ans = round.answer;
  // Numeric comparison
  if (!isNaN(Number(ans)) && !isNaN(Number(sub))) {
    return Number(sub) === Number(ans);
  }
  // String comparison (case-insensitive for strings like HELLO)
  return sub.toUpperCase() === ans.toUpperCase();
}

async function generateRoundsAI(config: Record<string, unknown>, roundCount: number, timeLimitSec: number, apiKey: string): Promise<GameRound[] | null> {
  const result = await generateWithGemini<Array<{ table: string; query: string; output: string; topic: string }>>(
    apiKey,
    `Generate ${roundCount} unique SQL "predict the output" questions for a quiz game.
Mix of: aggregate functions (COUNT, SUM, AVG, MAX, MIN), WHERE clauses, JOINs, GROUP BY, HAVING, subqueries, string functions, date functions, CASE WHEN, DISTINCT, LIMIT, ORDER BY.
For table-based questions, define a small table with 3-5 rows inline like: "employees: (1,'Alice','Sales',50000), (2,'Bob','IT',60000), (3,'Carol','Sales',55000)"
For simple expression questions, set table to "(no table)".
Each answer must be a single value (number or short string), not a result set.
Return JSON array: [{"table":"...","query":"SELECT ...","output":"expected","topic":"COUNT+WHERE"}, ...]`,
    0.9,
  );

  if (!result || !Array.isArray(result) || result.length === 0) return null;

  return result.slice(0, roundCount).map((item) => ({
    type: item.topic || "sql",
    prompt: item.query,
    answer: item.output,
    timeLimitSec,
    meta: { table: item.table, topic: item.topic, language: "sql" },
  }));
}

const sqlOutputModule: GameModuleServer = {
  generateRounds,
  generateRoundsAI,
  checkAnswer,
};

export default sqlOutputModule;
