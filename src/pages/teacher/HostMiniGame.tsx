import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { doc, onSnapshot, collection, updateDoc, getDocs, query, where, limit } from 'firebase/firestore';
import { db, functions } from '../../lib/firebase';
import { APP_URL } from '../../lib/config';
import { useAuthStore } from '../../stores/authStore';
import { useToastStore } from '../../stores/toastStore';
import { confirmAction } from '../../lib/swal';
import { QRCodeSVG } from 'qrcode.react';
import { getGameModule } from '../../games/registry';
import type { ConfigField } from '../../games/types';
import {
  Lock, Unlock, Play, Maximize2, X as XIcon, Award,
  CheckCircle2, Zap, Trophy, Hash, Pause, Timer, SkipForward,
  Binary, Globe, Calculator, Code, Cpu, Gamepad2,
} from 'lucide-react';
import type { MiniGame, MiniGamePlayer } from '../../types/models';

const ICON_MAP: Record<string, typeof Binary> = { Binary, Globe, Hash, Zap, Calculator, Code, Cpu, Gamepad2 };

const AVATAR_COLORS = [
  { bg: 'bg-cyan-500/20', border: 'border-cyan-500/40', text: 'text-cyan-400' },
  { bg: 'bg-purple-500/20', border: 'border-purple-500/40', text: 'text-purple-400' },
  { bg: 'bg-sky-500/20', border: 'border-sky-500/40', text: 'text-sky-400' },
  { bg: 'bg-violet-500/20', border: 'border-violet-500/40', text: 'text-violet-400' },
  { bg: 'bg-indigo-500/20', border: 'border-indigo-500/40', text: 'text-indigo-400' },
  { bg: 'bg-blue-500/20', border: 'border-blue-500/40', text: 'text-blue-400' },
  { bg: 'bg-teal-500/20', border: 'border-teal-500/40', text: 'text-teal-400' },
  { bg: 'bg-fuchsia-500/20', border: 'border-fuchsia-500/40', text: 'text-fuchsia-400' },
];

const MESH_BG: React.CSSProperties = {
  background: `
    radial-gradient(ellipse at 20% 0%, rgba(0,158,226,0.12) 0%, transparent 50%),
    radial-gradient(ellipse at 80% 0%, rgba(112,30,168,0.08) 0%, transparent 50%),
    radial-gradient(ellipse at 50% 100%, rgba(244,207,93,0.06) 0%, transparent 50%),
    linear-gradient(160deg, #080F1E 0%, #0F1729 40%, #080F1E 100%)
  `,
};

