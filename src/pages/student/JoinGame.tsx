import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../lib/firebase';
import { Shuffle, Triangle, Diamond, Circle, Square } from 'lucide-react';

const ADJECTIVES = [
  'Swift', 'Brave', 'Clever', 'Mighty', 'Cosmic', 'Lucky', 'Epic', 'Jolly',
  'Sneaky', 'Funky', 'Turbo', 'Mega', 'Super', 'Hyper', 'Ultra', 'Blazing',
  'Chill', 'Witty', 'Daring', 'Fierce', 'Gentle', 'Happy', 'Icy', 'Keen',
  'Noble', 'Quick', 'Rapid', 'Silent', 'Tiny', 'Vivid', 'Wild', 'Zen',
];
const NOUNS = [
  'Panda', 'Fox', 'Eagle', 'Tiger', 'Dolphin', 'Phoenix', 'Dragon', 'Wolf',
  'Falcon', 'Ninja', 'Pirate', 'Wizard', 'Knight', 'Robot', 'Rocket', 'Star',
  'Comet', 'Lion', 'Owl', 'Shark', 'Koala', 'Penguin', 'Otter', 'Raven',
  'Hawk', 'Bear', 'Lynx', 'Moose', 'Cobra', 'Viper', 'Crab', 'Yeti',
];

function randomNickname(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${adj}${noun}`;
}

const SHAPES = ['triangle', 'diamond', 'circle', 'square'] as const;
const SHAPE_COLORS = ['#EF4444', '#3B82F6', '#EAB308', '#22C55E'];
const ShapeIcon = ({ shape, color, size = 'w-8 h-8' }: { shape: string; color: string; size?: string }) => {
  const cls = `${size}`;
  switch (shape) {
    case 'triangle': return <Triangle className={cls} style={{ color }} fill={color} />;
    case 'diamond': return <Diamond className={cls} style={{ color }} fill={color} />;
    case 'circle': return <Circle className={cls} style={{ color }} fill={color} />;
    case 'square': return <Square className={cls} style={{ color }} fill={color} />;
    default: return null;
  }
};

function generatePattern() {
  // Create a 3-item pattern as the target
  const target = Array.from({ length: 3 }, () => ({
    shape: SHAPES[Math.floor(Math.random() * SHAPES.length)],
    color: SHAPE_COLORS[Math.floor(Math.random() * SHAPE_COLORS.length)],
  }));

  // Create 4 choices: 1 correct + 3 wrong
  const choices = [target];
  while (choices.length < 4) {
    const alt = Array.from({ length: 3 }, () => ({
      shape: SHAPES[Math.floor(Math.random() * SHAPES.length)],
      color: SHAPE_COLORS[Math.floor(Math.random() * SHAPE_COLORS.length)],
    }));
    // Make sure it's different from target
    const key = (p: typeof target) => p.map((s) => `${s.shape}-${s.color}`).join(',');
    if (key(alt) !== key(target) && !choices.some((c) => key(c) === key(alt))) {
      choices.push(alt);
    }
  }

  // Shuffle choices
  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }

  return { target, choices };
}

export default function JoinGame() {
  const [pin, setPin] = useState('');
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);
  const [step, setStep] = useState<'pin' | 'verify' | 'nickname'>('pin');
  const [sessionId, setSessionId] = useState('');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const pattern = useMemo(() => generatePattern(), [step === 'verify' ? sessionId : null]); // eslint-disable-line

  // Auto-fill and auto-submit PIN from URL query param (e.g. /join?pin=123456)
  useEffect(() => {
    const pinParam = searchParams.get('pin');
    if (pinParam && /^\d{4,6}$/.test(pinParam) && step === 'pin') {
      setPin(pinParam);
      // Auto-submit: look up the session
      (async () => {
        const sessionsRef = collection(db, 'sessions');
        const q = query(sessionsRef, where('pinCode', '==', pinParam), where('status', '!=', 'ended'));
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
        setStep('verify');
      })();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleVerify = (choiceIdx: number) => {
    const key = (p: typeof pattern.target) => p.map((s) => `${s.shape}-${s.color}`).join(',');
    if (key(pattern.choices[choiceIdx]) === key(pattern.target)) {
      setStep('nickname');
      setError('');
    } else {
      setError('Wrong pattern! Try again.');
    }
  };

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
    setStep('verify');
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

          {step === 'verify' ? (
            <div>
              <label className="block text-center text-sm font-medium text-gray-500 mb-4">Pick the matching pattern</label>
              <div className="flex justify-center gap-2 mb-6 p-4 bg-gray-50 rounded-xl">
                {pattern.target.map((s, i) => (
                  <ShapeIcon key={i} shape={s.shape} color={s.color} size="w-10 h-10" />
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {pattern.choices.map((choice, ci) => (
                  <button
                    key={ci}
                    onClick={() => handleVerify(ci)}
                    className="flex justify-center gap-1.5 p-4 rounded-xl border-2 border-gray-200 hover:border-brand hover:bg-brand/5 transition-all"
                  >
                    {choice.map((s, i) => (
                      <ShapeIcon key={i} shape={s.shape} color={s.color} size="w-6 h-6" />
                    ))}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => { setStep('pin'); setError(''); }}
                className="w-full mt-4 py-2 text-sm text-gray-400 hover:text-gray-600"
              >
                &larr; Change PIN
              </button>
            </div>
          ) : step === 'pin' ? (
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
              <div className="relative">
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
                  type="button"
                  onClick={() => setNickname(randomNickname())}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-xl bg-brand/10 hover:bg-brand/20 text-brand transition-colors"
                  title="Random nickname"
                >
                  <Shuffle className="w-5 h-5" />
                </button>
              </div>
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
