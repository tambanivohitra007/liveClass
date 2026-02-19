import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useAuthStore } from '../stores/authStore';
import { LayoutDashboard, LogOut, Settings, Shield, ChevronDown } from 'lucide-react';
import { ADMIN_EMAIL } from '../lib/config';
import logo from '../assets/logo.png';

export default function Navbar() {
  const { firebaseUser, user } = useAuthStore();
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
        ? 'bg-white/15 text-white'
        : 'text-white/60 hover:text-white hover:bg-white/10'
    }`;

  return (
    <nav className="bg-gradient-to-r from-[#1A3263] via-[#1E2A5E] to-[#2A1F5E] border-b border-white/10 sticky top-0 z-50 shadow-lg">
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5 no-underline group">
          <img src={logo} alt="LiveClass" className="w-8 h-8 rounded-lg shadow-sm group-hover:scale-105 transition-transform" />
          <span className="font-bold text-xl text-white">Live<span className="text-brand">Class</span></span>
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
                <Link to="/join-class" className={navLinkClass('/join-class')}>
                  Join Class
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
                className="ml-2 px-4 py-2 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-dark transition-colors no-underline shadow-sm"
              >
                Sign In
              </Link>
            </>
          )}
        </div>

        {/* Profile dropdown — visible on all breakpoints */}
        {firebaseUser ? (
          <div ref={profileRef} className="relative md:ml-2">
            <button
              onClick={() => setProfileOpen(!profileOpen)}
              className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-xl hover:bg-white/10 transition-colors"
            >
              <div className="w-8 h-8 bg-gradient-to-br from-brand to-accent rounded-full flex items-center justify-center text-white text-xs font-bold shadow-sm">
                {initials}
              </div>
              <ChevronDown className={`w-3.5 h-3.5 text-white/40 transition-transform hidden md:block ${profileOpen ? 'rotate-180' : ''}`} />
            </button>

            {profileOpen && (
                <div className="absolute right-0 top-full mt-2 w-64 bg-gradient-to-b from-[#1A3263] via-[#1E2A5E] to-[#2A1F5E] rounded-sm shadow-lg border border-white/10 overflow-hidden animate-slide-down">
                <div className="px-4 py-3 bg-white/5 border-b border-white/10">
                  <p className="font-semibold text-white text-sm truncate">{user?.displayName || 'User'}</p>
                  <p className="text-xs text-white/40 truncate">{firebaseUser.email}</p>
                  {user?.role && (
                    <span className="inline-block mt-1.5 text-xs px-2 py-0.5 bg-brand/20 text-brand rounded-full font-medium capitalize">
                      {user.role}
                    </span>
                  )}
                </div>
                <div className="p-1.5">
                  <button
                    onClick={() => { setProfileOpen(false); navigate(dashboardPath); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/70 hover:bg-white/10 transition-colors text-left"
                  >
                    <LayoutDashboard className="w-4 h-4 text-white/40" />
                    Dashboard
                  </button>
                  <button
                    onClick={() => { setProfileOpen(false); navigate('/profile'); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/70 hover:bg-white/10 transition-colors text-left"
                  >
                    <Settings className="w-4 h-4 text-white/40" />
                    Profile Settings
                  </button>
                  <hr className="my-1 border-white/10" />
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
        ) : (
          <Link
            to="/login"
            className="md:hidden px-3 py-1.5 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand-dark transition-colors no-underline"
          >
            Sign In
          </Link>
        )}
      </div>
    </nav>
  );
}
