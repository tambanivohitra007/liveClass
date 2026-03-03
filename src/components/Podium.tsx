import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { ref, get } from 'firebase/database';
import { db, rtdb } from '../lib/firebase';
import { Crown, Trophy, Medal } from 'lucide-react';
import Confetti from './Confetti';

interface PodiumPlayer {
  playerId: string;
  nickname: string;
  avatar?: string;
  totalPoints: number;
  rank: number;
}

interface PodiumProps {
  sessionId: string;
  onComplete?: () => void;
}

const PODIUM_COLORS = [
  { bar: 'from-yellow-400 to-amber-500', glow: 'shadow-yellow-500/30', ring: 'ring-yellow-400' },
  { bar: 'from-slate-300 to-slate-400', glow: 'shadow-slate-400/20', ring: 'ring-slate-300' },
  { bar: 'from-amber-600 to-amber-700', glow: 'shadow-amber-600/20', ring: 'ring-amber-600' },
];

const PODIUM_HEIGHTS = ['h-32 sm:h-40', 'h-24 sm:h-28', 'h-16 sm:h-20'];
const RANK_ICONS = [
  <Crown key="1" className="w-8 h-8 text-yellow-400 drop-shadow-lg" />,
  <Trophy key="2" className="w-7 h-7 text-slate-300" />,
  <Medal key="3" className="w-7 h-7 text-amber-600" />,
];

export default function Podium({ sessionId, onComplete }: PodiumProps) {
  const [players, setPlayers] = useState<PodiumPlayer[]>([]);
  const [revealStep, setRevealStep] = useState(0); // 0=hidden, 1=3rd, 2=2nd, 3=1st, 4=all+confetti
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    async function loadTop3() {
      // Get nicknames + avatars from players subcollection
      const playersSnap = await getDocs(collection(db, `sessions/${sessionId}/players`));
      const nicknameMap: Record<string, { nickname: string; avatar?: string }> = {};
      playersSnap.docs.forEach((d) => {
        const data = d.data();
        nicknameMap[d.id] = { nickname: data.nickname || '', avatar: data.avatar };
      });

      // Get scores from RTDB
      const scoresSnap = await get(ref(rtdb, `scores/${sessionId}`));
      const allScores = scoresSnap.val() || {};

      const sorted: PodiumPlayer[] = Object.entries(allScores)
        .map(([playerId, score]) => {
          const s = score as { totalPoints: number; nickname?: string };
          const info = nicknameMap[playerId];
          return {
            playerId,
            nickname: s.nickname || info?.nickname || 'Player',
            avatar: info?.avatar,
            totalPoints: s.totalPoints,
            rank: 0,
          };
        })
        .sort((a, b) => b.totalPoints - a.totalPoints)
        .slice(0, 3)
        .map((p, i) => ({ ...p, rank: i + 1 }));

      setPlayers(sorted);
    }
    loadTop3();
  }, [sessionId]);

  // Staggered reveal: 3rd -> 2nd -> 1st -> confetti
  useEffect(() => {
    if (players.length === 0) return;
    const timers = [
      setTimeout(() => setRevealStep(1), 400),
      setTimeout(() => setRevealStep(2), 1200),
      setTimeout(() => setRevealStep(3), 2000),
      setTimeout(() => { setRevealStep(4); setShowConfetti(true); }, 2800),
      setTimeout(() => onComplete?.(), 6000),
    ];
    return () => timers.forEach(clearTimeout);
  }, [players, onComplete]);

  if (players.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-3 border-white/20 border-t-brand rounded-full animate-spin" />
      </div>
    );
  }

  // Display order: 2nd, 1st, 3rd (standard podium layout)
  const displayOrder = [
    players[1], // 2nd place - left
    players[0], // 1st place - center
    players[2], // 3rd place - right
  ].filter(Boolean);

  const revealMap: Record<number, number> = { 1: 3, 2: 2, 3: 1 }; // step -> rank revealed

  return (
    <div className="relative">
      <Confetti active={showConfetti} />

      {/* Title */}
      <div className={`text-center mb-6 sm:mb-8 transition-all duration-500 ${revealStep >= 1 ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-1">Final Results</h1>
        <p className="text-white/40 text-sm">Top performers</p>
      </div>

      {/* Podium */}
      <div className="flex items-end justify-center gap-2 sm:gap-4 max-w-md mx-auto px-4">
        {displayOrder.map((player) => {
          const idx = player.rank - 1;
          const isRevealed = revealStep >= (Object.entries(revealMap).find(([, r]) => r === player.rank)?.[0] ? Number(Object.entries(revealMap).find(([, r]) => r === player.rank)![0]) : 99);
          const colors = PODIUM_COLORS[idx] || PODIUM_COLORS[2];

          return (
            <div
              key={player.playerId}
              className={`flex-1 flex flex-col items-center transition-all duration-700 ${
                isRevealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
              }`}
            >
              {/* Icon */}
              <div className={`mb-2 transition-transform duration-500 ${isRevealed && player.rank === 1 ? 'animate-bounce' : ''}`}>
                {RANK_ICONS[idx]}
              </div>

              {/* Avatar */}
              <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-br ${colors.bar} flex items-center justify-center mb-2 ring-2 ${colors.ring} shadow-lg ${colors.glow} ${
                isRevealed ? 'scale-100' : 'scale-0'
              } transition-transform duration-500`}>
                {player.avatar ? (
                  <span className="text-2xl sm:text-3xl leading-none">{player.avatar}</span>
                ) : (
                  <span className="text-lg sm:text-xl font-bold text-white/90">{player.nickname.charAt(0).toUpperCase()}</span>
                )}
              </div>

              {/* Name + Score */}
              <p className="text-white font-bold text-sm sm:text-base truncate max-w-full text-center">{player.nickname}</p>
              <p className={`text-xs sm:text-sm font-medium mb-2 ${idx === 0 ? 'text-yellow-400' : 'text-white/60'}`}>
                {player.totalPoints.toLocaleString()} pts
              </p>

              {/* Bar */}
              <div className={`w-full rounded-t-xl bg-gradient-to-t ${colors.bar} ${PODIUM_HEIGHTS[idx]} transition-all duration-700 shadow-lg ${colors.glow} ${
                isRevealed ? 'max-h-40' : 'max-h-0'
              } overflow-hidden flex items-center justify-center`}>
                <span className="text-2xl sm:text-4xl font-bold text-white/40">{player.rank}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
