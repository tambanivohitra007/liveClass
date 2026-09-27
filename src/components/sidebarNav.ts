// Navigation entries shared by the web sidebar (Sidebar.tsx) and the desktop app's navigation pane
// (DesktopSidebar.tsx).
import {
  LayoutDashboard,
  Users,
  FileText,
  BookOpen,
  ClipboardCheck,
  ListChecks,
  UserCheck,
  History,
  BarChart3,
  Compass,
  Gamepad2,
  Shield,
  Trophy,
} from 'lucide-react';

export interface NavItem {
  label: string;
  icon: typeof LayoutDashboard;
  path: string;
  exact?: boolean;
  matchPrefix?: string;
  color?: string;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const teacherSections: NavSection[] = [
  {
    title: 'Main',
    items: [
      { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard', exact: true, color: 'blue' },
    ],
  },
  {
    title: 'Content',
    items: [
      { label: 'Classes', icon: Users, path: '/classes', matchPrefix: '/class', color: 'orange' },
      { label: 'Quizzes', icon: BookOpen, path: '/library', matchPrefix: '/library', color: 'purple' },
      { label: 'Assignments', icon: FileText, path: '/assignment/new', matchPrefix: '/assignment', color: 'pink' },
    ],
  },
  {
    title: 'Mini Games',
    items: [
      { label: 'Arcade', icon: Trophy, path: '/arcade', matchPrefix: '/arcade', color: 'amber' },
      { label: 'All Games', icon: Gamepad2, path: '/mini-games', exact: true, color: 'blue' },
    ],
  },
  {
    title: 'Grading',
    items: [
      { label: 'Grade', icon: ClipboardCheck, path: '/grading/new', matchPrefix: '/grading', color: 'emerald' },
      { label: 'Rubrics', icon: ListChecks, path: '/rubrics', matchPrefix: '/rubric', color: 'emerald' },
      { label: 'Rosters', icon: UserCheck, path: '/rosters', matchPrefix: '/roster', color: 'emerald' },
    ],
  },
  {
    title: 'Activity',
    items: [
      { label: 'Discover', icon: Compass, path: '/discover', exact: true, color: 'amber' },
      { label: 'History', icon: History, path: '/history', exact: true, color: 'amber' },
      { label: 'Analytics', icon: BarChart3, path: '/analytics', exact: true, color: 'cyan' },
      { label: 'Join Game', icon: Gamepad2, path: '/join', exact: true, color: 'blue' },
    ],
  },
];

export const studentItems: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/student/dashboard', exact: true, color: 'blue' },
  { label: 'My Classes', icon: Users, path: '/student/classes', matchPrefix: '/student/class', color: 'orange' },
  { label: 'Discover', icon: Compass, path: '/discover', exact: true, color: 'amber' },
  { label: 'Join Game', icon: Gamepad2, path: '/join', exact: true, color: 'purple' },
];

export const adminItem: NavItem = { label: 'Admin', icon: Shield, path: '/admin', matchPrefix: '/admin', color: 'rose' };

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.path;
  if (item.matchPrefix) return pathname.startsWith(item.matchPrefix);
  return pathname === item.path;
}