function ConfigFieldInput({ field, value, onChange }: { field: ConfigField; value: unknown; onChange: (v: unknown) => void }) {
  if (field.type === 'select') {
    return (
      <div className="flex gap-2">
        {field.options?.map((o) => (
          <button key={o.value} onClick={() => onChange(o.value)} className={`flex-1 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${value === o.value ? 'bg-brand text-white' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}>
            {o.label}
          </button>
        ))}
      </div>
    );
  }
  if (field.type === 'multi-select') {
    const selected = (value as string[]) || [];
    return (
      <div className="grid grid-cols-2 gap-2">
        {field.options?.map((o) => (
          <button key={o.value} onClick={() => onChange(selected.includes(o.value) ? selected.filter((x) => x !== o.value) : [...selected, o.value])} className={`px-3 py-2 rounded-xl text-xs font-bold transition-colors ${selected.includes(o.value) ? 'bg-brand/20 border border-brand/40 text-brand' : 'bg-white/5 border border-white/10 text-white/40 hover:bg-white/10'}`}>
            {o.label}
          </button>
        ))}
      </div>
    );
  }
  if (field.type === 'number') {
    return <input type="number" min={field.min} max={field.max} value={value as number} onChange={(e) => onChange(Math.min(field.max || 999, Math.max(field.min || 0, Number(e.target.value))))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-brand/50" />;
  }
  return <input type="text" value={value as string} onChange={(e) => onChange(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-brand/50" />;
}

export default function HostMiniGame() {
  const { gameType } = useParams<{ gameType: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { addToast } = useToastStore();

  const module = gameType ? getGameModule(gameType) : null;
  const GameIcon = ICON_MAP[module?.metadata.icon || ''] || Gamepad2;

  const [game, setGame] = useState<MiniGame | null>(null);
  const [players, setPlayers] = useState<MiniGamePlayer[]>([]);
  const [answerCounts, setAnswerCounts] = useState<Map<number, number>>(new Map());
  const [error, setError] = useState('');
  const [qrZoomed, setQrZoomed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [endingGame, setEndingGame] = useState(false);
  const [showSetup, setShowSetup] = useState(true);
  const [timeLeft, setTimeLeft] = useState(0);

  const [title, setTitle] = useState(module?.metadata.name || 'Mini Game');
  const [roundCount, setRoundCount] = useState((module?.defaultConfig.roundCount as number) || 10);
  const [timeLimitSec, setTimeLimitSec] = useState((module?.defaultConfig.timeLimitSec as number) || 30);
  const [gameConfig, setGameConfig] = useState<Record<string, unknown>>(module?.defaultConfig || {});

  const unsubscribesRef = useRef<Array<() => void>>([]);
  const cancelledRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { return () => { cancelledRef.current = true; unsubscribesRef.current.forEach((u) => u()); if (timerRef.current) clearInterval(timerRef.current); }; }, []);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!game || game.roundState !== 'live' || !game.roundStartedAt) { setTimeLeft(0); return; }
    if (game.timerPaused) {
      const elapsed = (game.timerPausedAt! - game.roundStartedAt) / 1000;
      setTimeLeft(Math.max(0, game.rounds[game.currentRoundIndex].timeLimitSec + (game.timerExtendedBy || 0) - elapsed));
      return;
    }
    const totalTime = game.rounds[game.currentRoundIndex].timeLimitSec + (game.timerExtendedBy || 0);
    const update = () => {
      const remaining = Math.max(0, totalTime - (Date.now() - game.roundStartedAt!) / 1000);
      setTimeLeft(remaining);
      if (remaining <= 0) { if (timerRef.current) clearInterval(timerRef.current); updateDoc(doc(db, 'mini_games', game.id), { roundState: 'reveal' }).catch(() => {}); }
    };
    update();
    timerRef.current = setInterval(update, 100);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [game?.roundState, game?.roundStartedAt, game?.currentRoundIndex, game?.timerPaused, game?.timerExtendedBy]); // eslint-disable-line react-hooks/exhaustive-deps

  const subscribe = (id: string) => {
    unsubscribesRef.current.forEach((u) => u()); unsubscribesRef.current = [];
    const u1 = onSnapshot(doc(db, 'mini_games', id), (s) => { if (s.exists()) setGame({ id: s.id, ...s.data() } as MiniGame); });
    const u2 = onSnapshot(collection(db, `mini_games/${id}/players`), (s) => { setPlayers(s.docs.map((d) => ({ id: d.id, ...d.data() })) as MiniGamePlayer[]); });
    const u3 = onSnapshot(collection(db, `mini_games/${id}/answers`), (s) => {
      const c = new Map<number, number>(); s.docs.forEach((d) => { const ri = d.data().roundIndex as number; c.set(ri, (c.get(ri) || 0) + 1); }); setAnswerCounts(c);
    });
    unsubscribesRef.current = [u1, u2, u3];
  };

  const handleCreate = async () => {
    if (!user || !gameType || creating) return;
    setCreating(true);
    try {
      const existing = await getDocs(query(collection(db, 'mini_games'), where('ownerId', '==', user.id), where('gameType', '==', gameType), where('status', 'in', ['lobby', 'live']), limit(1)));
      if (!existing.empty) { subscribe(existing.docs[0].id); setShowSetup(false); addToast('info', 'Rejoined existing game'); return; }
      const fn = httpsCallable<Record<string, unknown>, { miniGameId: string }>(functions, 'createMiniGame');
      const result = await fn({ gameType, title, config: gameConfig, roundCount, timeLimitSec });
      if (cancelledRef.current) return;
      subscribe(result.data.miniGameId);
      setShowSetup(false);
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to create game'); }
    finally { setCreating(false); }
  };

  const handleStart = async () => { if (!game || players.length === 0) return; await updateDoc(doc(db, 'mini_games', game.id), { status: 'live', currentRoundIndex: 0, roundState: 'live', roundStartedAt: Date.now(), startedAt: Date.now(), joinLocked: true, timerPaused: false, timerPausedAt: null, timerExtendedBy: 0 }); };

  const handleNextRound = async () => {
    if (!game) return;
    const next = game.currentRoundIndex + 1;
    if (next >= game.rounds.length) {
      const sorted = [...players].sort((a, b) => (b.totalPoints || 0) - (a.totalPoints || 0));
      const top10 = sorted.slice(0, 10).map((p, i) => ({ playerId: p.id, nickname: p.nickname, totalPoints: p.totalPoints || 0, rank: i + 1 }));
      await updateDoc(doc(db, 'mini_games', game.id), { status: 'ended', roundState: 'waiting', endedAt: Date.now(), top10Snapshot: top10 });
      addToast('success', 'Game complete!');
    } else {
      await updateDoc(doc(db, 'mini_games', game.id), { currentRoundIndex: next, roundState: 'live', roundStartedAt: Date.now(), timerPaused: false, timerPausedAt: null, timerExtendedBy: 0 });
    }
  };

  const handleToggleLock = async () => { if (game) await updateDoc(doc(db, 'mini_games', game.id), { joinLocked: !game.joinLocked }); };

  const handlePauseResume = async () => {
    if (!game || game.roundState !== 'live') return;
    if (game.timerPaused) { const d = Date.now() - (game.timerPausedAt || Date.now()); await updateDoc(doc(db, 'mini_games', game.id), { timerPaused: false, timerPausedAt: null, roundStartedAt: (game.roundStartedAt || 0) + d }); }
    else { await updateDoc(doc(db, 'mini_games', game.id), { timerPaused: true, timerPausedAt: Date.now() }); }
  };

  const handleExtend = async () => { if (game && game.roundState === 'live') { await updateDoc(doc(db, 'mini_games', game.id), { timerExtendedBy: (game.timerExtendedBy || 0) + 30 }); addToast('info', '+30 seconds'); } };
  const handleSkip = async () => { if (game) await updateDoc(doc(db, 'mini_games', game.id), { roundState: 'reveal', timerPaused: false, timerPausedAt: null }); };

  const handleEnd = async () => {
    if (!game || endingGame) return;
    const { isConfirmed } = await confirmAction('End game early?', `This will end the ${module?.metadata.name || 'game'} for all students.`, 'Yes, end game');
    if (!isConfirmed) return; setEndingGame(true);
    try { const sorted = [...players].sort((a, b) => (b.totalPoints || 0) - (a.totalPoints || 0)); const top10 = sorted.slice(0, 10).map((p, i) => ({ playerId: p.id, nickname: p.nickname, totalPoints: p.totalPoints || 0, rank: i + 1 })); await updateDoc(doc(db, 'mini_games', game.id), { status: 'ended', roundState: 'waiting', endedAt: Date.now(), top10Snapshot: top10 }); }
    catch { addToast('error', 'Failed to end game.'); } finally { setEndingGame(false); }
  };

  useEffect(() => { if (!game || game.status === 'ended') return; const h = (e: BeforeUnloadEvent) => { e.preventDefault(); }; window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h); }, [game]);

  const leaderboard = [...players].sort((a, b) => (b.totalPoints || 0) - (a.totalPoints || 0));

  if (!module) return (<div className="min-h-screen flex items-center justify-center text-white" style={MESH_BG}><div className="text-center"><p className="text-lg text-danger mb-4">Unknown game type: {gameType}</p><button onClick={() => navigate('/dashboard')} className="btn-3d-ghost">Back</button></div></div>);

  if (showSetup) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white p-4" style={MESH_BG}>
        <div className="w-full max-w-lg bg-white/[0.07] border border-white/12 rounded-2xl p-6 backdrop-blur-md">
          <div className="flex items-center gap-3 mb-6"><div className="bg-brand p-2 rounded-lg"><GameIcon className="w-5 h-5 text-white" /></div><h1 className="text-xl font-bold">{module.metadata.name}</h1></div>
          {error && <p className="text-danger text-sm mb-4">{error}</p>}
          <label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-1.5">Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white mb-4 focus:outline-none focus:border-brand/50" />
          {module.configFields.map((f) => (<div key={f.key} className="mb-4"><label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-1.5">{f.label}</label><ConfigFieldInput field={f} value={gameConfig[f.key] ?? f.default} onChange={(v) => setGameConfig((p) => ({ ...p, [f.key]: v }))} /></div>))}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div><label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-1.5">Rounds</label><input type="number" min={1} max={30} value={roundCount} onChange={(e) => setRoundCount(Math.min(30, Math.max(1, Number(e.target.value))))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-brand/50" /></div>
            <div><label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-1.5">Time / Round (sec)</label><input type="number" min={5} max={120} value={timeLimitSec} onChange={(e) => setTimeLimitSec(Math.min(120, Math.max(5, Number(e.target.value))))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-brand/50" /></div>
          </div>
          <button onClick={handleCreate} disabled={creating} className="btn-3d-cyan w-full py-3 text-base font-bold flex items-center justify-center gap-2 disabled:opacity-50">{creating ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><GameIcon className="w-5 h-5" />Create Game</>}</button>
          <button onClick={() => navigate('/dashboard')} className="btn-3d-ghost w-full py-2 text-sm mt-3">Cancel</button>
        </div>
      </div>
    );
  }

  if (error) return (<div className="min-h-screen flex items-center justify-center text-white" style={MESH_BG}><div className="text-center"><p className="text-lg text-danger mb-4">{error}</p><button onClick={() => navigate('/dashboard')} className="btn-3d-ghost">Back</button></div></div>);
  if (!game) return (<div className="min-h-screen flex items-center justify-center text-white" style={MESH_BG}><div className="flex flex-col items-center gap-4"><div className="w-10 h-10 border-3 border-brand/30 border-t-brand rounded-full animate-spin" /><p className="text-white/60 text-sm">Creating game...</p></div></div>);

  const currentRound = game.currentRoundIndex >= 0 ? game.rounds[game.currentRoundIndex] : null;
  const answeredThisRound = answerCounts.get(game.currentRoundIndex) || 0;
  const HostPrompt = module.HostPrompt;

  return (
    <div className="min-h-screen flex flex-col text-white overflow-hidden" style={MESH_BG}>
      {qrZoomed && (<div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center" onClick={() => setQrZoomed(false)}><div className="flex flex-col items-center gap-4" onClick={(e) => e.stopPropagation()}><div className="bg-white p-6 rounded-3xl"><QRCodeSVG value={`${APP_URL}/join?pin=${game.pinCode}`} size={300} level="M" /></div><p className="text-white/70 text-sm font-medium select-all">{`${APP_URL}/join?pin=${game.pinCode}`}</p></div><button onClick={() => setQrZoomed(false)} className="absolute top-4 right-4 p-2 text-white/60 hover:text-white"><XIcon className="w-8 h-8" /></button></div>)}

      <header className="flex items-center justify-between px-4 sm:px-8 py-2 sm:py-3 w-full max-w-7xl mx-auto shrink-0">
        <div className="flex items-center gap-2 sm:gap-3"><div className="bg-brand p-1.5 sm:p-2 rounded-lg"><GameIcon className="w-4 h-4 sm:w-5 sm:h-5 text-white" /></div><h1 className="text-base sm:text-xl font-bold tracking-tight">{module.metadata.name}</h1></div>
        <div className="flex items-center gap-1.5 sm:gap-2.5 bg-white/10 backdrop-blur-md px-3 sm:px-5 py-1.5 sm:py-2 rounded-full border border-white/5"><div className="w-2 h-2 sm:w-2.5 sm:h-2.5 bg-success rounded-full animate-pulse" /><span className="text-xs sm:text-sm font-semibold">{players.length} <span className="hidden sm:inline">Player{players.length !== 1 && 's'}</span></span></div>
      </header>

      {game.status === 'lobby' && (<>
        <main className="grow flex flex-col lg:flex-row gap-4 sm:gap-6 px-4 sm:px-8 py-2 sm:py-4 max-w-7xl mx-auto w-full min-h-0">
          <div className="grow flex flex-col gap-3 sm:gap-4 min-h-0">
            <div className="relative flex flex-col items-center py-4 sm:py-6 px-4 sm:px-8 bg-white/[0.07] border border-white/12 rounded-2xl overflow-hidden backdrop-blur-md animate-bounce-in shadow-xl shadow-black/20 shrink-0">
              <div className="absolute inset-0 bg-linear-to-br from-brand/10 via-transparent to-accent/10" />
              <h2 className="relative text-sm sm:text-base font-medium text-white/60 mb-2 sm:mb-4 uppercase tracking-[0.2em]">Join the Challenge</h2>
              <div className="relative flex flex-col sm:flex-row items-center gap-4 sm:gap-8">
                <div className="flex flex-col items-center gap-2">
                  <p className="text-sm font-medium text-brand">Enter PIN</p>
                  <div className="bg-white text-surface-dark px-6 sm:px-10 py-2 sm:py-3 rounded-2xl flex items-center gap-2 sm:gap-3 animate-glow-pulse" style={{ boxShadow: '0 0 60px rgba(0, 158, 226, 0.3)' }}>
                    <span className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">{game.pinCode.slice(0, 3)}</span>
                    <div className="w-1 sm:w-1.5 h-6 sm:h-10 bg-gray-200 rounded-full" />
                    <span className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">{game.pinCode.slice(3)}</span>
                  </div>
                </div>
                <div className="hidden sm:flex flex-col items-center gap-2 self-stretch justify-center"><div className="flex-1 w-px bg-linear-to-b from-transparent via-white/15 to-transparent" /><span className="text-[10px] uppercase tracking-widest text-white/30 font-medium">or</span><div className="flex-1 w-px bg-linear-to-b from-transparent via-white/15 to-transparent" /></div>
                <div className="flex sm:hidden items-center gap-3 w-full"><div className="flex-1 h-px bg-linear-to-r from-transparent via-white/15 to-transparent" /><span className="text-[10px] uppercase tracking-widest text-white/30 font-medium">or</span><div className="flex-1 h-px bg-linear-to-r from-transparent via-white/15 to-transparent" /></div>
                <div className="flex flex-col items-center gap-2">
                  <p className="text-sm font-medium text-brand">Scan to Join</p>
                  <button type="button" onClick={() => setQrZoomed(true)} className="relative group bg-white p-2 sm:p-3 rounded-2xl cursor-pointer transition-transform hover:scale-105" style={{ boxShadow: '0 0 40px rgba(0, 158, 226, 0.2)' }}><QRCodeSVG value={`${APP_URL}/join?pin=${game.pinCode}`} size={100} level="M" className="sm:w-32 sm:h-32" /><div className="absolute inset-0 rounded-2xl bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center"><Maximize2 className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" /></div></button>
                  <p className="text-xs text-white/50 font-medium select-all break-all text-center max-w-40">{`${APP_URL}/join?pin=${game.pinCode}`}</p>
                </div>
              </div>
            </div>
            <p className="text-center text-white/40 text-sm font-medium -mt-1 sm:-mt-2 shrink-0">Or go to <span className="text-white/70 font-semibold select-all">{window.location.host}</span> and enter the PIN</p>
            <div className="flex-1 flex flex-col animate-fade-in min-h-0">
              <div className="flex items-center justify-between mb-2 shrink-0"><h3 className="text-lg font-bold">Players</h3><span className="text-lg font-bold tabular-nums">{players.length} <span className="text-sm font-medium text-white/40">joined</span></span></div>
              <div className="flex-1 min-h-0 overflow-y-auto pr-1">
                {players.length > 0 ? (<div className="flex flex-wrap gap-2 sm:gap-2.5 content-start">{players.map((p, i) => { const c = AVATAR_COLORS[i % AVATAR_COLORS.length]; return (<div key={p.id} className={`flex items-center gap-2 pl-1 pr-3 py-1 rounded-full ${c.bg} border ${c.border} animate-fade-in cursor-default hover:scale-105 transition-transform`}><div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0">{p.avatar ? <span className="text-lg leading-none">{p.avatar}</span> : <span className={`text-xs font-bold ${c.text}`}>{p.nickname.charAt(0).toUpperCase()}</span>}</div><span className={`text-sm font-semibold ${c.text} truncate max-w-24`}>{p.nickname}</span></div>); })}</div>) : (<div className="flex items-center justify-center gap-3 py-8 opacity-50"><div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center animate-pulse"><span className="text-white/30 text-lg">+</span></div><span className="text-white/30 italic text-sm">Waiting for players...</span></div>)}
              </div>
            </div>
          </div>
          <aside className="w-full lg:w-72 flex flex-col shrink-0 min-h-0">
            <div className="bg-white/[0.07] backdrop-blur-xl border border-white/12 rounded-2xl p-4 sm:p-5 flex flex-col gap-3 sm:gap-4 h-full shadow-lg shadow-black/10">
              <h3 className="text-lg font-bold flex items-center gap-2"><GameIcon className="w-5 h-5 text-brand" />{game.title}</h3>
              <p className="text-xs text-white/40">{game.roundCount} rounds &middot; {game.timeLimitSec}s per round</p>
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 hover:bg-white/10 transition-colors">
                <div className="flex items-center gap-3">{game.joinLocked ? <Lock className="w-5 h-5 text-warning" /> : <Unlock className="w-5 h-5 text-white/50" />}<span className="text-sm font-medium">Lock Join</span></div>
                <button onClick={handleToggleLock} className={`relative w-11 h-6 rounded-full transition-colors ${game.joinLocked ? 'bg-warning' : 'bg-white/20'}`}><span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${game.joinLocked ? 'translate-x-5' : 'translate-x-0'}`} /></button>
              </div>
              <div className="flex-1" />
              <button onClick={handleStart} disabled={players.length === 0} className="btn-3d-cyan w-full py-3 text-base font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"><Play className="w-5 h-5" />Start Game{players.length > 0 && <span className="text-xs opacity-70">({players.length})</span>}</button>
              <button onClick={async () => { await updateDoc(doc(db, 'mini_games', game.id), { status: 'ended', endedAt: Date.now() }); navigate('/dashboard'); }} className="btn-3d-ghost w-full py-2 text-sm text-danger hover:bg-danger/10 mt-2">Cancel Session</button>
            </div>
          </aside>
        </main>
        <div className="w-full overflow-hidden py-3 shrink-0"><div className="flex animate-marquee whitespace-nowrap">{Array.from({ length: 8 }).map((_, i) => (<span key={i} className="mx-8 text-xl sm:text-2xl font-bold text-white/[0.04] uppercase tracking-widest select-none">{module.metadata.name}</span>))}</div></div>
      </>)}

      {game.status === 'live' && currentRound && (
        <main className="grow flex flex-col lg:flex-row gap-4 px-4 sm:px-8 py-2 sm:py-4 max-w-7xl mx-auto w-full min-h-0 overflow-hidden">
          <div className="flex-1 flex flex-col min-h-0">
            <div className="mb-4 animate-fade-in shrink-0">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-full bg-brand/20 border border-brand/40 flex items-center justify-center"><Hash className="w-5 h-5 text-brand" /></div><div><h2 className="text-lg sm:text-xl font-bold">Round {game.currentRoundIndex + 1} of {game.roundCount}</h2><p className="text-xs text-white/40">{module.getRoundLabel?.(currentRound) || currentRound.type}</p></div></div>
                <div className="flex items-center gap-3">{game.roundState === 'live' && (<>{game.timerPaused && <span className="text-xs font-bold text-warning uppercase tracking-wider">Paused</span>}<div className={`text-2xl sm:text-3xl font-bold tabular-nums ${game.timerPaused ? 'text-warning' : timeLeft <= 5 ? 'text-danger animate-pulse' : 'text-white'}`}>{Math.ceil(timeLeft)}s</div></>)}</div>
              </div>
            </div>
            <HostPrompt round={currentRound} showAnswer={game.roundState === 'reveal'} />
            <div className="bg-white/[0.07] border border-white/10 rounded-2xl p-4 flex items-center justify-between mt-4"><div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-success" /><span className="text-sm font-medium">{answeredThisRound} / {players.length} answered</span></div><div className="w-32 h-2 bg-white/10 rounded-full overflow-hidden"><div className="h-full bg-brand rounded-full transition-all duration-300" style={{ width: `${players.length > 0 ? (answeredThisRound / players.length) * 100 : 0}%` }} /></div></div>
            {game.roundState === 'live' && (<div className="flex items-center gap-2 mt-4"><button onClick={handlePauseResume} className={`btn-3d-ghost px-4 py-2.5 text-sm flex items-center gap-1.5 ${game.timerPaused ? 'text-success' : 'text-warning'}`}>{game.timerPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}{game.timerPaused ? 'Resume' : 'Pause'}</button><button onClick={handleExtend} className="btn-3d-ghost px-4 py-2.5 text-sm flex items-center gap-1.5"><Timer className="w-4 h-4" />+30s</button><button onClick={handleSkip} className="btn-3d-ghost px-4 py-2.5 text-sm flex items-center gap-1.5"><SkipForward className="w-4 h-4" />End Round</button></div>)}
            {game.roundState === 'reveal' && (<div className="mt-4"><button onClick={handleNextRound} className="btn-3d-cyan px-8 py-3 text-base font-bold flex items-center gap-2">{game.currentRoundIndex < game.rounds.length - 1 ? <><Zap className="w-5 h-5" />Next Round</> : <><Trophy className="w-5 h-5" />Show Results</>}</button></div>)}
          </div>
          <aside className="w-full lg:w-72 flex flex-col shrink-0 min-h-0">
            <div className="bg-white/[0.07] backdrop-blur-xl border border-white/12 rounded-2xl p-4 flex flex-col gap-2 h-full shadow-lg shadow-black/10 overflow-y-auto">
              <h3 className="text-sm font-bold flex items-center gap-2 mb-2"><Trophy className="w-4 h-4 text-warning" />Leaderboard</h3>
              {leaderboard.map((p, i) => (<div key={p.id} className={`flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all ${i === 0 ? 'bg-warning/10 border border-warning/30' : i < 3 ? 'bg-white/5' : 'bg-white/[0.03]'}`}><span className={`text-xs font-bold w-5 text-center ${i === 0 ? 'text-warning' : i < 3 ? 'text-white/60' : 'text-white/30'}`}>{i + 1}</span><div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center shrink-0">{p.avatar ? <span className="text-sm leading-none">{p.avatar}</span> : <span className="text-[10px] font-bold text-white/60">{p.nickname.charAt(0).toUpperCase()}</span>}</div><span className="text-sm font-medium truncate flex-1">{p.nickname}</span><span className="text-sm font-bold tabular-nums text-brand">{p.totalPoints || 0}</span></div>))}
              <div className="flex-1" /><button onClick={handleEnd} disabled={endingGame} className="btn-3d-ghost w-full py-2 text-sm text-danger hover:bg-danger/10 mt-2 disabled:opacity-50">{endingGame ? 'Ending...' : 'End Game Early'}</button>
            </div>
          </aside>
        </main>
      )}

      {game.status === 'ended' && (
        <main className="grow flex flex-col items-center px-4 sm:px-8 py-6 max-w-4xl mx-auto w-full overflow-y-auto">
          <div className="text-center mb-8 animate-fade-in"><div className="w-16 h-16 rounded-full bg-warning/20 flex items-center justify-center mx-auto mb-4"><Trophy className="w-8 h-8 text-warning" /></div><h2 className="text-2xl font-bold mb-2">Game Complete!</h2><p className="text-white/50 text-sm">{game.roundCount} rounds &middot; {players.length} player{players.length !== 1 ? 's' : ''}</p></div>
          <div className="w-full bg-white/[0.07] border border-white/10 rounded-2xl overflow-hidden mb-6">
            <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-2 px-4 py-3 border-b border-white/10 text-xs font-bold text-white/40 uppercase tracking-wider"><span>#</span><span>Player</span><span className="text-right">Points</span><span className="text-right">Correct</span><span className="text-right">Streak</span></div>
            {leaderboard.map((p, i) => (<div key={p.id} className={`grid grid-cols-[auto_1fr_auto_auto_auto] gap-2 px-4 py-3 border-b border-white/5 last:border-0 items-center ${i < 3 ? 'bg-warning/5' : ''}`}><span className={`text-sm font-bold w-6 ${i === 0 ? 'text-warning' : i === 1 ? 'text-gray-300' : i === 2 ? 'text-amber-600' : 'text-white/30'}`}>{i + 1}</span><div className="flex items-center gap-2 min-w-0"><div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center shrink-0">{p.avatar ? <span className="text-sm leading-none">{p.avatar}</span> : <span className="text-[10px] font-bold text-white/60">{p.nickname.charAt(0).toUpperCase()}</span>}</div><span className="text-sm font-medium truncate">{p.nickname}</span></div><span className="text-sm font-bold tabular-nums text-right text-brand">{p.totalPoints || 0}</span><span className="text-sm tabular-nums text-right text-white/50">{p.correctCount || 0}/{p.answeredCount || 0}</span><span className="text-sm tabular-nums text-right text-white/50">{p.streak || 0}</span></div>))}
          </div>
          <div className="flex items-center gap-3"><button onClick={() => { setShowSetup(true); setGame(null); setPlayers([]); }} className="btn-3d-cyan px-8 py-3 text-base font-bold flex items-center gap-2"><Award className="w-5 h-5" />Play Again</button><button onClick={() => navigate(`/mini-game/${game.id}/results`)} className="btn-3d-ghost px-6 py-3 text-base">View Results</button><button onClick={() => navigate('/dashboard')} className="btn-3d-ghost px-6 py-3 text-base">Dashboard</button></div>
        </main>
      )}
    </div>
  );
}
