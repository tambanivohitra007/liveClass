export const COLLECTION_COLORS = [
  { key: 'brand',   label: 'Rose',   bg: 'bg-brand',     text: 'text-brand' },
  { key: 'accent',  label: 'Teal',   bg: 'bg-accent',    text: 'text-accent' },
  { key: 'success', label: 'Green',  bg: 'bg-success',   text: 'text-success' },
  { key: 'warning', label: 'Amber',  bg: 'bg-warning',   text: 'text-warning' },
  { key: 'info',    label: 'Blue',   bg: 'bg-info',      text: 'text-info' },
  { key: 'purple',  label: 'Purple', bg: 'bg-[#8B5CF6]', text: 'text-[#8B5CF6]' },
] as const;

export type CollectionColor = typeof COLLECTION_COLORS[number]['key'];

export interface Collection {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  color: CollectionColor;
  createdAt: number;
  updatedAt: number;
}

export interface User {
  id: string;
  displayName: string;
  email: string;
  role: 'teacher' | 'student';
  photoUrl?: string;
  createdAt: number;
}

export interface Quiz {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  visibility: 'private' | 'org';
  collectionId?: string | null;
  createdAt: number;
  updatedAt: number;
}

export type QuestionType = 'mcq' | 'tf' | 'short' | 'matching' | 'fill_blank' | 'ordering' | 'poll' | 'slide';

export interface Question {
  id: string;
  quizId: string;
  type: QuestionType;
  text: string;
  imageUrl?: string;
  videoUrl?: string;
  options: string[];
  matchOptions?: string[];
  correctAnswers: string[];
  timeLimitSec: number;
}

export type SessionStatus = 'lobby' | 'live' | 'ended';

export interface TeamConfig {
  name: string;
  color: string;
}

export const TEAM_PRESETS: TeamConfig[] = [
  { name: 'Red Team', color: '#EF4444' },
  { name: 'Blue Team', color: '#3B82F6' },
  { name: 'Green Team', color: '#22C55E' },
  { name: 'Yellow Team', color: '#EAB308' },
  { name: 'Purple Team', color: '#8B5CF6' },
  { name: 'Orange Team', color: '#F97316' },
];

export interface Session {
  id: string;
  quizId: string;
  hostId: string;
  pinCode: string;
  status: SessionStatus;
  currentQuestionIndex: number;
  questionState: 'lobby' | 'live' | 'reveal';
  joinLocked: boolean;
  startedAt: number | null;
  endedAt: number | null;
  top10Snapshot?: { playerId: string; totalPoints: number; rank: number }[];
  teamScoreSnapshot?: { teamIndex: number; name: string; color: string; avgPoints: number }[];
  questionStartedAt?: number | null;
  antiCheatEnabled?: boolean;
  teamMode?: boolean;
  teamCount?: number;
  teams?: TeamConfig[];
  shuffleQuestions?: boolean;
  questionOrder?: number[];
}

export interface SessionPlayer {
  id: string;
  sessionId: string;
  userId?: string;
  nickname: string;
  avatar?: string;
  teamIndex?: number;
  joinedAt: number;
}

export interface Answer {
  id: string;
  sessionId: string;
  playerId: string;
  questionId: string;
  selection: string | string[];
  timeMs: number;
  correct: boolean;
  pointsAwarded: number;
}

export interface LeaderboardEntry {
  sessionId: string;
  playerId: string;
  totalPoints: number;
  streak: number;
  rank: number;
}

export interface Assignment {
  id: string;
  quizId: string;
  ownerId: string;
  startAt: number;
  endAt: number;
  attemptsAllowed: number;
}

export type ViolationType = 'tab_hidden' | 'window_blur' | 'paste_attempt';

export interface ViolationEvent {
  type: ViolationType;
  timestamp: number;
}

export interface ViolationDoc {
  playerId: string;
  nickname: string;
  totalViolations: number;
  events: ViolationEvent[];
}
