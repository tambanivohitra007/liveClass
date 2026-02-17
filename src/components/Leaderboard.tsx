import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Trophy, Medal, Flame } from 'lucide-react';

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
}

const medalColors = ['', 'text-yellow-500', 'text-gray-400', 'text-amber-600'];

export default function Leaderboard({ sessionId, top10Snapshot, compact }: LeaderboardProps) {
  const [entries, setEntries] = useState<LeaderboardPlayer[]>([]);

  useEffect(() => {
    if (top10Snapshot && top10Snapshot.length > 0) {
      setEntries(top10Snapshot);
      return;
    }

    // Listen to all 10 shards and aggregate player scores
    const unsubscribe = onSnapshot(
      collection(db, `sessions/${sessionId}/leaderboard_shards`),
      (snapshot) => {
        const allPlayers: Record<string, { totalPoints: number; streak: number }> = {};
        snapshot.docs.forEach((shardDoc) => {
          const players = shardDoc.data().players || {};
          for (const [pid, data] of Object.entries(players)) {
            const pdata = data as { totalPoints: number; streak: number };
            allPlayers[pid] = pdata;
          }
        });

        const sorted = Object.entries(allPlayers)
          .map(([playerId, data]) => ({
            playerId,
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
  }, [sessionId, top10Snapshot]);

  if (entries.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        <p>No scores yet</p>
      </div>
    );
  }

  const displayEntries = compact ? entries.slice(0, 5) : entries;

  return (
    <div className="animate-fade-in">
      <h3 className="text-lg font-bold text-gray-900 mb-4">
        Leaderboard {compact && <span className="text-gray-400 font-normal text-sm">Top 5</span>}
      </h3>

      <div className="space-y-2">
        {displayEntries.map((entry, i) => (
          <div
            key={entry.playerId}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all animate-slide-up ${
              entry.rank <= 3
                ? 'bg-gradient-to-r from-brand/5 to-transparent border border-brand/10'
                : 'bg-white border border-gray-100'
            }`}
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <span className="w-8 flex items-center justify-center font-bold text-lg">
              {entry.rank === 1 ? <Trophy className={`w-5 h-5 ${medalColors[1]}`} /> :
               entry.rank <= 3 ? <Medal className={`w-5 h-5 ${medalColors[entry.rank]}`} /> :
               <span className="text-gray-400">{entry.rank}</span>}
            </span>
            <span className="flex-1 font-medium text-gray-800 truncate">
              {entry.nickname || entry.playerId.slice(0, 8)}
            </span>
            {entry.streak && entry.streak > 1 ? (
              <span className="text-xs px-2 py-0.5 bg-warning/20 text-warning rounded-full font-medium flex items-center gap-1">
                <Flame className="w-3 h-3" />
                {entry.streak}
              </span>
            ) : null}
            <span className="font-bold text-brand tabular-nums">
              {entry.totalPoints.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
