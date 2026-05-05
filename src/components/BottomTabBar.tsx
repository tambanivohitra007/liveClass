import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore';
import { ADMIN_EMAIL } from '../lib/config';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import {
  LayoutDashboard,
  Users,
  BookOpen,
  Gamepad2,
  ClipboardCheck,
  Menu,
  X,
  FileText,
  ListChecks,
  UserCheck,
  Compass,
  History,
  Shield,
  Settings,
  Sun,
  Moon,
  LogOut,
} from 'lucide-react';

interface Tab {
  label: string;
  icon: typeof LayoutDashboard;
  path: string;
  exact?: boolean;
}

interface SheetItem {
  label: string;
  icon: typeof LayoutDashboard;
  path: string;
}

interface SheetSection {
  title: string;
  items: SheetItem[];
}

const teacherTabs: Tab[] = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard', exact: true },
  { label: 'Classes', icon: Users, path: '/classes' },
  { label: 'Quizzes', icon: BookOpen, path: '/library' },
  { label: 'Grading', icon: ClipboardCheck, path: '/grading/new', exact: true },
];

const studentTabs: Tab[] = [
  { label: 'Home', icon: LayoutDashboard, path: '/student/dashboard', exact: true },
  { label: 'Classes', icon: Users, path: '/student/classes' },
  { label: 'Join Game', icon: Gamepad2, path: '/join', exact: true },
];

const teacherSheetSections = (isAdmin: boolean): SheetSection[] => {
  const sections: SheetSection[] = [
    {
      title: 'Content',
      items: [
        { label: 'Assignments', icon: FileText, path: '/assignment/new' },
      ],
    },
    {
      title: 'Grading',
      items: [
        { label: 'Rubrics', icon: ListChecks, path: '/rubrics' },
        { label: 'Rosters', icon: UserCheck, path: '/rosters' },
      ],
    },
    {
      title: 'Activity',
      items: [
        { label: 'Discover', icon: Compass, path: '/discover' },
        { label: 'History', icon: History, path: '/history' },
        { label: 'Join Game', icon: Gamepad2, path: '/join' },
      ],
    },
  ];

  if (isAdmin) {
    sections.push({
      title: 'System',
      items: [{ label: 'Admin', icon: Shield, path: '/admin' }],
    });
  }

  return sections;
};

const studentSheetSections = (isAdmin: boolean): SheetSection[] => {
  const sections: SheetSection[] = [
    {
      title: 'Activity',
      items: [
        { label: 'Discover', icon: Compass, path: '/discover' },
      ],
    },
  ];

  if (isAdmin) {
    sections.push({
      title: 'System',
      items: [{ label: 'Admin', icon: Shield, path: '/admin' }],
    });
  }

  return sections;
};

