import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';
import { useToastStore } from '../../stores/toastStore';

export default function JoinClass() {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);
  const navigate = useNavigate();
  const { addToast } = useToastStore();
  const [searchParams] = useSearchParams();

  // Auto-fill from URL param
  useEffect(() => {
    const codeParam = searchParams.get('code');
    if (codeParam && /^[A-Za-z0-9]{6}$/.test(codeParam)) {
      setCode(codeParam.toUpperCase());
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (code.trim().length !== 6) {
      setError('Please enter a 6-character code.');
      return;
    }

    setJoining(true);
    try {
      const fn = httpsCallable<
        { code: string },
        { classroomId: string; name: string }
      >(functions, 'joinClassroom');
      const result = await fn({ code: code.trim().toUpperCase() });
      addToast('success', `Joined "${result.data.name}" successfully!`);
      navigate('/student/dashboard');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to join class';
      setError(msg);
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 bg-gradient-to-br from-brand-dark via-surface-dark to-surface-dark relative">
      <div className="absolute inset-0 pattern-grid pointer-events-none" />
      <div className="w-full max-w-sm animate-bounce-in">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-black text-white">Join Class</h1>
          <p className="text-white/60 mt-2 text-sm">Enter the code from your teacher</p>
        </div>

        <div className="bg-white rounded-3xl shadow-[4px_4px_0px_0px_#D4566B] border-2 border-gray-800 dark:border-gray-300 p-8">
          {error && (
            <div className="mb-4 p-3 bg-danger/10 border border-danger/20 rounded-xl text-danger text-sm text-center">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <label className="block text-center text-sm font-medium text-gray-500 mb-3">Class Join Code</label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6))}
              placeholder="ABC123"
              required
              maxLength={6}
              className="w-full text-center text-4xl font-black tracking-[0.3em] px-4 py-5 rounded-2xl border border-gray-200 focus:border-brand focus:ring-4 focus:ring-brand/20 outline-none transition-all text-gray-900 placeholder:text-gray-200 uppercase"
              autoFocus
            />
            <button
              type="submit"
              disabled={joining || code.trim().length !== 6}
              className="w-full mt-4 py-4 bg-brand text-white font-bold text-lg rounded-2xl border-2 border-gray-800 dark:border-gray-300 shadow-[4px_4px_0px_0px_#D4566B] hover:shadow-[6px_6px_0px_0px_#D4566B] hover:translate-x-[-2px] hover:translate-y-[-2px] transition-all duration-300 disabled:opacity-40 disabled:hover:shadow-[4px_4px_0px_0px_#D4566B] disabled:hover:translate-x-0 disabled:hover:translate-y-0 flex items-center justify-center gap-2"
            >
              {joining ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Joining...
                </>
              ) : 'Join Class'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
