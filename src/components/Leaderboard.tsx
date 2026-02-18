import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Trophy, Flame, Crown } from 'lucide-react';

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

export default function Leaderboard({ sessionId, top10Snapshot, compact, currentQuestion, totalQuestions }: LeaderboardProps) {
  const [entries, setEntries] = useState<LeaderboardPlayer[]>([]);
  const [nicknameMap, setNicknameMap] = useState<Record<string, string>>({});

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

    const unsubscribe = onSnapshot(
      collection(db, `sessions/${sessionId}/leaderboard_shards`),
      (snapshot) => {
        const allPlayers: Record<string, { totalPoints: number; streak: number; nickname?: string }> = {};
        snapshot.docs.forEach((shardDoc) => {
          const players = shardDoc.data().players || {};
          for (const [pid, data] of Object.entries(players)) {
            const pdata = data as { totalPoints: number; streak: number; nickname?: string };
            allPlayers[pid] = pdata;
          }
        });

        const sorted = Object.entries(allPlayers)
          .map(([playerId, data]) => ({
            playerId,
            nickname: data.nickname || nicknameMap[playerId],
            totalPoints: data.totalPoints,
            streak: data.streak,
            rank: 0,
          }))
          .sort((a, b) => b.totalPoints - a.totalPoints)
          .slice(0, 10)
          .map((p, i) => ({ ...p, rank: i + 1 }));

        setEntries(sorted);
      }
    );

    return unsubscribe;
  }, [sessionId, top10Snapshot, nicknameMap]);

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
    <div className="animate-fade-in">
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
      <div className="mb-3">
        <div className="relative bg-gradient-to-r from-brand via-warning to-brand p-[2px] rounded-2xl shadow-lg shadow-brand/25">
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
                  {leader.totalPoints.toLocaleString()} <span className="text-xs uppercase opacity-70">pts</span>
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
        {rest.map((entry, i) => (
          <div
            key={entry.playerId}
            className="bg-white/5 backdrop-blur-sm border border-white/10 hover:bg-white/10 transition-all rounded-xl px-4 py-3 flex items-center justify-between animate-slide-up"
            style={{ animationDelay: `${(i + 1) * 60}ms` }}
          >
            <div className="flex items-center gap-3">
              <span className="text-white/30 font-black text-lg w-6 text-center shrink-0">
                {entry.rank}
              </span>
              <div className={`w-10 h-10 rounded-full border-2 ${entry.rank <= 3 ? 'border-white/25' : 'border-white/10'} bg-gradient-to-br ${AVATAR_COLORS[entry.rank - 1] || AVATAR_COLORS[3]} flex items-center justify-center shrink-0`}>
                <span className="text-xs font-bold text-white">
                  {getInitials(entry.nickname || entry.playerId)}
                </span>
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-white text-sm truncate">{entry.nickname || entry.playerId.slice(0, 8)}</p>
                <p className="text-white/40 text-xs">{entry.totalPoints.toLocaleString()} pts</p>
              </div>
            </div>
            {entry.streak && entry.streak > 1 ? (
              <span className="flex items-center gap-1 text-warning font-bold text-xs shrink-0">
                <Flame className="w-3 h-3" />
                {entry.streak}
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
