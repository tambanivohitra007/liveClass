import { Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { ADMIN_EMAIL } from '../lib/config';
import { LayoutDashboard, Users, History, User, Gamepad2 } from 'lucide-react';

interface Tab {
  label: string;
  icon: typeof LayoutDashboard;
  path: string;
  exact?: boolean;
}

const teacherTabs: Tab[] = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard', exact: true },
  { label: 'Classes', icon: Users, path: '/classes' },
  { label: 'History', icon: History, path: '/history', exact: true },
  { label: 'Profile', icon: User, path: '/profile', exact: true },
];

const studentTabs: Tab[] = [
  { label: 'Home', icon: LayoutDashboard, path: '/student/dashboard', exact: true },
  { label: 'Classes', icon: Users, path: '/student/classes' },
  { label: 'Join Game', icon: Gamepad2, path: '/join', exact: true },
  { label: 'Profile', icon: User, path: '/profile', exact: true },
];

export default function BottomTabBar() {
  const { firebaseUser, user } = useAuthStore();
  const location = useLocation();

  if (!firebaseUser) return null;

  const isApprovedTeacher =
    user?.role === 'teacher' &&
    (user.approvalStatus === 'approved' || user.email === ADMIN_EMAIL);

  const tabs = isApprovedTeacher ? teacherTabs : studentTabs;

  const isTabActive = (tab: Tab) => {
    if (tab.exact) return location.pathname === tab.path;
    return location.pathname.startsWith(tab.path);
  };

  return (
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
      </div>
    </div>
  );
}
