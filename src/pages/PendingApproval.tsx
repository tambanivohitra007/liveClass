import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useAuthStore } from '../stores/authStore';
import { useNavigate } from 'react-router-dom';
import { Clock, XCircle, LogOut } from 'lucide-react';
import logo from '../assets/logo.png';

export default function PendingApproval() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const isRejected = user?.approvalStatus === 'rejected';

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12 bg-linear-to-b from-[#E8EAF0] to-surface dark:from-surface-dark dark:to-surface-dark relative">
      <div className="absolute inset-0 pattern-dots pointer-events-none" />
      <div className="w-full max-w-md animate-fade-in">
        <div className="card-night p-8 text-center">
          <img src={logo} alt="LiveClass" className="w-14 h-14 rounded-2xl mx-auto mb-6" />

          {isRejected ? (
            <>
              <div className="w-16 h-16 bg-danger/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <XCircle className="w-8 h-8 text-danger" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Application Declined</h1>
              <p className="text-gray-500 dark:text-white/50 mb-8">
                Your teacher application has been declined. Please contact the administrator if you believe this is a mistake.
              </p>
            </>
          ) : (
            <>
              <div className="w-16 h-16 bg-warning/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Clock className="w-8 h-8 text-warning" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Awaiting Admin Approval</h1>
              <p className="text-gray-500 dark:text-white/50 mb-8">
                Your teacher account is pending approval. You'll be able to access teacher features once an administrator reviews your account.
              </p>
            </>
          )}

          <button
            onClick={() => signOut(auth).then(() => navigate('/'))}
            className="w-full py-3 bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-white/70 font-semibold rounded-xl hover:bg-gray-200 dark:hover:bg-white/20 transition-colors flex items-center justify-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            Log Out
          </button>
        </div>
      </div>
    </div>
  );
}
