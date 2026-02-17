import { useState } from 'react';
import { createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { useNavigate } from 'react-router-dom';

export default function Signup() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'teacher' | 'student'>('teacher');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const createUserDoc = async (uid: string, userEmail: string, name: string) => {
    await setDoc(doc(db, 'users', uid), {
      displayName: name,
      email: userEmail,
      role,
      createdAt: serverTimestamp(),
    });
  };

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await createUserDoc(cred.user.uid, email, displayName);
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed');
    }
  };

  const handleGoogleSignup = async () => {
    setError('');
    try {
      const cred = await signInWithPopup(auth, new GoogleAuthProvider());
      await createUserDoc(
        cred.user.uid,
        cred.user.email || '',
        cred.user.displayName || 'User'
      );
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google signup failed');
    }
  };

  return (
    <div>
      <h1>Create Account</h1>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <form onSubmit={handleEmailSignup}>
        <input
          type="text"
          placeholder="Display Name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
        />
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password (min 6 characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
        />
        <div>
          <label>
            <input
              type="radio"
              value="teacher"
              checked={role === 'teacher'}
              onChange={() => setRole('teacher')}
            />
            Teacher
          </label>
          <label>
            <input
              type="radio"
              value="student"
              checked={role === 'student'}
              onChange={() => setRole('student')}
            />
            Student
          </label>
        </div>
        <button type="submit">Sign Up</button>
      </form>
      <button onClick={handleGoogleSignup}>Sign up with Google</button>
      <p>Already have an account? <a href="/login">Log in</a></p>
    </div>
  );
}
