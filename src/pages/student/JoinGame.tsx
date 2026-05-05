import { useState, useMemo, useEffect, lazy, Suspense } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../lib/firebase';
import { Shuffle, Triangle, Diamond, Circle, Square, ArrowLeft, Gamepad2, ShieldCheck, User, RefreshCw, Dices } from 'lucide-react';
import WaveBackground from '../../components/ui/WaveBackground';
import { AVATARS } from '../../lib/avatars';
import boy5 from '../../assets/optimized/boy_5.png';

const ShaderBackground = lazy(() => import('../../components/ui/ShaderBackground'));

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
  const target = Array.from({ length: 3 }, () => ({
    shape: SHAPES[Math.floor(Math.random() * SHAPES.length)],
    color: SHAPE_COLORS[Math.floor(Math.random() * SHAPE_COLORS.length)],
  }));

  const choices = [target];
  while (choices.length < 4) {
    const alt = Array.from({ length: 3 }, () => ({
      shape: SHAPES[Math.floor(Math.random() * SHAPES.length)],
      color: SHAPE_COLORS[Math.floor(Math.random() * SHAPE_COLORS.length)],
    }));
    const key = (p: typeof target) => p.map((s) => `${s.shape}-${s.color}`).join(',');
    if (key(alt) !== key(target) && !choices.some((c) => key(c) === key(alt))) {
      choices.push(alt);
    }
  }

  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }

  return { target, choices };
}

const STEPS = [
  { key: 'pin', label: 'Game PIN', icon: Gamepad2 },
  { key: 'verify', label: 'Verify', icon: ShieldCheck },
  { key: 'nickname', label: 'Nickname', icon: User },
] as const;

