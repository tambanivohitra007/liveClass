import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { LogOut, Settings } from 'lucide-react';
import { auth } from '../lib/firebase';
import { useAuthStore } from '../stores/authStore';

/**
 * Account menu contents: who is signed in, Profile Settings and Log out. Positioned by the caller:
 * the web top bar's avatar dropdown, or the desktop app's title bar avatar (DesktopTitlebarActions).
 */
export default function AccountMenu({ className, onClose }: { className: string; onClose: () => void }) {
  const { firebaseUser, user } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut(auth);
    onClose();
    navigate('/');
  };

  return (
    <div className={className} role="menu" aria-label="Account">
      <div className="px-4 py-3 bg-gray-50 dark:bg-white/5 border-b border-gray-200 dark:border-white/10">
        <p className="font-semibold text-gray-900 dark:text-white text-sm truncate">{user?.displayName || 'User'}</p>
        <p className="text-xs text-gray-500 dark:text-white/40 truncate">{firebaseUser?.email}</p>
        {user?.role && (
          <span className="inline-block mt-1.5 text-xs px-2 py-0.5 bg-brand/20 text-brand rounded-full font-medium capitalize">
            {user.role}
          </span>
        )}
      </div>
      <div className="p-1.5">
        <button
          role="menuitem"
          onClick={() => { onClose(); navigate('/profile'); }}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-600 dark:text-white/70 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors text-left"
        >
          <Settings className="w-4 h-4 text-gray-400 dark:text-white/40" />
          Profile Settings
        </button>
        <hr className="my-1 border-gray-200 dark:border-white/10" />
        <button
          role="menuitem"
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-danger hover:bg-danger/10 transition-colors text-left"
        >
          <LogOut className="w-4 h-4" />
          Log out
        </button>
      </div>
    </div>
  );
}
