import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useAuthStore } from '../stores/authStore';
import { Menu, X, LayoutDashboard, LogOut, User, ChevronDown, Settings } from 'lucide-react';

export default function Navbar() {
  const { firebaseUser, user } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  const handleLogout = async () => {
    await signOut(auth);
    setProfileOpen(false);
    setMobileOpen(false);
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

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
    setProfileOpen(false);
  }, [location.pathname]);

  const isActive = (path: string) => location.pathname === path;
  const dashboardPath = user?.role === 'student' ? '/student/dashboard' : '/dashboard';

  const initials = user?.displayName
    ? user.displayName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  return (
    <nav className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5 no-underline">
          <div className="w-8 h-8 bg-gradient-to-br from-brand to-brand-dark rounded-lg flex items-center justify-center shadow-sm">
            <span className="text-white font-bold text-sm">LC</span>
          </div>
          <span className="font-bold text-xl text-gray-900">LiveClass</span>
        </Link>

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-1">
          {firebaseUser ? (
            <>
              <Link
                to={dashboardPath}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors no-underline ${
                  isActive(dashboardPath) ? 'bg-brand/10 text-brand' : 'text-gray-600 hover:text-brand hover:bg-gray-50'
                }`}
              >
                Dashboard
              </Link>
              <Link
                to="/join"
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors no-underline ${
                  isActive('/join') ? 'bg-brand/10 text-brand' : 'text-gray-600 hover:text-brand hover:bg-gray-50'
                }`}
              >
                Join Game
              </Link>

              {/* Profile Dropdown */}
              <div ref={profileRef} className="relative ml-2">
                <button
                  onClick={() => setProfileOpen(!profileOpen)}
                  className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  <div className="w-8 h-8 bg-gradient-to-br from-brand to-accent rounded-full flex items-center justify-center text-white text-xs font-bold">
                    {initials}
                  </div>
                  <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${profileOpen ? 'rotate-180' : ''}`} />
                </button>

                {profileOpen && (
                  <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden animate-slide-down">
                    <div className="px-4 py-3 border-b border-gray-100">
                      <p className="font-semibold text-gray-900 text-sm truncate">{user?.displayName || 'User'}</p>
                      <p className="text-xs text-gray-400 truncate">{firebaseUser.email}</p>
                      {user?.role && (
                        <span className="inline-block mt-1.5 text-xs px-2 py-0.5 bg-brand/10 text-brand rounded-full font-medium capitalize">
                          {user.role}
                        </span>
                      )}
                    </div>
                    <div className="p-1.5">
                      <button
                        onClick={() => { setProfileOpen(false); navigate(dashboardPath); }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left"
                      >
                        <LayoutDashboard className="w-4 h-4 text-gray-400" />
                        Dashboard
                      </button>
                      <button
                        onClick={() => { setProfileOpen(false); navigate('/profile'); }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left"
                      >
                        <Settings className="w-4 h-4 text-gray-400" />
                        Profile Settings
                      </button>
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-danger hover:bg-danger/5 transition-colors text-left"
                      >
                        <LogOut className="w-4 h-4" />
                        Log out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <Link
                to="/join"
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors no-underline ${
                  isActive('/join') ? 'bg-brand/10 text-brand' : 'text-gray-600 hover:text-brand hover:bg-gray-50'
                }`}
              >
                Join Game
              </Link>
              <Link
                to="/login"
                className="ml-1 px-4 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-dark transition-colors no-underline"
              >
                Sign In
              </Link>
            </>
          )}
        </div>

        {/* Mobile Hamburger */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
        >
          {mobileOpen ? <X className="w-5 h-5 text-gray-700" /> : <Menu className="w-5 h-5 text-gray-700" />}
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-gray-100 bg-white animate-slide-down">
          <div className="px-4 py-3 space-y-1">
            {firebaseUser ? (
              <>
                <div className="flex items-center gap-3 px-3 py-3 mb-2">
                  <div className="w-10 h-10 bg-gradient-to-br from-brand to-accent rounded-full flex items-center justify-center text-white text-sm font-bold">
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 text-sm truncate">{user?.displayName || 'User'}</p>
                    <p className="text-xs text-gray-400 truncate">{firebaseUser.email}</p>
                  </div>
                </div>
                <Link to={dashboardPath} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 no-underline">
                  <LayoutDashboard className="w-4 h-4 text-gray-400" />
                  Dashboard
                </Link>
                <Link to="/join" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 no-underline">
                  <User className="w-4 h-4 text-gray-400" />
                  Join Game
                </Link>
                <Link to="/profile" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 no-underline">
                  <Settings className="w-4 h-4 text-gray-400" />
                  Profile Settings
                </Link>
                <hr className="my-2 border-gray-100" />
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-danger hover:bg-danger/5 transition-colors text-left"
                >
                  <LogOut className="w-4 h-4" />
                  Log out
                </button>
              </>
            ) : (
              <>
                <Link to="/join" className="block px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 no-underline">
                  Join Game
                </Link>
                <Link to="/login" className="block px-3 py-2.5 rounded-lg text-sm font-medium text-brand hover:bg-brand/5 no-underline">
                  Sign In
                </Link>
                <Link to="/signup" className="block mt-1 px-3 py-2.5 rounded-lg text-sm font-medium text-center bg-brand text-white no-underline">
                  Get Started Free
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
