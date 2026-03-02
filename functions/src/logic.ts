/**
 * Pure logic functions extracted from index.ts for testability.
 * No Firebase dependencies — safe to import in unit tests.
 */

/** Check if a student's answer is correct based on question type */
export function checkCorrectness(selection: string, question: { type?: string; options?: string[]; matchOptions?: string[]; correctAnswers?: string[] }): boolean {
  const isPoll = question.type === "poll";
  const isSlide = question.type === "slide";

  if (isSlide) return false;
  if (isPoll) return true;

  if (question.type === "ordering") {
    try {
      const submitted = JSON.parse(selection) as string[];
      const expected: string[] = question.options || [];
      return submitted.length === expected.length &&
        submitted.every((item: string, idx: number) => item === expected[idx]);
    } catch {
      return false;
    }
  }

  if (question.type === "matching") {
    try {
      const pairs = JSON.parse(selection) as Record<string, string>;
      const options: string[] = question.options || [];
      const matchOpts: string[] = question.matchOptions || [];
      return options.length > 0 && options.every((left: string, idx: number) =>
        pairs[left] === matchOpts[idx]
      );
    } catch {
      return false;
    }
  }

  if (question.type === "fill_blank") {
    try {
      const answers = JSON.parse(selection) as string[];
      const expected: string[] = question.correctAnswers || [];
      return answers.length === expected.length && answers.every(
        (a: string, idx: number) => a.trim().toLowerCase() === expected[idx].trim().toLowerCase()
      );
    } catch {
      return false;
    }
  }

  if (question.type === "mcq" && question.correctAnswers && question.correctAnswers.length > 1) {
    try {
      const chosen = JSON.parse(selection) as string[];
      const expected: string[] = question.correctAnswers;
      return chosen.length === expected.length &&
        chosen.every((c: string) => expected.includes(c)) &&
        expected.every((e: string) => chosen.includes(e));
    } catch {
      return false;
    }
  }

  if (question.type === "code_output") {
    const expected: string[] = question.correctAnswers || [];
    return expected.some(
      (a: string) => a.trim().toLowerCase() === selection.trim().toLowerCase()
    );
  }

  // Default: mcq, tf
  return (question.correctAnswers || []).includes(selection);
}

/** Generate a 6-digit PIN code */
export function generatePin(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/** Get leaderboard shard ID for a player (0 to NUM_SHARDS-1) */
export function getShardId(playerId: string, numShards = 10): number {
  let hash = 0;
  for (let i = 0; i < playerId.length; i++) {
    hash = (hash * 31 + playerId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % numShards;
}

/** Calculate points for a correct answer based on time remaining */
export function calculatePoints(
  timeLimitSec: number,
  timeMs: number,
  currentStreak: number
): { pointsAwarded: number; newStreak: number } {
  const timeFactor = Math.max(
    0,
    (timeLimitSec * 1000 - timeMs) / (timeLimitSec * 1000)
  );
  let pointsAwarded = Math.round(1000 * timeFactor);
  const newStreak = currentStreak + 1;
  pointsAwarded += newStreak * 50;
  return { pointsAwarded, newStreak };
}

/** Validate nickname (length, non-empty) */
export function validateNickname(nickname: string): { valid: boolean; error?: string } {
  if (!nickname || nickname.trim().length === 0) {
    return { valid: false, error: "Nickname is required" };
  }
  if (nickname.length > 20) {
    return { valid: false, error: "Nickname too long" };
  }
  return { valid: true };
}