export default function JoinGame() {
  const [pin, setPin] = useState('');
  const [nickname, setNickname] = useState('');
  const [avatar, setAvatar] = useState(() => AVATARS[Math.floor(Math.random() * AVATARS.length)]);
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);
  const [step, setStep] = useState<'pin' | 'verify' | 'nickname'>('pin');
  const [sessionId, setSessionId] = useState('');
  const [sessionType, setSessionType] = useState<'session' | 'live_grading' | 'mini_game'>('session');
  const [rejoinData, setRejoinData] = useState<{ playerId: string; nickname: string; avatar?: string } | null>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const pattern = useMemo(() => generatePattern(), [step === 'verify' ? sessionId : null]); // eslint-disable-line

  const stepIdx = STEPS.findIndex((s) => s.key === step);

  useEffect(() => {
    const pinParam = searchParams.get('pin');
    if (pinParam && /^\d{4,6}$/.test(pinParam) && step === 'pin') {
      setPin(pinParam);
      (async () => {
        // Check sessions collection first
        let resolvedSessionId = '';
        let resolvedType: 'session' | 'live_grading' | 'mini_game' = 'session';
        let joinLocked = false;

        const sessSnap = await getDocs(query(collection(db, 'sessions'), where('pinCode', '==', pinParam), where('status', '!=', 'ended')));
        if (!sessSnap.empty) {
          resolvedSessionId = sessSnap.docs[0].id;
          resolvedType = 'session';
          joinLocked = sessSnap.docs[0].data().joinLocked;
        } else {
          const lgSnap = await getDocs(query(collection(db, 'live_gradings'), where('pinCode', '==', pinParam), where('status', '!=', 'ended')));
          if (!lgSnap.empty) {
            resolvedSessionId = lgSnap.docs[0].id;
            resolvedType = 'live_grading';
            joinLocked = lgSnap.docs[0].data().joinLocked;
          } else {
            const bgSnap = await getDocs(query(collection(db, 'mini_games'), where('pinCode', '==', pinParam), where('status', 'in', ['lobby', 'live'])));
            if (!bgSnap.empty) {
              resolvedSessionId = bgSnap.docs[0].id;
              resolvedType = 'mini_game';
              joinLocked = bgSnap.docs[0].data().joinLocked;
            }
          }
        }

        if (!resolvedSessionId) {
          setError('No active game found with that PIN.');
          return;
        }

        setSessionType(resolvedType);
        const storageKey = resolvedType === 'mini_game' ? `liveclass_mg_${resolvedSessionId}` : resolvedType === 'live_grading' ? `liveclass_lg_${resolvedSessionId}` : `liveclass_session_${resolvedSessionId}`;

        // Check localStorage for existing join data (rejoin recovery)
        try {
          const stored = localStorage.getItem(storageKey);
          if (stored) {
            const parsed = JSON.parse(stored) as { playerId: string; nickname: string; avatar?: string };
            if (parsed.playerId && parsed.nickname) {
              setSessionId(resolvedSessionId);
              setRejoinData(parsed);
              return;
            }
          }
        } catch { /* ignore malformed localStorage */ }

        if (joinLocked) {
          setError('This game is locked. No more players can join.');
          return;
        }
        setSessionId(resolvedSessionId);
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

    // Check sessions collection first, then live_gradings
    let resolvedSessionId = '';
    let resolvedType: 'session' | 'live_grading' | 'mini_game' = 'session';
    let joinLocked = false;

    const sessSnap = await getDocs(query(collection(db, 'sessions'), where('pinCode', '==', pin), where('status', '!=', 'ended')));
    if (!sessSnap.empty) {
      resolvedSessionId = sessSnap.docs[0].id;
      resolvedType = 'session';
      joinLocked = sessSnap.docs[0].data().joinLocked;
    } else {
      const lgSnap = await getDocs(query(collection(db, 'live_gradings'), where('pinCode', '==', pin), where('status', '!=', 'ended')));
      if (!lgSnap.empty) {
        resolvedSessionId = lgSnap.docs[0].id;
        resolvedType = 'live_grading';
        joinLocked = lgSnap.docs[0].data().joinLocked;
      } else {
        const bgSnap = await getDocs(query(collection(db, 'mini_games'), where('pinCode', '==', pin), where('status', 'in', ['lobby', 'live'])));
        if (!bgSnap.empty) {
          resolvedSessionId = bgSnap.docs[0].id;
          resolvedType = 'mini_game';
          joinLocked = bgSnap.docs[0].data().joinLocked;
        }
      }
    }

    if (!resolvedSessionId) {
      setError('No active game found with that PIN.');
      return;
    }

    setSessionType(resolvedType);
    const storageKey = resolvedType === 'mini_game' ? `liveclass_mg_${resolvedSessionId}` : resolvedType === 'live_grading' ? `liveclass_lg_${resolvedSessionId}` : `liveclass_session_${resolvedSessionId}`;

    // Check localStorage for existing join data (rejoin recovery)
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as { playerId: string; nickname: string; avatar?: string };
        if (parsed.playerId && parsed.nickname) {
          setSessionId(resolvedSessionId);
          setRejoinData(parsed);
          return; // Show rejoin banner instead of continuing to verify step
        }
      }
    } catch { /* ignore malformed localStorage */ }

    if (joinLocked) {
      setError('This game is locked. No more players can join.');
      return;
    }

    setSessionId(resolvedSessionId);
    setStep('verify');
  };

  const handleJoin = async (e: React.FormEvent, existingPlayerId?: string) => {
    e.preventDefault();
    setError('');
    setJoining(true);

    try {
      const joinNickname = existingPlayerId ? rejoinData?.nickname || nickname : nickname;
      const joinAvatar = existingPlayerId ? rejoinData?.avatar || avatar : avatar;

      if (sessionType === 'mini_game') {
        // Mini game join
        const joinFn = httpsCallable<
          { miniGameId: string; nickname: string; avatar?: string; playerId?: string },
          { playerId: string; nickname?: string; avatar?: string; rejoin?: boolean }
        >(functions, 'joinMiniGame');
        const result = await joinFn({
          miniGameId: sessionId,
          nickname: joinNickname,
          avatar: joinAvatar,
          ...(existingPlayerId ? { playerId: existingPlayerId } : {}),
        });

        const finalNickname = result.data.nickname || joinNickname;
        const finalAvatar = result.data.avatar || joinAvatar;
        localStorage.setItem(`liveclass_mg_${sessionId}`, JSON.stringify({
          playerId: result.data.playerId,
          nickname: finalNickname,
          avatar: finalAvatar,
        }));
        navigate(`/mini-game/${sessionId}/${result.data.playerId}`);
      } else if (sessionType === 'live_grading') {
        // Live grading join
        const joinFn = httpsCallable<
          { liveGradingId: string; nickname: string; avatar?: string; playerId?: string },
          { playerId: string; nickname?: string; avatar?: string; rejoin?: boolean }
        >(functions, 'joinLiveGrading');
        const result = await joinFn({
          liveGradingId: sessionId,
          nickname: joinNickname,
          avatar: joinAvatar,
          ...(existingPlayerId ? { playerId: existingPlayerId } : {}),
        });

        const finalNickname = result.data.nickname || joinNickname;
        const finalAvatar = result.data.avatar || joinAvatar;
        localStorage.setItem(`liveclass_lg_${sessionId}`, JSON.stringify({
          playerId: result.data.playerId,
          nickname: finalNickname,
          avatar: finalAvatar,
        }));
        navigate(`/live-grading/${sessionId}/${result.data.playerId}`);
      } else {
        // Quiz session join
        const joinFn = httpsCallable<
          { sessionId: string; nickname: string; avatar?: string; playerId?: string },
          { playerId: string; activeToken: string; nickname?: string; avatar?: string; rejoin?: boolean }
        >(functions, 'joinSession');
        const result = await joinFn({
          sessionId,
          nickname: joinNickname,
          avatar: joinAvatar,
          ...(existingPlayerId ? { playerId: existingPlayerId } : {}),
        });

        const finalNickname = result.data.nickname || joinNickname;
        const finalAvatar = result.data.avatar || joinAvatar;
        localStorage.setItem(`liveclass_session_${sessionId}`, JSON.stringify({
          playerId: result.data.playerId,
          nickname: finalNickname,
          avatar: finalAvatar,
        }));
        // Store token in memory only (not sessionStorage) to prevent XSS access
        const { setActiveToken } = await import('../../lib/tokenStore');
        setActiveToken(sessionId!, result.data.activeToken);
        navigate(`/play/${sessionId}/${result.data.playerId}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join');
    } finally {
      setJoining(false);
    }
  };

  const handleRejoin = async () => {
    if (!rejoinData) return;
    // Create a synthetic form event
    const fakeEvent = { preventDefault: () => {} } as React.FormEvent;
    await handleJoin(fakeEvent, rejoinData.playerId);
  };

  const handleDeclineRejoin = () => {
    const storageKey = sessionType === 'mini_game' ? `liveclass_mg_${sessionId}` : sessionType === 'live_grading' ? `liveclass_lg_${sessionId}` : `liveclass_session_${sessionId}`;
    localStorage.removeItem(storageKey);
    setRejoinData(null);
    setStep('verify');
  };

  return (
    <div className="gradient-hero min-h-[calc(100vh-4rem)] flex items-start justify-center px-4 pt-6 sm:pt-2 relative overflow-hidden">
      <Suspense fallback={<div className="absolute inset-0 gradient-hero" />}>
        <ShaderBackground />
      </Suspense>
      <WaveBackground variant="dark" position="both" />
      <div className="absolute inset-0 pattern-stars pointer-events-none" />

      <div className="relative z-10 w-full max-w-md animate-bounce-in">
        {/* Header */}
        <div className="text-center mb-8">
          <img
            src={boy5}
            alt="Player avatar"
            className="w-32 object-contain mx-auto mb-4"
          />
          <h1 className="text-4xl sm:text-5xl text-gray-900 dark:text-white tracking-tight">Join Game</h1>
          <p className="text-gray-500 dark:text-white/50 mt-2 text-sm font-medium">Enter the PIN your host shared</p>
        </div>

        {/* Step progress */}
        <div className={`flex items-center justify-center gap-2 mb-6 ${rejoinData ? 'hidden' : ''}`}>
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const isActive = i === stepIdx;
            const isDone = i < stepIdx;
            return (
              <div key={s.key} className="flex items-center gap-2">
                {i > 0 && (
                  <div className={`w-8 h-0.5 rounded-full transition-colors duration-300 ${isDone ? 'bg-brand' : 'bg-gray-200 dark:bg-white/15'}`} />
                )}
                <div
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all duration-300 ${
                    isActive
                      ? 'bg-brand text-white shadow-lg scale-105'
                      : isDone
                        ? 'bg-brand/30 text-white'
                        : 'bg-gray-100 dark:bg-white/5 text-gray-400 dark:text-white/40'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{s.label}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Card */}
        <div className="card-night p-8">
          {/* Error */}
          {error && (
            <div className="mb-5 p-3 bg-danger/10 rounded-xl border border-danger/30 text-danger text-sm font-bold text-center animate-fade-in" role="alert">
              {error}
            </div>
          )}

          {/* Rejoin banner */}
          {rejoinData && (
            <div className="animate-fade-in">
              <div className="text-center mb-4">
                <RefreshCw className="w-10 h-10 text-brand mx-auto mb-3" />
                <p className="text-lg font-bold text-gray-900 dark:text-white">Welcome back!</p>
                <p className="text-sm text-gray-500 dark:text-white/50 mt-1">
                  Rejoin as <span className="font-bold text-gray-900 dark:text-white">{rejoinData.nickname}</span>?
                </p>
              </div>
              <button
                type="button"
                onClick={handleRejoin}
                disabled={joining}
                className="btn-3d-purple w-full text-lg disabled:opacity-40"
              >
                {joining ? 'Rejoining...' : 'Rejoin Game'}
              </button>
              <button
                type="button"
                onClick={handleDeclineRejoin}
                className="w-full mt-3 py-2.5 text-sm font-semibold text-gray-400 dark:text-white/40 hover:text-brand flex items-center justify-center gap-1.5 transition-colors"
              >
                Join as someone else
              </button>
            </div>
          )}

          {/* Step: PIN */}
          {step === 'pin' && !rejoinData && (
            <form onSubmit={handlePinSubmit} className="animate-fade-in">
              <label className="block text-center text-sm font-bold text-gray-400 dark:text-white/40 uppercase tracking-wider mb-4">
                Game PIN
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000 000"
                required
                maxLength={6}
                className="w-full text-center text-4xl font-black tracking-[0.4em] px-4 py-5 rounded-full border border-gray-200 dark:border-white/10 bg-gray-100 dark:bg-white/5 focus:border-brand focus:ring-4 focus:ring-brand/20 outline-none transition-all text-gray-900 dark:text-white placeholder:text-gray-300 dark:placeholder:text-white/20"
                autoFocus
              />
              <button
                type="submit"
                disabled={pin.length < 4}
                className="btn-3d-purple w-full mt-5 text-lg disabled:opacity-40"
              >
                Next
              </button>
            </form>
          )}

          {/* Step: Verify */}
          {step === 'verify' && (
            <div className="animate-fade-in">
              <label className="block text-center text-sm font-bold text-gray-400 dark:text-white/40 uppercase tracking-wider mb-4">
                Pick the matching pattern
              </label>
              <div className="flex justify-center gap-3 mb-6 p-5 bg-gray-100 dark:bg-white/5 rounded-2xl border border-gray-200 dark:border-white/10">
                {pattern.target.map((s, i) => (
                  <ShapeIcon key={i} shape={s.shape} color={s.color} size="w-10 h-10" />
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {pattern.choices.map((choice, ci) => (
                  <button
                    key={ci}
                    onClick={() => handleVerify(ci)}
                    aria-label={`Pattern option ${ci + 1}`}
                    className="flex justify-center gap-2 p-4 rounded-2xl border border-gray-200 dark:border-white/10 bg-gray-100 dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 transition-all duration-300"
                  >
                    {choice.map((s, i) => (
                      <ShapeIcon key={i} shape={s.shape} color={s.color} size="w-7 h-7" />
                    ))}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => { setStep('pin'); setError(''); }}
                className="w-full mt-5 py-2.5 text-sm font-semibold text-gray-400 dark:text-white/40 hover:text-brand flex items-center justify-center gap-1.5 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Change PIN
              </button>
            </div>
          )}

          {/* Step: Nickname */}
          {step === 'nickname' && (
            <form onSubmit={handleJoin} className="animate-fade-in">
              <label className="block text-center text-sm font-bold text-gray-400 dark:text-white/40 uppercase tracking-wider mb-4">
                Choose your name
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="Your nickname"
                  required
                  maxLength={20}
                  className="w-full text-center text-2xl font-bold px-4 py-5 rounded-full border border-gray-200 dark:border-white/10 bg-gray-100 dark:bg-white/5 focus:border-brand focus:ring-4 focus:ring-brand/20 outline-none transition-all text-gray-900 dark:text-white placeholder:text-gray-300 dark:placeholder:text-white/20 pr-14"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setNickname(randomNickname())}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-brand/20 hover:bg-brand/30 text-brand transition-all duration-300"
                  aria-label="Generate random nickname"
                  title="Random nickname"
                >
                  <Shuffle className="w-4 h-4" />
                </button>
              </div>

              {/* Emoji Avatar Picker */}
              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-gray-400 dark:text-white/40 uppercase tracking-wider">Pick your avatar</span>
                  <button
                    type="button"
                    onClick={() => setAvatar(AVATARS[Math.floor(Math.random() * AVATARS.length)])}
                    className="flex items-center gap-1 text-xs font-semibold text-brand hover:text-brand-light transition-colors"
                  >
                    <Dices className="w-3.5 h-3.5" /> Shuffle
                  </button>
                </div>
                <div className="grid grid-cols-5 sm:grid-cols-6 gap-2">
                  {AVATARS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setAvatar(emoji)}
                      aria-pressed={avatar === emoji}
                      aria-label={`Avatar ${emoji}`}
                      className={`text-2xl p-3 sm:p-2.5 rounded-xl border select-none touch-manipulation transition-all duration-200 ${
                        avatar === emoji
                          ? 'border-brand bg-brand/20 ring-2 ring-brand/40 scale-110'
                          : 'border-gray-200 dark:border-white/10 bg-gray-100 dark:bg-white/5 hover:border-gray-300 dark:hover:border-white/20 hover:bg-gray-100 dark:hover:bg-white/10'
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={joining || !nickname.trim()}
                className="btn-3d-success w-full mt-5 text-lg disabled:opacity-40"
              >
                {joining ? 'Joining...' : "Let's Go!"}
              </button>
              <button
                type="button"
                onClick={() => { setStep('pin'); setError(''); }}
                className="w-full mt-3 py-2.5 text-sm font-semibold text-gray-400 dark:text-white/40 hover:text-brand flex items-center justify-center gap-1.5 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Change PIN
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