export default function BottomTabBar() {
  const { firebaseUser, user } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [sheetOpen, setSheetOpen] = useState(false);

  // Close sheet on route change
  useEffect(() => {
    setSheetOpen(false);
  }, [location.pathname]);

  // Prevent body scroll when sheet is open
  useEffect(() => {
    if (sheetOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [sheetOpen]);

  const handleLogout = useCallback(async () => {
    setSheetOpen(false);
    await signOut(auth);
    navigate('/login');
  }, [navigate]);

  const handleSheetNav = useCallback((path: string) => {
    setSheetOpen(false);
    navigate(path);
  }, [navigate]);

  if (!firebaseUser) return null;

  const isAdmin = user?.email === ADMIN_EMAIL;
  const isApprovedTeacher =
    user?.role === 'teacher' &&
    (user.approvalStatus === 'approved' || user.email === ADMIN_EMAIL);

  const tabs = isApprovedTeacher ? teacherTabs : studentTabs;
  const sheetSections = isApprovedTeacher
    ? teacherSheetSections(isAdmin)
    : studentSheetSections(isAdmin);

  const isTabActive = (tab: Tab) => {
    if (tab.exact) return location.pathname === tab.path;
    return location.pathname.startsWith(tab.path);
  };

  return (
    <>
      {/* Sheet backdrop + panel */}
      {sheetOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 animate-[fadeIn_150ms_ease-out]"
            onClick={() => setSheetOpen(false)}
          />

          {/* Sheet */}
          <div className="absolute bottom-0 inset-x-0 bg-white dark:bg-surface-dark rounded-t-2xl animate-[slideUp_200ms_ease-out] max-h-[70vh] flex flex-col">
            {/* Handle bar */}
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-white/20" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-4 pb-3 border-b border-gray-100 dark:border-white/10 flex-shrink-0">
              <span className="text-base font-semibold text-gray-900 dark:text-white">More</span>
              <button
                onClick={() => setSheetOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 dark:text-white/40 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="overflow-y-auto flex-1 pb-6">
              {/* Nav sections */}
              {sheetSections.map((section) => (
                <div key={section.title} className="px-4 pt-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-white/30 mb-2 px-1">
                    {section.title}
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {section.items.map((item) => {
                      const Icon = item.icon;
                      const active = location.pathname.startsWith(item.path);
                      return (
                        <button
                          key={item.path}
                          onClick={() => handleSheetNav(item.path)}
                          className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl transition-colors ${
                            active
                              ? 'bg-brand/10 text-brand'
                              : 'text-gray-700 dark:text-white/70 hover:bg-gray-50 dark:hover:bg-white/5'
                          }`}
                        >
                          <Icon className="w-6 h-6" />
                          <span className="text-xs font-medium">{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Divider */}
              <div className="mx-4 mt-4 mb-2 border-t border-gray-100 dark:border-white/10" />

              {/* Common footer items */}
              <div className="px-4 grid grid-cols-3 gap-2">
                <button
                  onClick={() => handleSheetNav('/profile')}
                  className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl transition-colors ${
                    location.pathname === '/profile'
                      ? 'bg-brand/10 text-brand'
                      : 'text-gray-700 dark:text-white/70 hover:bg-gray-50 dark:hover:bg-white/5'
                  }`}
                >
                  <Settings className="w-6 h-6" />
                  <span className="text-xs font-medium">Settings</span>
                </button>

                <button
                  onClick={toggleTheme}
                  className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl text-gray-700 dark:text-white/70 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                >
                  {theme === 'dark' ? (
                    <Sun className="w-6 h-6" />
                  ) : (
                    <Moon className="w-6 h-6" />
                  )}
                  <span className="text-xs font-medium">
                    {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                  </span>
                </button>

                <button
                  onClick={handleLogout}
                  className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                >
                  <LogOut className="w-6 h-6" />
                  <span className="text-xs font-medium">Log Out</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bottom tab bar */}
      <div
        className="fixed bottom-0 inset-x-0 z-40 md:hidden bg-white dark:bg-surface-dark border-t border-gray-100 dark:border-white/10 shadow-[0_-2px_10px_rgba(0,0,0,0.06)] animate-tab-bar-enter"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="h-16 flex items-center justify-around">
          {tabs.map((tab) => {
            const active = isTabActive(tab);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.path}
                to={tab.path}
                className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full no-underline transition-colors ${
                  active
                    ? 'text-brand'
                    : 'text-gray-400 dark:text-white/40'
                }`}
              >
                <Icon
                  className={`w-5 h-5 spring-transition ${active ? 'scale-110' : ''}`}
                />
                <span className="text-[10px] font-medium leading-tight">{tab.label}</span>
                {active && (
                  <span className="w-1 h-1 rounded-full bg-brand mt-0.5" />
                )}
              </Link>
            );
          })}

          {/* More tab */}
          <button
            onClick={() => setSheetOpen((v) => !v)}
            className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors ${
              sheetOpen
                ? 'text-brand'
                : 'text-gray-400 dark:text-white/40'
            }`}
          >
            <Menu
              className={`w-5 h-5 spring-transition ${sheetOpen ? 'scale-110' : ''}`}
            />
            <span className="text-[10px] font-medium leading-tight">More</span>
            {sheetOpen && (
              <span className="w-1 h-1 rounded-full bg-brand mt-0.5" />
            )}
          </button>
        </div>
      </div>
    </>
  );
}
