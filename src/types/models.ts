export const COLLECTION_COLORS = [
  { key: 'brand',   label: 'Rose',   bg: 'bg-brand',     text: 'text-brand' },
  { key: 'accent',  label: 'Orange', bg: 'bg-accent',    text: 'text-accent' },
  { key: 'success', label: 'Olive',  bg: 'bg-success',   text: 'text-success' },
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
  approvalStatus?: 'pending' | 'approved' | 'rejected';
  photoUrl?: string;
  gender?: 'male' | 'female' | 'other' | '';
  phone?: string;
  address?: string;
  createdAt: number;
}

export interface Quiz {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  visibility: 'private' | 'org' | 'public';
  collectionId?: string | null;
  coverImageUrl?: string;
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
  questionState: 'lobby' | 'live' | 'reveal' | 'student_paced';
  paceMode?: 'teacher' | 'student';
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
  timerPaused?: boolean;
  timerPausedAt?: number | null;
  classroomId?: string | null;
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
  classroomId?: string | null;
}

// --- Classroom Types ---
export type ClassroomColor = CollectionColor;

export interface Classroom {
  id: string;
  name: string;
  description: string;
  color: ClassroomColor;
  ownerId: string;
  joinCode: string;
  joinCodeExpiresAt: number;
  studentCount: number;
  coTeacherCount: number;
  createdAt: number;
  updatedAt: number;
}

export type ClassroomMemberRole = 'student' | 'co-teacher';

export interface ClassroomMember {
  id: string;
  userId: string;
  displayName: string;
  email: string;
  role: ClassroomMemberRole;
  joinedAt: number;
}

// --- AI Evaluation Types ---
export interface ParticipantEvaluation {
  summary: string;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  overallRating: 'excellent' | 'good' | 'average' | 'needs_improvement';
  topicMastery: { topic: string; level: 'strong' | 'moderate' | 'weak' }[];
  questionBreakdown?: {
    questionIndex: number;
    questionText: string;
    status: 'correct' | 'incorrect' | 'unattempted';
    studentAnswer: string | null;
    correctAnswer: string;
    points: number;
    explanation: string;
  }[];
}

export interface QuestionEvaluation {
  summary: string;
  difficultyRating: 'too_easy' | 'appropriate' | 'too_hard';
  qualityScore: number; // 1-10
  commonMistakes: string[];
  suggestions: string[];
  discriminationIndex: 'good' | 'fair' | 'poor';
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
