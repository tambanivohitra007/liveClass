import { useState } from 'react';
import { createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { useNavigate, Link } from 'react-router-dom';
import ValidatedInput from '../components/ValidatedInput';
import WaveBackground from '../components/ui/WaveBackground';
import { GraduationCap, BookOpen } from 'lucide-react';
import logo from '../assets/logo.png';

export default function Signup() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'teacher' | 'student'>('teacher');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const createUserDoc = async (uid: string, userEmail: string, name: string) => {
    await setDoc(doc(db, 'users', uid), {
      displayName: name,
      email: userEmail,
      role,
      ...(role === 'teacher' ? { approvalStatus: 'pending' } : {}),
      createdAt: serverTimestamp(),
    });
  };

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await createUserDoc(cred.user.uid, email, displayName);
      navigate(role === 'teacher' ? '/pending-approval' : '/student/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignup = async () => {
    setError('');
    setLoading(true);
    try {
      const cred = await signInWithPopup(auth, new GoogleAuthProvider());
      await createUserDoc(
        cred.user.uid,
        cred.user.email || '',
        cred.user.displayName || 'User'
      );
      navigate(role === 'teacher' ? '/pending-approval' : '/student/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google signup failed');
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
          <img src={logo} alt="LiveClass" className="w-16 h-16 rounded-2xl mx-auto mb-4 shadow-lg animate-glow-pulse" />
          <h1 className="text-3xl text-white">Create your account</h1>
          <p className="text-white/50 mt-1 font-medium">Start creating quizzes in minutes</p>
        </div>

        {/* Card */}
        <div className="card-night p-8">
          {/* Error */}
          {error && (
            <div className="mb-5 p-3 bg-danger/10 rounded-xl border border-danger/30 text-danger text-sm font-bold text-center animate-fade-in">
              {error}
            </div>
          )}

          {/* Google */}
          <button
            onClick={handleGoogleSignup}
            disabled={loading}
            className="btn-3d-ghost w-full flex items-center justify-center gap-3 mb-6 disabled:opacity-50"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>

          {/* Divider */}
          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/10" />
            </div>
            <div className="relative flex justify-center">
              <span className="px-4 bg-surface-card text-xs font-bold text-white/40 uppercase tracking-widest">or</span>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleEmailSignup} className="space-y-4">
            <ValidatedInput
              label="Display Name"
              value={displayName}
              onChange={setDisplayName}
              placeholder="Your name"
              required
            />
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
              placeholder="Min 6 characters"
              required
              minLength={6}
            />

            {/* Role selector */}
            <div>
              <label className="block text-sm font-bold text-white/60 mb-2">I am a</label>
              <div className="grid grid-cols-2 gap-3">
                {([
                  { key: 'teacher' as const, label: 'Teacher', icon: GraduationCap },
                  { key: 'student' as const, label: 'Student', icon: BookOpen },
                ]).map((r) => {
                  const Icon = r.icon;
                  const active = role === r.key;
                  return (
                    <button
                      key={r.key}
                      type="button"
                      onClick={() => setRole(r.key)}
                      className={`flex items-center justify-center gap-2 py-3.5 rounded-2xl border font-bold transition-all duration-300 ${
                        active
                          ? 'border-brand bg-brand/15 text-brand'
                          : 'border-white/10 text-white/40 hover:border-white/20 hover:text-white/60'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {r.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-3d-cyan w-full text-lg disabled:opacity-50"
            >
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>
        </div>

        {/* Footer link */}
        <p className="text-center mt-8 text-sm text-white/40 font-medium">
          Already have an account?{' '}
          <Link to="/login" className="text-brand font-bold hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
