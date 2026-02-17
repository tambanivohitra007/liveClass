import { Link, useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useAuthStore } from '../stores/authStore';

export default function Navbar() {
  const { firebaseUser, user } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/');
  };

  return (
    <nav className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 no-underline">
          <div className="w-8 h-8 bg-brand rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">LC</span>
          </div>
          <span className="font-bold text-xl text-gray-900">LiveClass</span>
        </Link>

        <div className="flex items-center gap-3">
          {firebaseUser ? (
            <>
              <Link
                to="/dashboard"
                className="text-sm font-medium text-gray-600 hover:text-brand transition-colors no-underline"
              >
                Dashboard
              </Link>
              <span className="text-sm text-gray-400">
                {user?.displayName || firebaseUser.email}
              </span>
              <button
                onClick={handleLogout}
                className="text-sm px-3 py-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <Link
                to="/join"
                className="text-sm font-medium text-gray-600 hover:text-brand transition-colors no-underline"
              >
                Join Game
              </Link>
              <Link
                to="/login"
                className="text-sm px-4 py-2 rounded-lg bg-brand text-white font-medium hover:bg-brand-dark transition-colors no-underline"
              >
                Sign In
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
