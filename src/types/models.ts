export const COLLECTION_COLORS = [
  { key: 'brand',   label: 'Rose',   bg: 'bg-gradient-to-br from-[#E87B91] to-[#B94458]', text: 'text-brand' },
  { key: 'accent',  label: 'Orange', bg: 'bg-gradient-to-br from-[#FFB366] to-[#CC660E]', text: 'text-accent' },
  { key: 'success', label: 'Olive',  bg: 'bg-gradient-to-br from-[#8AAF5E] to-[#4A6331]', text: 'text-success' },
  { key: 'warning', label: 'Amber',  bg: 'bg-gradient-to-br from-[#FFC94D] to-[#D97706]', text: 'text-warning' },
  { key: 'info',    label: 'Blue',   bg: 'bg-gradient-to-br from-[#6B9AD4] to-[#2E5290]', text: 'text-info' },
  { key: 'purple',  label: 'Purple', bg: 'bg-gradient-to-br from-[#A78BFA] to-[#7C3AED]', text: 'text-[#8B5CF6]' },
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
  color?: CollectionColor;
  createdAt: number;
  updatedAt: number;
}

export type QuestionType = 'mcq' | 'tf' | 'short' | 'matching' | 'fill_blank' | 'ordering' | 'poll' | 'slide' | 'code_output';

export interface Question {
  id: string;
  quizId: string;
  type: QuestionType;
  text: string;
  imageUrl?: string;
  videoUrl?: string;
  options: string[];
  matchOptions?: string[];
  codeSnippet?: string;
  codeLanguage?: string;
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
  rotatingSetSize?: number;
}

export interface SessionPlayer {
  id: string;
  sessionId: string;
  userId?: string;
  nickname: string;
  avatar?: string;
  teamIndex?: number;
  questionSubset?: number[];
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

// --- Grading Types ---
export type CriterionType = 'numeric' | 'level' | 'checkbox';

export interface CriterionLevel {
  label: string;
  score: number;
}

export interface Criterion {
  id: string;
  name: string;
  type: CriterionType;
  maxScore: number;
  weight: number;
  order: number;
  levels?: CriterionLevel[];
}

export interface Rubric {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  isTemplate: boolean;
  totalMaxScore: number;
  criteriaCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface RosterStudent {
  id: string;
  name: string;
  studentNumber?: string;
  email?: string;
  order: number;
}

export interface Roster {
  id: string;
  ownerId: string;
  name: string;
  studentCount: number;
  classroomId?: string | null;
  createdAt: number;
  updatedAt: number;
}

export type GradingSourceType = 'session' | 'roster';
export type GradingSessionStatus = 'active' | 'completed';

export interface GradingSession {
  id: string;
  ownerId: string;
  name: string;
  rubricId: string;
  sourceType: GradingSourceType;
  sourceId: string;
  status: GradingSessionStatus;
  studentCount: number;
  gradedCount: number;
  avgScore?: number;
  avgPercentage?: number;
  createdAt: number;
  updatedAt: number;
}

export interface EvaluationScore {
  score: number;
  levelLabel?: string;
}

export interface EvaluationCriterionMeta {
  name: string;
  type: CriterionType;
  maxScore: number;
  weight: number;
}

export interface Evaluation {
  id: string;
  studentName: string;
  studentNumber?: string;
  totalScore: number;
  maxPossibleScore: number;
  percentage: number;
  comment: string;
  scores: Record<string, EvaluationScore>;
  criterionMeta?: Record<string, EvaluationCriterionMeta>;
  gradedAt: number;
  syncedAt?: number;
}

// --- Live Grading (Oral Presentations) ---

export type LiveGradingStatus = 'lobby' | 'live' | 'ended';

export interface LiveGrading {
  id: string;
  ownerId: string;
  rubricId: string;
  rubricName: string;
  pinCode: string;
  status: LiveGradingStatus;
  currentStudentIndex: number;
  studentOrder: string[];
  currentStudentId: string | null;
  joinLocked: boolean;
  createdAt: number;
  startedAt: number | null;
  endedAt: number | null;
}

export interface LiveGradingPlayer {
  id: string;
  nickname: string;
  avatar?: string;
  joinedAt: number;
  userId?: string;
}

export type NotificationType = 'new_assignment' | 'session_started' | 'class_joined' | 'class_removed';

export interface AppNotification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  createdAt: number;
  metadata: {
    classroomId?: string;
    classroomName?: string;
    assignmentId?: string;
    sessionId?: string;
    pinCode?: string;
    quizTitle?: string;
  };
}
