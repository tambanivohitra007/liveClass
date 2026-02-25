import { useState } from 'react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthStore } from '../stores/authStore';
import { ADMIN_EMAIL } from '../lib/config';
import { useNavigate, Navigate } from 'react-router-dom';
import WaveBackground from '../components/ui/WaveBackground';
import { GraduationCap, BookOpen } from 'lucide-react';
import logo from '../assets/logo.png';

export default function ChooseRole() {
  const { firebaseUser } = useAuthStore();
  const [role, setRole] = useState<'teacher' | 'student'>('student');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  if (!firebaseUser) return <Navigate to="/login" replace />;

  const handleContinue = async () => {
    setError('');
    setLoading(true);
    try {
      const isAdmin = firebaseUser.email === ADMIN_EMAIL;
      await setDoc(doc(db, 'users', firebaseUser.uid), {
        displayName: firebaseUser.displayName || 'User',
        email: firebaseUser.email || '',
        role,
        ...(role === 'teacher' ? { approvalStatus: isAdmin ? 'approved' : 'pending' } : {}),
        createdAt: serverTimestamp(),
      });
      navigate(role === 'teacher' ? '/pending-approval' : '/student/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create account');
    } finally {
      setLoading(false);
    }
  };

  const roles = [
    { key: 'teacher' as const, label: 'Teacher', description: 'Create quizzes and host live sessions', icon: GraduationCap },
    { key: 'student' as const, label: 'Student', description: 'Join games and complete assignments', icon: BookOpen },
  ];

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12 bg-linear-to-b from-[#E8EAF0] to-surface dark:from-surface-dark dark:to-surface-dark relative overflow-hidden">
      <WaveBackground variant="light" position="bottom" />
      <div className="absolute inset-0 pattern-dots pointer-events-none" />

      <div className="relative z-10 w-full max-w-md animate-fade-in">
        {/* Header */}
        <div className="text-center mb-8">
          <img src={logo} alt="LiveClass" className="w-16 h-16 rounded-2xl mx-auto mb-4 border-2 border-gray-800 dark:border-white/20 shadow-sm" />
          <h1 className="text-3xl font-black text-gray-900 dark:text-white">Choose your role</h1>
          <p className="text-gray-500 dark:text-white/50 mt-1 font-medium">How will you use LiveClass?</p>
        </div>

        {/* Card */}
        <div className="relative group">
          <div className="absolute inset-0 bg-white dark:bg-white/5 rounded-3xl border-2 border-gray-800 dark:border-white/20 shadow-sm transition-shadow duration-300 group-hover:shadow-md" />

          <div className="relative p-8">
            {error && (
              <div className="mb-5 p-3 bg-white dark:bg-white/5 rounded-xl border-2 border-gray-800 dark:border-white/20 shadow-sm text-danger text-sm font-bold text-center animate-fade-in">
                {error}
              </div>
            )}

            <div className="space-y-3 mb-6">
              {roles.map((r) => {
                const Icon = r.icon;
                const active = role === r.key;
                return (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => setRole(r.key)}
                    className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 font-bold transition-all duration-300 text-left ${
                      active
                        ? 'border-gray-800 dark:border-white/20 bg-brand/10 text-gray-900 dark:text-white shadow-sm'
                        : 'border-gray-300 dark:border-white/20 text-gray-400 dark:text-white/50 hover:border-gray-800 dark:hover:border-white/30 hover:text-gray-600 dark:hover:text-white/70 shadow-[2px_2px_0px_0px_rgba(107,114,128,0.2)]'
                    }`}
                  >
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center border-2 ${
                      active ? 'border-gray-800 dark:border-white/20 bg-brand/20 text-brand' : 'border-gray-300 dark:border-white/20 bg-gray-100 dark:bg-white/10 text-gray-400 dark:text-white/40'
                    }`}>
                      <Icon className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="text-base">{r.label}</div>
                      <div className={`text-xs font-medium ${active ? 'text-gray-500 dark:text-white/60' : 'text-gray-400 dark:text-white/40'}`}>{r.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>

            <button
              onClick={handleContinue}
              disabled={loading}
              className="btn-3d-cyan w-full text-lg disabled:opacity-50"
            >
              {loading ? 'Setting up...' : 'Continue'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
