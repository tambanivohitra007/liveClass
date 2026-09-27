import { useState, useEffect } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { getAuthErrorMessage } from '../lib/authErrors';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import ValidatedInput from '../components/ValidatedInput';
import WaveBackground from '../components/ui/WaveBackground';
import logo from '../assets/logo.png';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [waitingForAuth, setWaitingForAuth] = useState(false);
  const navigate = useNavigate();
  const { user, firebaseUser, loading: authLoading } = useAuthStore();

  // Brand-new LiveClass server: nobody can sign in yet, so start with the administrator account.
  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((c: { needsSetup?: boolean }) => {
        if (c.needsSetup) navigate('/signup', { replace: true });
      })
      .catch(() => {});
  }, [navigate]);

  // Redirect after auth state settles
  useEffect(() => {
    if (!waitingForAuth || authLoading) return;
    if (!firebaseUser) return;
    if (user) {
      navigate(user.role === 'student' ? '/student/dashboard' : '/dashboard', { replace: true });
      setWaitingForAuth(false);
    }
  }, [waitingForAuth, authLoading, firebaseUser, user]);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      setWaitingForAuth(true);
    } catch (err) {
      setError(getAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12 bg-surface relative overflow-hidden">
      <WaveBackground variant="dark" position="bottom" />
      <div className="absolute inset-0 pattern-stars pointer-events-none" />

      <div className="relative z-10 w-full max-w-md animate-fade-in">
        {/* Header */}
        <div className="text-center mb-8">
          <img src={logo} alt="LiveClass" className="w-16 h-16 rounded-2xl mx-auto mb-4 shadow-lg" />
          <h1 className="text-3xl text-gray-900 dark:text-white">Welcome back</h1>
          <p className="text-gray-500 dark:text-white/50 mt-1 font-medium">Sign in to your account</p>
        </div>

        {/* Card */}
        <div className="card-night p-8">
          {/* Error */}
          {error && (
            <div className="mb-5 p-3 bg-danger/10 rounded-xl border border-danger/30 text-danger text-sm font-bold text-center animate-fade-in">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleEmailLogin} className="space-y-4">
            <ValidatedInput
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="you@example.com"
              required
            />
            <ValidatedInput
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="Enter password"
              required
              minLength={6}

            />
            <button
              type="submit"
              disabled={loading}
              className="btn-3d-cyan w-full text-lg disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>

        {/* Footer link */}
        <p className="text-center mt-8 text-sm text-gray-400 dark:text-white/40 font-medium">
          Don't have an account?{' '}
          <Link to="/signup" className="text-brand font-bold hover:underline">Sign up</Link>
        </p>

        {/* Legal links */}
        <p className="text-center mt-3 text-xs text-gray-400 dark:text-white/30">
          <Link to="/privacy" className="hover:underline">Privacy Policy</Link>
          {' · '}
          <Link to="/terms" className="hover:underline">Terms of Service</Link>
        </p>
      </div>
    </div>
  );
}
