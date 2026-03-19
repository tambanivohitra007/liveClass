export interface GameRound {
  type: string;
  prompt: string;
  answer: string;
  timeLimitSec: number;
  meta?: Record<string, unknown>;
}

export interface GameModuleServer {
  /** Generate rounds from config (sync, uses static/procedural content) */
  generateRounds(config: Record<string, unknown>, roundCount: number, timeLimitSec: number): GameRound[];

  /** Generate rounds with AI (optional). Returns null to fallback to generateRounds. */
  generateRoundsAI?(config: Record<string, unknown>, roundCount: number, timeLimitSec: number, apiKey: string): Promise<GameRound[] | null>;

  /** Check if a submission is correct for a given round */
  checkAnswer(submission: string, round: GameRound): boolean;

  /** Validate game-specific config (throws if invalid) */
  validateConfig?(config: Record<string, unknown>): void;
}
