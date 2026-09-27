import { useEffect, useState } from 'react';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { ADMIN_EMAIL } from '../lib/config';
import { getAuthErrorMessage } from '../lib/authErrors';
import { useNavigate, Link } from 'react-router-dom';
import ValidatedInput from '../components/ValidatedInput';
import WaveBackground from '../components/ui/WaveBackground';
import { GraduationCap, BookOpen } from 'lucide-react';
import logo from '../assets/logo.png';
import { isDesktopApp } from '../lib/platform';

export default function Signup() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'teacher' | 'student'>('teacher');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [firstAccount, setFirstAccount] = useState(false);

  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((c: { needsSetup?: boolean }) => setFirstAccount(!!c.needsSetup))
      .catch(() => {});
  }, []);

  const createUserDoc = async (uid: string, userEmail: string, name: string) => {
    // The first account on a LiveClass server is its administrator and needs no approval.
    const isAdmin = !!ADMIN_EMAIL && userEmail.trim().toLowerCase() === ADMIN_EMAIL;
    await setDoc(doc(db, 'users', uid), {
      displayName: name,
      email: userEmail,
      role: isAdmin ? 'teacher' : role,
      ...(isAdmin ? { approvalStatus: 'approved' } : role === 'teacher' ? { approvalStatus: 'pending' } : {}),
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
      const isAdmin = cred.user.email === ADMIN_EMAIL;
      navigate(isAdmin ? '/dashboard' : role === 'teacher' ? '/pending-approval' : '/student/dashboard');
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
          <h1 className="text-3xl text-gray-900 dark:text-white">{firstAccount ? 'Welcome to LiveClass!' : 'Create your account'}</h1>
          <p className="text-gray-500 dark:text-white/50 mt-1 font-medium">
            {firstAccount
              ? 'This first account will be the administrator of this LiveClass server.'
              : 'Start creating quizzes in minutes'}
          </p>
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

            {/* Role selector. The desktop app is the teacher's computer (students join from their own
                devices), so every account created there is a teacher account. */}
            {!isDesktopApp && <div>
              <label className="block text-sm font-bold text-gray-500 dark:text-white/60 mb-2">I am a</label>
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
                          : 'border-gray-200 dark:border-white/10 text-gray-400 dark:text-white/40 hover:border-gray-300 dark:hover:border-white/20 hover:text-gray-500 dark:hover:text-white/60'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {r.label}
                    </button>
                  );
                })}
              </div>
            </div>}

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
        <p className="text-center mt-8 text-sm text-gray-400 dark:text-white/40 font-medium">
          Already have an account?{' '}
          <Link to="/login" className="text-brand font-bold hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
