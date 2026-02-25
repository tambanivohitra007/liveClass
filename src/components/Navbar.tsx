import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useAuthStore } from '../stores/authStore';
import { LayoutDashboard, LogOut, Settings, Shield, ChevronDown, Sun, Moon } from 'lucide-react';
import { ADMIN_EMAIL } from '../lib/config';
import { useThemeStore } from '../stores/themeStore';
import NotificationBell from './NotificationBell';
import logo from '../assets/logo.png';

export default function Navbar() {
  const { firebaseUser, user } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

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

  const isActive = (path: string) => location.pathname === path;
  const isAdmin = user?.email === ADMIN_EMAIL;
  const isApprovedTeacher = user?.role === 'teacher' && (user.approvalStatus === 'approved' || isAdmin);
  const dashboardPath = user?.role === 'student' ? '/student/dashboard' : '/dashboard';

  const initials = user?.displayName
    ? user.displayName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  const navLinkClass = (path: string) =>
    `px-3 py-2 rounded-lg text-sm font-medium transition-colors no-underline ${
      isActive(path)
        ? 'bg-brand/20 text-brand dark:text-white'
        : 'text-gray-500 dark:text-white/60 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10'
    }`;

  return (
    <nav className="bg-white/90 dark:bg-surface-dark/90 backdrop-blur-md border-b border-gray-200 dark:border-white/10 sticky top-0 z-50 shadow-sm dark:shadow-lg">
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5 no-underline group">
          <img src={logo} alt="LiveClass" className="w-8 h-8 rounded-lg shadow-sm group-hover:scale-105 transition-transform" />
          <span className="font-bold text-xl text-gray-900 dark:text-white">Live<span className="text-brand">Class</span></span>
        </Link>

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-1">
          {firebaseUser ? (
            <>
              {(user?.role === 'student' || isApprovedTeacher) && (
                <Link to={dashboardPath} className={navLinkClass(dashboardPath)}>
                  Dashboard
                </Link>
              )}
              {isApprovedTeacher && (
                <Link to="/classes" className={navLinkClass('/classes')}>
                  Classes
                </Link>
              )}
              {isApprovedTeacher && (
                <Link to="/history" className={navLinkClass('/history')}>
                  History
                </Link>
              )}
              {isAdmin && (
                <Link to="/admin" className={navLinkClass('/admin')}>
                  <span className="flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5" />
                    Admin
                  </span>
                </Link>
              )}
              <Link to="/discover" className={navLinkClass('/discover')}>
                Discover
              </Link>
              <Link to="/join" className={navLinkClass('/join')}>
                Join Game
              </Link>
              {user?.role === 'student' && (
                <Link to="/student/classes" className={navLinkClass('/student/classes')}>
                  My Classes
                </Link>
              )}
            </>
          ) : (
            <>
              <Link to="/discover" className={navLinkClass('/discover')}>
                Discover
              </Link>
              <Link to="/join" className={navLinkClass('/join')}>
                Join Game
              </Link>
              <Link
                to="/login"
                className="ml-2 btn-3d-cyan btn-3d-sm no-underline text-sm"
              >
                Sign In
              </Link>
            </>
          )}
        </div>

        {/* Notifications + Profile dropdown — visible on all breakpoints */}
        {firebaseUser ? (
          <div className="flex items-center gap-1">
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg text-gray-500 dark:text-white/50 hover:bg-gray-100 dark:hover:bg-white/10 hover:text-gray-900 dark:hover:text-white transition-colors"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun className="w-4.5 h-4.5" /> : <Moon className="w-4.5 h-4.5" />}
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
              <ChevronDown className={`w-3.5 h-3.5 text-gray-400 dark:text-white/40 transition-transform hidden md:block ${profileOpen ? 'rotate-180' : ''}`} />
            </button>

            {profileOpen && (
                <div className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-surface-card rounded-xl shadow-lg border border-gray-200 dark:border-white/10 overflow-hidden animate-slide-down">
                <div className="px-4 py-3 bg-gray-50 dark:bg-white/5 border-b border-gray-200 dark:border-white/10">
                  <p className="font-semibold text-gray-900 dark:text-white text-sm truncate">{user?.displayName || 'User'}</p>
                  <p className="text-xs text-gray-400 dark:text-white/40 truncate">{firebaseUser.email}</p>
                  {user?.role && (
                    <span className="inline-block mt-1.5 text-xs px-2 py-0.5 bg-brand/20 text-brand rounded-full font-medium capitalize">
                      {user.role}
                    </span>
                  )}
                </div>
                <div className="p-1.5">
                  <button
                    onClick={() => { setProfileOpen(false); navigate(dashboardPath); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-600 dark:text-white/70 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors text-left"
                  >
                    <LayoutDashboard className="w-4 h-4 text-gray-400 dark:text-white/40" />
                    Dashboard
                  </button>
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
        ) : (
          <Link
            to="/login"
            className="md:hidden btn-3d-cyan btn-3d-sm no-underline text-sm"
          >
            Sign In
          </Link>
        )}
      </div>
    </nav>
  );
}
