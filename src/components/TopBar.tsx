import { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useAuthStore } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore';
import NotificationBell from './NotificationBell';
import { Sun, Moon, LogOut, Settings, ChevronDown } from 'lucide-react';

function getPageTitle(pathname: string): string {
  const titles: Record<string, string> = {
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
    '/join': 'Join Game',
    '/profile': 'Profile Settings',
    '/student/dashboard': 'Dashboard',
    '/student/classes': 'My Classes',
    '/admin': 'Admin Panel',
  };
  if (titles[pathname]) return titles[pathname];

  if (pathname.startsWith('/collection/')) return 'Collection';
  if (pathname.startsWith('/classroom/')) return 'Classroom';
  if (pathname.startsWith('/student/classroom/')) return 'Classroom';
  if (pathname.startsWith('/session/') && pathname.endsWith('/results')) return 'Session Results';
  if (pathname.startsWith('/grading/') && pathname.endsWith('/results')) return 'Grading Results';
  if (pathname.startsWith('/admin/')) return 'Admin Panel';

  return 'LiveClass';
}

export default function TopBar() {
  const { firebaseUser, user } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  const pageTitle = getPageTitle(location.pathname);

  const initials = user?.displayName
    ? user.displayName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  const handleLogout = async () => {
    await signOut(auth);
    setProfileOpen(false);
    navigate('/');
  };

  // Close profile dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Close dropdown on route change
  useEffect(() => {
    setProfileOpen(false);
  }, [location.pathname]);

  if (!firebaseUser) return null;

  return (
    <header className="hidden md:flex sticky top-0 z-40 h-14 items-center justify-between px-6 bg-white/80 dark:bg-[#0F1729]/80 backdrop-blur-md border-b border-gray-200 dark:border-white/10 pt-safe">
      {/* Left: Page title */}
      <div>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">{pageTitle}</h1>
      </div>

      {/* Right: Theme + Notifications + Profile */}
      <div className="flex items-center gap-1">
        <button
          onClick={toggleTheme}
          className="p-2 rounded-xl text-gray-500 dark:text-white/50 hover:bg-gray-100 dark:hover:bg-white/10 hover:text-gray-700 dark:hover:text-white transition-colors"
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>

        <NotificationBell />

        <div ref={profileRef} className="relative">
          <button
            onClick={() => setProfileOpen(!profileOpen)}
            className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
          >
            <div className="w-8 h-8 bg-gradient-to-br from-brand to-gold rounded-full flex items-center justify-center text-white text-xs font-bold shadow-sm">
              {initials}
            </div>
            <ChevronDown className={`w-3.5 h-3.5 text-gray-400 dark:text-white/40 transition-transform ${profileOpen ? 'rotate-180' : ''}`} />
          </button>

          {profileOpen && (
            <div className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-[#162033] rounded-xl shadow-lg border border-gray-200 dark:border-white/10 overflow-hidden animate-slide-down">
              <div className="px-4 py-3 bg-gray-50 dark:bg-white/5 border-b border-gray-200 dark:border-white/10">
                <p className="font-semibold text-gray-900 dark:text-white text-sm truncate">{user?.displayName || 'User'}</p>
                <p className="text-xs text-gray-500 dark:text-white/40 truncate">{firebaseUser.email}</p>
                {user?.role && (
                  <span className="inline-block mt-1.5 text-xs px-2 py-0.5 bg-brand/20 text-brand rounded-full font-medium capitalize">
                    {user.role}
                  </span>
                )}
              </div>
              <div className="p-1.5">
                <button
                  onClick={() => { setProfileOpen(false); navigate('/profile'); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-600 dark:text-white/70 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors text-left"
                >
                  <Settings className="w-4 h-4 text-gray-400 dark:text-white/40" />
                  Profile Settings
                </button>
                <hr className="my-1 border-gray-200 dark:border-white/10" />
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-danger hover:bg-danger/10 transition-colors text-left"
                >
                  <LogOut className="w-4 h-4" />
                  Log out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
