import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { collection, doc, onSnapshot, orderBy, query } from 'firebase/firestore';
import { Loader2, Trophy, WifiOff } from 'lucide-react';
import { db } from '../../lib/firebase';
import { lan } from '../../lan/connection';
import { ARCADE_MODES, type ArcadeAnswerResult, type ArcadeGame, type ArcadePlayer } from '../../types/arcade';
import GoldQuest from './modes/GoldQuest';
import Racing from './modes/Racing';
import QuestionPanel from './QuestionPanel';
import { arcadeApi, formatClock, loadPlayerAuth } from './api';

const TowerDefense = lazy(() => import('./modes/TowerDefense'));
const Cafe = lazy(() => import('./modes/Cafe'));

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

function useOnline(): boolean {
  const [online, setOnline] = useState(lan().online);
  useEffect(() => lan().onStatus(setOnline), []);
  return online;
}

export default function ArcadePlay() {
  const { gameId = '', playerId = '' } = useParams();
  const auth = useMemo(() => loadPlayerAuth(gameId, playerId), [gameId, playerId]);
  const [game, setGame] = useState<ArcadeGame | null | undefined>(undefined);
  const [me, setMe] = useState<ArcadePlayer | null | undefined>(undefined);
  const [players, setPlayers] = useState<ArcadePlayer[]>([]);
  const online = useOnline();
  const now = useNow(game?.status === 'live');

  useEffect(() => {
    if (!gameId) return;
    const u1 = onSnapshot(doc(db, 'arcade_games', gameId), (s) => setGame(s.exists() ? ({ ...(s.data() as ArcadeGame), id: s.id }) : null));
    const u2 = onSnapshot(doc(db, 'arcade_games', gameId, 'players', playerId), (s) =>
      setMe(s.exists() ? ({ ...(s.data() as ArcadePlayer), id: s.id }) : null),
    );
    const u3 = onSnapshot(query(collection(db, 'arcade_games', gameId, 'players'), orderBy('score', 'desc')), (s) =>
      setPlayers(s.docs.map((d) => ({ ...(d.data() as ArcadePlayer), id: d.id }))),
    );
    return () => {
      u1();
      u2();
      u3();
    };
  }, [gameId, playerId]);

  // ---- self-paced mini-games: question modal + throttled score reports
  const [asking, setAsking] = useState<{ n: number; resolve: (reward: number) => void } | null>(null);
  const askCount = useRef(0);
  const earn = useCallback(
    () =>
      new Promise<number>((resolve) => {
        askCount.current += 1;
        setAsking({ n: askCount.current, resolve });
      }),
    [],
  );
  const finishAsk = (r: ArcadeAnswerResult | null) => {
    asking?.resolve(r?.correct ? (r.reward ?? 0) : 0);
    setAsking(null);
  };

  const pendingScore = useRef<number | null>(null);
  const lastSent = useRef(0);
  const reportScore = useCallback(
    (score: number) => {
      if (!auth) return;
      pendingScore.current = score;
      const send = () => {
        if (pendingScore.current === null) return;
        const s = pendingScore.current;
        pendingScore.current = null;
        lastSent.current = Date.now();
        arcadeApi.report({ ...auth, score: s }).catch(() => {});
      };
      const wait = 1500 - (Date.now() - lastSent.current);
      if (wait <= 0) send();
      else setTimeout(send, wait);
    },
    [auth],
  );

  if (!auth) {
    return (
      <Centered>
        <p className="text-white/80 font-bold text-lg">This device isn't part of that game.</p>
        <Link to="/join" className="btn-3d-blue px-6 py-3">Join with a PIN</Link>
      </Centered>
    );
  }
  if (game === undefined || me === undefined) {
    return (
      <Centered>
        <Loader2 className="w-10 h-10 text-white/60 animate-spin" />
      </Centered>
    );
  }
  if (game === null) {
    return (
      <Centered>
        <p className="text-white/80 font-bold text-lg">This game no longer exists.</p>
        <Link to="/join" className="btn-3d-blue px-6 py-3">Join another game</Link>
      </Centered>
    );
  }
  if (me === null) {
    return (
      <Centered>
        <p className="text-white/80 font-bold text-lg">You were removed from the game.</p>
        <Link to="/join" className="btn-3d-blue px-6 py-3">Join again</Link>
      </Centered>
    );
  }

  const mode = ARCADE_MODES[game.mode];
  const rank = players.findIndex((p) => p.id === me.id) + 1;
  const scoreLabel = game.mode === 'gold' ? `${me.score.toLocaleString()} 💰` : game.mode === 'racing' ? `${me.score}/${game.settings.goal}` : `${me.score.toLocaleString()} pts`;

  return (
    <div className="h-dvh flex flex-col bg-gradient-to-b from-[#0B1224] to-[#141B34] overflow-hidden">
      {/* Header */}
      <header className="shrink-0 flex items-center gap-3 px-3 py-2 bg-black/30 border-b border-white/10">
        <span className="text-2xl">{me.avatar}</span>
        <div className="min-w-0 flex-1">
          <div className="text-white font-bold truncate leading-tight">{me.nickname}</div>
          <div className="text-white/50 text-xs font-semibold">{mode.emoji} {mode.name}{rank > 0 && game.status !== 'lobby' ? ` · #${rank}` : ''}</div>
        </div>
        {game.status === 'live' && game.endsAt && game.mode !== 'tower' && game.mode !== 'cafe' && (
          <span className={`font-black tabular-nums px-3 py-1 rounded-full ${game.endsAt - now < 30_000 ? 'bg-rose-500 text-white animate-pulse' : 'bg-white/10 text-white'}`}>
            {formatClock(game.endsAt - now)}
          </span>
        )}
        {game.status !== 'lobby' && game.mode !== 'tower' && game.mode !== 'cafe' && (
          <span className="font-black text-amber-300 text-lg tabular-nums">{scoreLabel}</span>
        )}
        {!online && <WifiOff className="w-5 h-5 text-rose-400" aria-label="Reconnecting" />}
      </header>

      <main className="flex-1 min-h-0 relative">
        {game.status === 'lobby' && (
          <Centered>
            <div className="text-7xl animate-float">{me.avatar}</div>
            <h1 className="text-3xl text-white">You're in, {me.nickname}!</h1>
            <p className="text-white/60 font-semibold max-w-sm">{mode.emoji} {mode.name} — {mode.tagline}</p>
            <p className="text-white/40 text-sm">Waiting for your teacher to start… ({players.length} players)</p>
          </Centered>
        )}

        {game.status === 'live' && game.mode === 'gold' && <GoldQuest auth={auth} />}
        {game.status === 'live' && game.mode === 'racing' && (
          <Racing auth={auth} me={me} players={players} goal={game.settings.goal ?? 20} />
        )}
        {game.status !== 'lobby' && (game.mode === 'tower' || game.mode === 'cafe') && (
          <Suspense fallback={<Centered><Loader2 className="w-10 h-10 text-white/60 animate-spin" /></Centered>}>
            {game.mode === 'tower' ? (
              <TowerDefense earn={earn} reportScore={reportScore} endsAt={game.endsAt} ended={game.status === 'ended'} nickname={me.nickname} avatar={me.avatar} />
            ) : (
              <Cafe earn={earn} reportScore={reportScore} endsAt={game.endsAt} ended={game.status === 'ended'} nickname={me.nickname} avatar={me.avatar} />
            )}
          </Suspense>
        )}

        {game.status === 'ended' && game.mode !== 'tower' && game.mode !== 'cafe' && (
          <Final me={me} players={players} winnerId={game.winnerId} mode={game.mode} />
        )}
        {game.status === 'ended' && (game.mode === 'tower' || game.mode === 'cafe') && (
          <div className="absolute bottom-3 inset-x-3 z-40 rounded-2xl bg-black/70 backdrop-blur px-4 py-3 text-center text-white font-bold">
            Final rank #{rank} of {players.length}
          </div>
        )}

        {asking && game.status === 'live' && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-2 sm:p-6">
            <div className="w-full max-w-2xl h-[92dvh] sm:h-auto sm:max-h-[90dvh] sm:min-h-[60dvh] rounded-3xl bg-[#101830] border border-white/10 overflow-hidden flex flex-col">
              <QuestionPanel key={asking.n} auth={auth} compact onResult={finishAsk} onError={() => setTimeout(() => finishAsk(null), 1500)} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="h-full min-h-[60dvh] flex flex-col items-center justify-center gap-4 p-6 text-center">{children}</div>;
}

function Final({ me, players, winnerId, mode }: { me: ArcadePlayer; players: ArcadePlayer[]; winnerId: string | null; mode: ArcadeGame['mode'] }) {
  const rank = players.findIndex((p) => p.id === me.id) + 1;
  const winner = players.find((p) => p.id === winnerId) ?? players[0];
  return (
    <div className="absolute inset-0 z-30 bg-[#0B1224]/95 flex flex-col items-center justify-center gap-5 p-6 text-center animate-fade-in">
      <Trophy className="w-16 h-16 text-amber-300" />
      <h1 className="text-4xl text-white">Game over!</h1>
      <p className="text-2xl text-white font-black">You placed #{rank}</p>
      <p className="text-white/60 font-semibold">
        {mode === 'gold' ? `${me.score.toLocaleString()} gold` : `${me.score} points`} · {me.correct}/{me.answered} correct
      </p>
      {winner && winner.id !== me.id && (
        <p className="text-white/50">
          Winner: {winner.avatar} {winner.nickname}
        </p>
      )}
      <Link to="/join" className="btn-3d-blue px-6 py-3 mt-2">Play again</Link>
    </div>
  );
}
