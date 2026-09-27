import { matchPath } from 'react-router-dom';

// One source for page names, used by the top bar heading (TopBar.tsx) and the window/tab title (App.tsx),
// so both always agree. Returns '' for pages without a name of their own.
const EXACT: Record<string, string> = {
  '/login': 'Sign In',
  '/signup': 'Sign Up',
  '/join': 'Join Game',
  '/join-class': 'Join Class',
  '/dashboard': 'Dashboard',
  '/library': 'My Quizzes',
  '/classes': 'Classes',
  '/assignment/new': 'Create Assignment',
  '/grading/new': 'New Grading Session',
  '/rubrics': 'Rubrics',
  '/rosters': 'Rosters',
  '/history': 'Session History',
  '/analytics': 'Analytics',
  '/discover': 'Discover',
  '/arcade': 'Arcade',
  '/mini-games': 'Mini Games',
  '/profile': 'Profile Settings',
  '/privacy': 'Privacy',
  '/terms': 'Terms',
  '/choose-role': 'Choose Role',
  '/pending-approval': 'Pending Approval',
  '/student/dashboard': 'Dashboard',
  '/student/classes': 'My Classes',
  '/admin': 'Admin Panel',
};

// Checked in order; the first match wins.
const PATTERNS: [string, string][] = [
  ['/quiz/:id/host', 'Host Session'],
  ['/quiz/:id/preview', 'Quiz Preview'],
  ['/quiz/:id/flashcards', 'Flashcards'],
  ['/quiz/:id/worksheet', 'Worksheet'],
  ['/quiz/:id', 'Quiz Editor'],
  ['/session/:id/results', 'Session Results'],
  ['/collection/:id', 'Collection'],
  ['/classroom/:id', 'Classroom'],
  ['/student/classroom/:id', 'Classroom'],
  ['/roster/:id', 'Roster'],
  ['/rubric/:id/host', 'Live Grading'],
  ['/rubric/:id', 'Rubric'],
  ['/live-grading/:id/results', 'Grading Results'],
  ['/live-grading/:id/:pid', 'Live Grading'],
  ['/grading/:id/results', 'Grading Results'],
  ['/grading/:id', 'Grading'],
  ['/assignment/:id', 'Assignment'],
  ['/play/:sid/:pid', 'Playing'],
  ['/mini-game/:type/host', 'Mini Game'],
  ['/mini-game/:id/results', 'Game Results'],
  ['/mini-game/:id/:pid', 'Mini Game'],
  ['/arcade/*', 'Arcade'],
  ['/admin/*', 'Admin Panel'],
];

export function getPageTitle(pathname: string): string {
  if (EXACT[pathname]) return EXACT[pathname];
  return PATTERNS.find(([pattern]) => matchPath(pattern, pathname))?.[1] ?? '';
}
