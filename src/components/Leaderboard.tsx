import { useEffect, useRef, useState, useMemo } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { ref, onValue, off } from 'firebase/database';
import { db, rtdb } from '../lib/firebase';
import { Trophy, Flame, Crown, ChevronUp } from 'lucide-react';
import gsap from 'gsap';
import { Flip } from 'gsap/all';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(Flip);

interface LeaderboardPlayer {
  playerId: string;
  nickname?: string;
  totalPoints: number;
  streak?: number;
  rank: number;
}

interface LeaderboardProps {
  sessionId: string;
  top10Snapshot?: LeaderboardPlayer[];
  compact?: boolean;
  currentQuestion?: number;
  totalQuestions?: number;
}

const AVATAR_COLORS = [
  'from-yellow-400 to-amber-500',
  'from-slate-300 to-slate-400',
  'from-amber-600 to-amber-700',
  'from-violet-500 to-purple-600',
  'from-blue-400 to-blue-600',
  'from-emerald-400 to-emerald-600',
  'from-pink-400 to-pink-600',
  'from-orange-400 to-orange-600',
  'from-lime-500 to-green-700',
  'from-cyan-400 to-cyan-600',
];

function getInitials(name: string): string {
  if (!name) return '?';
  const split = name.replace(/([A-Z])/g, ' $1').trim().split(/\s+/);
  if (split.length >= 2) return (split[0][0] + split[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// --- AnimatedPoints sub-component ---
function AnimatedPoints({ value }: { value: number }) {
  const spanRef = useRef<HTMLSpanElement>(null);
  const prevValue = useRef(value);
  const prefersReducedMotion = useRef(
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  useEffect(() => {
    const el = spanRef.current;
    if (!el) return;

    if (prefersReducedMotion.current || prevValue.current === value) {
      el.textContent = value.toLocaleString();
      prevValue.current = value;
      return;
    }

    const from = prevValue.current;
    prevValue.current = value;
    const obj = { v: from };

    gsap.to(obj, {
      v: value,
      duration: 0.8,
      ease: 'power2.out',
      overwrite: true,
      onUpdate() {
        el.textContent = Math.round(obj.v).toLocaleString();
      },
    });
  }, [value]);

  return <span ref={spanRef}>{value.toLocaleString()}</span>;
}

export default function Leaderboard({ sessionId, top10Snapshot, compact, currentQuestion, totalQuestions }: LeaderboardProps) {
  const [entries, setEntries] = useState<LeaderboardPlayer[]>([]);
  const [nicknameMap, setNicknameMap] = useState<Record<string, string>>({});

  const containerRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const flipStateRef = useRef<Flip.FlipState | null>(null);
  const prevEntriesRef = useRef<LeaderboardPlayer[]>([]);
  const isFirstRender = useRef(true);
  const prefersReducedMotion = useRef(
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  // Always subscribe to players to get nicknames
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, `sessions/${sessionId}/players`),
      (snapshot) => {
        const map: Record<string, string> = {};
        snapshot.docs.forEach((d) => {
          map[d.id] = d.data().nickname || '';
        });
        setNicknameMap(map);
      }
    );
    return unsub;
  }, [sessionId]);

  useEffect(() => {
    if (top10Snapshot && top10Snapshot.length > 0) {
      setEntries(top10Snapshot.map((p) => ({
        ...p,
        nickname: p.nickname || nicknameMap[p.playerId] || undefined,
      })));
      return;
    }

    // Subscribe to RTDB scores for live leaderboard (faster than Firestore shards)
    const scoresRef = ref(rtdb, `scores/${sessionId}`);
    const handler = onValue(scoresRef, (snapshot) => {
      const allScores = snapshot.val() || {};
      const sorted = Object.entries(allScores)
        .map(([playerId, score]) => {
          const s = score as { totalPoints: number; streak: number; nickname?: string };
          return {
            playerId,
            nickname: s.nickname || nicknameMap[playerId],
            totalPoints: s.totalPoints,
            streak: s.streak,
            rank: 0,
          };
        })
        .sort((a, b) => b.totalPoints - a.totalPoints)
        .slice(0, 10)
        .map((p, i) => ({ ...p, rank: i + 1 }));

      setEntries(sorted);
    });

    return () => off(scoresRef, 'value', handler);
  }, [sessionId, top10Snapshot, nicknameMap]);

  // Compute overtakers and new-leader detection
  const { overtakers, isNewLeader, rankDeltas } = useMemo(() => {
    const prev = prevEntriesRef.current;
    const overtakerSet = new Set<string>();
    const deltas = new Map<string, number>();
    let newLeader = false;

    if (prev.length > 0 && entries.length > 0) {
      const prevRankMap = new Map(prev.map(e => [e.playerId, e.rank]));

      for (const entry of entries) {
        const oldRank = prevRankMap.get(entry.playerId);
        if (oldRank !== undefined) {
          const delta = oldRank - entry.rank; // positive = moved up
          if (delta > 0) {
            overtakerSet.add(entry.playerId);
            deltas.set(entry.playerId, delta);
          }
        }
      }

      // New leader detection
      const prevLeaderId = prev[0]?.playerId;
      const curLeaderId = entries[0]?.playerId;
      if (curLeaderId && prevLeaderId && curLeaderId !== prevLeaderId) {
        newLeader = true;
      }
    }

    return { overtakers: overtakerSet, isNewLeader: newLeader, rankDeltas: deltas };
  }, [entries]);

  // Capture Flip state BEFORE React updates the DOM
  // We use useEffect with a layout trick: capture state before render via ref update
  useEffect(() => {
    // Before next render, save current Flip state
    if (containerRef.current && entries.length > 0) {
      flipStateRef.current = Flip.getState(
        containerRef.current.querySelectorAll('[data-flip-id]')
      );
    }
  });

  // Animate after DOM updates
  useGSAP(() => {
    if (prefersReducedMotion.current || !containerRef.current || entries.length === 0) {
      prevEntriesRef.current = entries;
      isFirstRender.current = false;
      return;
    }

    if (isFirstRender.current) {
      prevEntriesRef.current = entries;
      isFirstRender.current = false;
      return;
    }

    // FLIP animation for rank reordering
    if (flipStateRef.current) {
      Flip.from(flipStateRef.current, {
        duration: 0.6,
        ease: 'power2.inOut',
        absolute: true,
        overwrite: true,
      });
    }

    // New leader elastic celebration
    if (isNewLeader && heroRef.current) {
      gsap.fromTo(heroRef.current,
        { scale: 0.95 },
        { scale: 1, duration: 0.8, ease: 'elastic.out(1, 0.4)', overwrite: true }
      );
    }

    prevEntriesRef.current = entries;
  }, { dependencies: [entries, isNewLeader], scope: containerRef });

  if (entries.length === 0) {
    return (
      <div className="text-center py-8 text-white/40">
        <Trophy className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p>No scores yet</p>
      </div>
    );
  }

  const displayEntries = compact ? entries.slice(0, 5) : entries;
  const leader = displayEntries[0];
  const rest = displayEntries.slice(1);

  return (
    <div className="animate-fade-in" ref={containerRef}>
      {/* Header */}
      <div className="text-center mb-5">
        <h3 className="text-xl font-bold text-white mb-1">Current Standings</h3>
        <div className="flex items-center justify-center gap-3">
          <p className="text-brand/70 text-sm font-medium">
            {compact ? 'Top 5' : `Top ${displayEntries.length}`}
          </p>
          {currentQuestion != null && totalQuestions != null && totalQuestions > 0 && (
            <>
              <span className="w-1 h-1 rounded-full bg-white/20" />
              <p className="text-white/40 text-sm font-medium">
                Q {currentQuestion}/{totalQuestions}
                {currentQuestion < totalQuestions && (
                  <span className="text-white/25"> &middot; {totalQuestions - currentQuestion} left</span>
                )}
              </p>
            </>
          )}
        </div>
      </div>

      {/* #1 Hero Card */}
      <div className="mb-3" data-flip-id={leader.playerId} ref={heroRef}>
        <div className={`relative bg-gradient-to-r from-brand via-warning to-brand p-[2px] rounded-2xl shadow-lg shadow-brand/25${isNewLeader ? ' new-leader-celebrate' : ''}`}>
          <div className="bg-surface-dark/90 backdrop-blur rounded-[14px] p-5 flex items-center justify-between">
            <div className="flex items-center gap-5">
              <div className="relative">
                <Crown className="absolute -top-5 left-1/2 -translate-x-1/2 w-7 h-7 text-warning drop-shadow-md" />
                <div className={`w-14 h-14 rounded-full border-2 border-brand bg-gradient-to-br ${AVATAR_COLORS[0]} flex items-center justify-center shadow-lg`}>
                  <span className="text-base font-black text-white drop-shadow">
                    {getInitials(leader.nickname || leader.playerId)}
                  </span>
                </div>
                <div className="absolute -bottom-1 -right-1 bg-brand text-white font-black text-[10px] px-1.5 py-0.5 rounded-md shadow-lg">
                  1ST
                </div>
              </div>
              <div>
                <h4 className="text-lg font-bold text-white">{leader.nickname || leader.playerId.slice(0, 8)}</h4>
                <p className="text-brand font-semibold text-base">
                  <AnimatedPoints value={leader.totalPoints} /> <span className="text-xs uppercase opacity-70">pts</span>
                </p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              {leader.streak && leader.streak > 1 && (
                <span className="flex items-center gap-1 text-warning font-bold text-sm animate-fire-flicker">
                  <Flame className="w-4 h-4" />
                  {leader.streak}
                </span>
              )}
              <span className="text-white/30 text-xs uppercase tracking-widest font-bold">Leader</span>
            </div>
          </div>
        </div>
      </div>

      {/* Remaining Players */}
      <div className="space-y-2">
        {rest.map((entry) => {
          const didOvertake = overtakers.has(entry.playerId);
          const delta = rankDeltas.get(entry.playerId);

          return (
            <div
              key={entry.playerId}
              data-flip-id={entry.playerId}
              className={`bg-white/5 backdrop-blur-sm border border-white/10 hover:bg-white/10 transition-colors rounded-xl px-4 py-3 flex items-center justify-between${didOvertake ? ' leaderboard-overtake' : ''}`}
            >
              <div className="flex items-center gap-3">
                <span className="text-white/30 font-black text-lg w-6 text-center shrink-0 flex items-center justify-center gap-0.5">
                  {didOvertake && delta && (
                    <ChevronUp className="w-3.5 h-3.5 text-brand shrink-0" />
                  )}
                  {entry.rank}
                </span>
                <div className={`w-10 h-10 rounded-full border-2 ${entry.rank <= 3 ? 'border-white/25' : 'border-white/10'} bg-gradient-to-br ${AVATAR_COLORS[entry.rank - 1] || AVATAR_COLORS[3]} flex items-center justify-center shrink-0`}>
                  <span className="text-xs font-bold text-white">
                    {getInitials(entry.nickname || entry.playerId)}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-white text-sm truncate">{entry.nickname || entry.playerId.slice(0, 8)}</p>
                  <p className="text-white/40 text-xs"><AnimatedPoints value={entry.totalPoints} /> pts</p>
                </div>
              </div>
              {entry.streak && entry.streak > 1 ? (
                <span className="flex items-center gap-1 text-warning font-bold text-xs shrink-0">
                  <Flame className="w-3 h-3" />
                  {entry.streak}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
