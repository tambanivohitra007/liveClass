import { Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useSidebarStore } from '../stores/sidebarStore';
import { ADMIN_EMAIL } from '../lib/config';
import logo from '../assets/logo.png';
import {
  LayoutDashboard,
  Users,
  FileText,
  BookOpen,
  ClipboardCheck,
  ListChecks,
  UserCheck,
  History,
  Compass,
  Gamepad2,
  Shield,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';

interface NavItem {
  label: string;
  icon: typeof LayoutDashboard;
  path: string;
  exact?: boolean;
  matchPrefix?: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const teacherSections: NavSection[] = [
  {
    title: 'Main',
    items: [
      { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard', exact: true },
    ],
  },
  {
    title: 'Content',
    items: [
      { label: 'Quizzes', icon: BookOpen, path: '/library', matchPrefix: '/library' },
      { label: 'Classes', icon: Users, path: '/classes', matchPrefix: '/class' },
      { label: 'Assignments', icon: FileText, path: '/assignment/new', matchPrefix: '/assignment' },
    ],
  },
  {
    title: 'Grading',
    items: [
      { label: 'Grade', icon: ClipboardCheck, path: '/grading/new', matchPrefix: '/grading' },
      { label: 'Rubrics', icon: ListChecks, path: '/rubrics', matchPrefix: '/rubric' },
      { label: 'Rosters', icon: UserCheck, path: '/rosters', matchPrefix: '/roster' },
    ],
  },
  {
    title: 'Activity',
    items: [
      { label: 'History', icon: History, path: '/history', exact: true },
      { label: 'Discover', icon: Compass, path: '/discover', exact: true },
      { label: 'Join Game', icon: Gamepad2, path: '/join', exact: true },
    ],
  },
];

const studentItems: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/student/dashboard', exact: true },
  { label: 'My Classes', icon: Users, path: '/student/classes', matchPrefix: '/student/class' },
  { label: 'Join Game', icon: Gamepad2, path: '/join', exact: true },
  { label: 'Discover', icon: Compass, path: '/discover', exact: true },
];

const adminItem: NavItem = { label: 'Admin', icon: Shield, path: '/admin', matchPrefix: '/admin' };

export default function Sidebar() {
  const { firebaseUser, user } = useAuthStore();
  const { collapsed, toggleSidebar } = useSidebarStore();
  const location = useLocation();

  if (!firebaseUser) return null;

  const isAdmin = user?.email === ADMIN_EMAIL;
  const isApprovedTeacher = user?.role === 'teacher' && (user.approvalStatus === 'approved' || isAdmin);

  const isItemActive = (item: NavItem) => {
    if (item.exact) return location.pathname === item.path;
    if (item.matchPrefix) return location.pathname.startsWith(item.matchPrefix);
    return location.pathname === item.path;
  };

  const renderNavItem = (item: NavItem) => {
    const active = isItemActive(item);
    const Icon = item.icon;

    return (
      <div key={item.path} className="relative group">
        <Link
          to={item.path}
          className={`flex items-center gap-3 no-underline transition-colors ${
            collapsed
              ? `w-10 h-10 mx-auto rounded-xl justify-center ${
                  active ? 'bg-brand/15 text-brand' : 'text-white/50 hover:text-white hover:bg-white/5'
                }`
              : `px-3 py-2.5 mx-2 rounded-xl ${
                  active
                    ? 'bg-brand/15 text-white border-l-3 border-brand'
                    : 'text-white/50 hover:text-white hover:bg-white/5'
                }`
          }`}
        >
          <Icon className="w-5 h-5 shrink-0" />
          {!collapsed && <span className="text-sm font-medium truncate">{item.label}</span>}
        </Link>
        {collapsed && (
          <div className="fixed left-[72px] px-2.5 py-1 bg-surface-card text-white text-xs rounded-lg border border-white/10 shadow-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
            {item.label}
          </div>
        )}
      </div>
    );
  };

  const renderSection = (section: NavSection, index: number) => (
    <div key={section.title} className={index > 0 ? 'mt-4' : ''}>
      {collapsed ? (
        index > 0 && <hr className="mx-4 my-2 border-white/10" />
      ) : (
        <p className="px-5 mb-1.5 text-[10px] uppercase tracking-widest text-white/30 select-none">
          {section.title}
        </p>
      )}
      <div className="flex flex-col gap-0.5">
        {section.items.map(renderNavItem)}
      </div>
    </div>
  );

  return (
    <aside
      className={`hidden md:flex fixed left-0 top-0 bottom-0 z-40 flex-col bg-[#080F1E]/95 backdrop-blur-md border-r border-white/10 transition-[width] duration-300 ease-in-out ${
        collapsed ? 'w-[68px]' : 'w-64'
      }`}
    >
      {/* Logo area */}
      <div className="h-14 flex items-center shrink-0 border-b border-white/10 px-4">
        <Link to="/" className="flex items-center gap-2.5 no-underline group overflow-hidden">
          <img
            src={logo}
            alt="LiveClass"
            className="w-8 h-8 rounded-lg shadow-sm group-hover:scale-105 transition-transform shrink-0"
          />
          {!collapsed && (
            <span className="font-bold text-xl text-white whitespace-nowrap">
              Live<span className="text-brand">Class</span>
            </span>
          )}
        </Link>
      </div>

      {/* Scrollable nav */}
      <div className={`flex-1 overflow-y-auto overflow-x-hidden py-4 ${collapsed ? 'scrollbar-none' : 'scrollbar-thin'}`}>
        {isApprovedTeacher ? (
          <>
            {teacherSections.map((section, i) => renderSection(section, i))}
            {isAdmin && (
              <div className="mt-4">
                {collapsed ? (
                  <hr className="mx-4 my-2 border-white/10" />
                ) : (
                  <p className="px-5 mb-1.5 text-[10px] uppercase tracking-widest text-white/30 select-none">
                    System
                  </p>
                )}
                <div className="flex flex-col gap-0.5">
                  {renderNavItem(adminItem)}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col gap-0.5">
            {studentItems.map(renderNavItem)}
            {isAdmin && (
              <>
                {collapsed ? (
                  <hr className="mx-4 my-3 border-white/10" />
                ) : (
                  <p className="px-5 mt-4 mb-1.5 text-[10px] uppercase tracking-widest text-white/30 select-none">
                    System
                  </p>
                )}
                {renderNavItem(adminItem)}
              </>
            )}
          </div>
        )}
      </div>

      {/* Bottom pinned area */}
      <div className="border-t border-white/10 p-2 shrink-0">
        {/* Collapse toggle */}
        <div className="relative group">
          <button
            onClick={toggleSidebar}
            className={`flex items-center gap-3 text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors ${
              collapsed
                ? 'w-10 h-10 mx-auto rounded-xl justify-center'
                : 'w-full px-3 py-2.5 rounded-xl'
            }`}
          >
            {collapsed ? (
              <ChevronsRight className="w-5 h-5 shrink-0" />
            ) : (
              <>
                <ChevronsLeft className="w-5 h-5 shrink-0" />
                <span className="text-sm font-medium">Collapse</span>
              </>
            )}
          </button>
          {collapsed && (
            <span className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-surface-card text-white text-xs rounded-lg border border-white/10 shadow-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
              Expand
            </span>
          )}
        </div>
      </div>
    </aside>
  );
}
