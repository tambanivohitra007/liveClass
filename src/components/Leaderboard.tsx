import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';

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

export default function Leaderboard({ sessionId, top10Snapshot, compact }: LeaderboardProps) {
  const [entries, setEntries] = useState<LeaderboardPlayer[]>([]);

  useEffect(() => {
    if (top10Snapshot && top10Snapshot.length > 0) {
      setEntries(top10Snapshot);
      return;
    }

    const q = query(
      collection(db, `sessions/${sessionId}/leaderboard_shards`),
      orderBy('totalPoints', 'desc'),
      limit(10)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((doc, i) => ({
        playerId: doc.id,
        totalPoints: doc.data().totalPoints,
        streak: doc.data().streak,
        rank: i + 1,
      }));
      setEntries(data);
    });

    return unsubscribe;
  }, [sessionId, top10Snapshot]);

  if (entries.length === 0) return <p>No scores yet</p>;

  const displayEntries = compact ? entries.slice(0, 5) : entries;

  return (
    <div>
      <h3>Leaderboard {compact ? '(Top 5)' : '(Top 10)'}</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '0.5rem' }}>Rank</th>
            <th style={{ textAlign: 'left', padding: '0.5rem' }}>Player</th>
            <th style={{ textAlign: 'right', padding: '0.5rem' }}>Points</th>
            <th style={{ textAlign: 'right', padding: '0.5rem' }}>Streak</th>
          </tr>
        </thead>
        <tbody>
          {displayEntries.map((entry) => (
            <tr key={entry.playerId} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '0.5rem' }}>{entry.rank}</td>
              <td style={{ padding: '0.5rem' }}>{entry.nickname || entry.playerId}</td>
              <td style={{ textAlign: 'right', padding: '0.5rem' }}>{entry.totalPoints}</td>
              <td style={{ textAlign: 'right', padding: '0.5rem' }}>{entry.streak}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
