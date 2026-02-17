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
  createdAt: number;
  updatedAt: number;
}

export type QuestionType = 'mcq' | 'tf' | 'short';

export interface Question {
  id: string;
  quizId: string;
  type: QuestionType;
  text: string;
  imageUrl?: string;
  options: string[];
  correctAnswers: string[];
  timeLimitSec: number;
}

export type SessionStatus = 'lobby' | 'live' | 'ended';

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
}

export interface SessionPlayer {
  id: string;
  sessionId: string;
  userId?: string;
  nickname: string;
  avatar?: string;
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
