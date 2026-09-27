// Blooket-style "Arcade" game modes. Shared by the web client and the LAN server (lan/server/arcade).

export type ArcadeMode = 'gold' | 'racing' | 'tower' | 'cafe';
export type ArcadeStatus = 'lobby' | 'live' | 'ended';

/** Question types the arcade modes can ask (they need an unambiguous right answer). */
export const ARCADE_QUESTION_TYPES = ['mcq', 'tf', 'short', 'code_output'] as const;

export interface ArcadeSettings {
  /** Game length in seconds; null = until the teacher ends it (or a goal is reached). */
  timeLimitSec: number | null;
  /** Gold Quest: gold needed to win. Racing: track length (correct answers). */
  goal: number | null;
}

export interface ArcadeGame {
  id: string;
  ownerId: string;
  quizId: string;
  quizTitle: string;
  mode: ArcadeMode;
  pinCode: string;
  status: ArcadeStatus;
  joinLocked: boolean;
  settings: ArcadeSettings;
  questionCount: number;
  playerCount: number;
  createdAt: number;
  startedAt: number | null;
  endsAt: number | null;
  endedAt: number | null;
  winnerId: string | null;
}

export interface ArcadePlayer {
  id: string;
  nickname: string;
  avatar: string;
  /** Gold (Gold Quest), track position (Racing), game score (Tower Defense / Café). */
  score: number;
  correct: number;
  answered: number;
  streak: number;
  joinedAt: number;
  lastActiveAt: number;
  finishedAt: number | null;
}

export type ArcadeEventType = 'join' | 'gain' | 'double' | 'triple' | 'lose' | 'steal' | 'swap' | 'finish' | 'boost';

export interface ArcadeEvent {
  id: string;
  type: ArcadeEventType;
  text: string;
  at: number;
  actorId: string;
  targetId: string | null;
}

/** A question as sent to players: never includes the correct answers. */
export interface ArcadeQuestion {
  id: string;
  type: (typeof ARCADE_QUESTION_TYPES)[number];
  text: string;
  options: string[];
  multi: boolean;
  imageUrl: string | null;
  codeSnippet: string | null;
  codeLanguage: string | null;
}

export type ChestOutcome =
  | { kind: 'gain'; amount: number }
  | { kind: 'double' }
  | { kind: 'triple' }
  | { kind: 'lose'; percent: number }
  | { kind: 'steal'; percent: number }
  | { kind: 'swap' }
  | { kind: 'nothing' };

export interface ArcadeTarget {
  id: string;
  nickname: string;
  avatar: string;
  score: number;
}

export interface ArcadeAnswerResult {
  correct: boolean;
  correctAnswers: string[];
  /** Gold Quest: three chests are ready to open. */
  chests?: boolean;
  /** Racing: new position; Tower/Café: resources granted. */
  progress?: number;
  reward?: number;
  finished?: boolean;
}

export interface ArcadeChestResult {
  outcome: ChestOutcome;
  /** All three outcomes, revealed after picking (the unchosen ones are shown greyed out). */
  revealed: ChestOutcome[];
  /** Steal/swap need a victim; call arcadeTarget next. */
  needsTarget: boolean;
  targets: ArcadeTarget[];
  score: number;
}

export const ARCADE_MODES: Record<ArcadeMode, { name: string; tagline: string; emoji: string; defaults: ArcadeSettings; selfPaced: boolean }> = {
  gold: {
    name: 'Gold Quest',
    tagline: 'Answer to open chests — gain, double, steal or swap gold!',
    emoji: '💰',
    defaults: { timeLimitSec: 7 * 60, goal: null },
    selfPaced: true,
  },
  racing: {
    name: 'Racing',
    tagline: 'Every correct answer moves you forward. First to the finish wins!',
    emoji: '🏁',
    defaults: { timeLimitSec: null, goal: 20 },
    selfPaced: true,
  },
  tower: {
    name: 'Tower Defense',
    tagline: 'Earn coins with correct answers and build towers to stop the waves.',
    emoji: '🏰',
    defaults: { timeLimitSec: 8 * 60, goal: null },
    selfPaced: true,
  },
  cafe: {
    name: 'Café',
    tagline: 'Answer to restock food, then serve hungry customers for cash.',
    emoji: '☕',
    defaults: { timeLimitSec: 7 * 60, goal: null },
    selfPaced: true,
  },
};
