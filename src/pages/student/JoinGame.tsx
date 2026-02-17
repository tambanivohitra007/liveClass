import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../lib/firebase';

export default function JoinGame() {
  const [pin, setPin] = useState('');
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);
  const [step, setStep] = useState<'pin' | 'nickname'>('pin');
  const [sessionId, setSessionId] = useState('');
  const navigate = useNavigate();

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const sessionsRef = collection(db, 'sessions');
    const q = query(sessionsRef, where('pinCode', '==', pin), where('status', '!=', 'ended'));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      setError('No active game found with that PIN.');
      return;
    }

    const sessionDoc = snapshot.docs[0];
    if (sessionDoc.data().joinLocked) {
      setError('This game is locked. No more players can join.');
      return;
    }

    setSessionId(sessionDoc.id);
    setStep('nickname');
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setJoining(true);

    try {
      const joinFn = httpsCallable<
        { sessionId: string; nickname: string },
        { playerId: string; activeToken: string }
      >(functions, 'joinSession');
      const result = await joinFn({ sessionId, nickname });
      sessionStorage.setItem(`activeToken_${sessionId}`, result.data.activeToken);
      navigate(`/play/${sessionId}/${result.data.playerId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join');
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 bg-gradient-to-br from-brand-dark via-surface-dark to-surface-dark">
      <div className="w-full max-w-sm animate-bounce-in">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-black text-white">LiveClass</h1>
        </div>

        <div className="bg-white rounded-3xl shadow-2xl p-8">
          {error && (
            <div className="mb-4 p-3 bg-danger/10 border border-danger/20 rounded-xl text-danger text-sm text-center">
              {error}
            </div>
          )}

          {step === 'pin' ? (
            <form onSubmit={handlePinSubmit}>
              <label className="block text-center text-sm font-medium text-gray-500 mb-3">Enter Game PIN</label>
              <input
                type="text"
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                required
                maxLength={6}
                className="w-full text-center text-4xl font-black tracking-[0.3em] px-4 py-5 rounded-2xl border-2 border-gray-200 focus:border-brand focus:ring-4 focus:ring-brand/20 outline-none transition-all text-gray-900 placeholder:text-gray-200"
                autoFocus
              />
              <button
                type="submit"
                disabled={pin.length < 4}
                className="w-full mt-4 py-4 bg-brand text-white font-bold text-lg rounded-2xl hover:bg-brand-dark transition-all disabled:opacity-40 shadow-lg"
              >
                Enter
              </button>
            </form>
          ) : (
            <form onSubmit={handleJoin}>
              <label className="block text-center text-sm font-medium text-gray-500 mb-3">Choose a Nickname</label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Your nickname"
                required
                maxLength={20}
                className="w-full text-center text-2xl font-bold px-4 py-5 rounded-2xl border-2 border-gray-200 focus:border-brand focus:ring-4 focus:ring-brand/20 outline-none transition-all text-gray-900 placeholder:text-gray-300"
                autoFocus
              />
              <button
                type="submit"
                disabled={joining || !nickname.trim()}
                className="w-full mt-4 py-4 bg-success text-white font-bold text-lg rounded-2xl hover:brightness-110 transition-all disabled:opacity-40 shadow-lg"
              >
                {joining ? 'Joining...' : "Let's Go!"}
              </button>
              <button
                type="button"
                onClick={() => { setStep('pin'); setError(''); }}
                className="w-full mt-2 py-2 text-sm text-gray-400 hover:text-gray-600"
              >
                &larr; Change PIN
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
