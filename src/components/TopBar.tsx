import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore';
import NotificationBell from './NotificationBell';
import { Sun, Moon, ChevronDown } from 'lucide-react';
import AccountMenu from './AccountMenu';
import { getPageTitle } from '../lib/pageTitles';

export default function TopBar() {
  const { firebaseUser, user } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();
  const location = useLocation();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  const pageTitle = getPageTitle(location.pathname) || 'LiveClass';

  const initials = user?.displayName
    ? user.displayName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

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
  const [prevPath, setPrevPath] = useState(location.pathname);
  if (prevPath !== location.pathname) {
    setPrevPath(location.pathname);
    setProfileOpen(false);
  }

  if (!firebaseUser) return null;

  return (
    <header className="hidden md:flex sticky top-0 z-40 h-14 items-center justify-between px-6 bg-white/80 dark:bg-[#1E1E1E]/80 backdrop-blur-md border-b border-gray-200 dark:border-white/10 pt-safe">
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
            <AccountMenu
              onClose={() => setProfileOpen(false)}
              className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-[#262626] rounded-xl shadow-lg border border-gray-200 dark:border-white/10 overflow-hidden animate-slide-down"
            />
          )}
        </div>
      </div>
    </header>
  );
}
