import { create } from 'zustand';
import type { Session, SessionPlayer, LeaderboardEntry } from '../types/models';

interface SessionState {
  session: Session | null;
  players: SessionPlayer[];
  leaderboard: LeaderboardEntry[];
  setSession: (session: Session | null) => void;
  setPlayers: (players: SessionPlayer[]) => void;
  setLeaderboard: (leaderboard: LeaderboardEntry[]) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  session: null,
  players: [],
  leaderboard: [],
  setSession: (session) => set({ session }),
  setPlayers: (players) => set({ players }),
  setLeaderboard: (leaderboard) => set({ leaderboard }),
}));
