import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';
import type {
  ArcadeAnswerResult, ArcadeChestResult, ArcadeMode, ArcadeQuestion, ArcadeSettings, ArcadeTarget, ChestOutcome,
} from '../../types/arcade';

function call<Req, Res>(name: string) {
  const fn = httpsCallable<Req, Res>(functions, name);
  return async (data: Req): Promise<Res> => (await fn(data)).data;
}

export interface PlayerAuth {
  gameId: string;
  playerId: string;
  token: string;
}

export const arcadeApi = {
  create: call<{ quizId: string; mode: ArcadeMode; settings: Partial<ArcadeSettings> }, { gameId: string; pinCode: string }>('arcadeCreate'),
  start: call<{ gameId: string }, { ok: boolean }>('arcadeStart'),
  end: call<{ gameId: string }, { ok: boolean }>('arcadeEnd'),
  setLock: call<{ gameId: string; locked: boolean }, { ok: boolean }>('arcadeSetLock'),
  kick: call<{ gameId: string; playerId: string }, { ok: boolean }>('arcadeKick'),
  next: call<PlayerAuth, { question: ArcadeQuestion }>('arcadeNext'),
  answer: call<PlayerAuth & { answer: string | string[] }, ArcadeAnswerResult>('arcadeAnswer'),
  chest: call<PlayerAuth & { index: number }, ArcadeChestResult>('arcadeChest'),
  target: call<PlayerAuth & { targetId: string }, { score: number; gained: number; targetScore: number; outcome: ChestOutcome; describe: string }>('arcadeTarget'),
  resume: call<PlayerAuth, { chests: boolean; pending: ChestOutcome | null; targets: ArcadeTarget[] }>('arcadeResume'),
  report: call<PlayerAuth & { score: number }, { ok: boolean; score?: number }>('arcadeReport'),
};

/** The secret issued by arcadeJoin, kept so students can rejoin after a refresh or Wi-Fi drop. */
export function loadPlayerAuth(gameId: string, playerId: string): PlayerAuth | null {
  try {
    const stored = JSON.parse(localStorage.getItem(`liveclass_arcade_${gameId}`) || 'null') as { playerId?: string; token?: string } | null;
    if (stored?.playerId === playerId && stored.token) return { gameId, playerId, token: stored.token };
  } catch {
    /* ignore */
  }
  return null;
}

export function formatClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function chestLabel(o: ChestOutcome): { emoji: string; title: string; tone: 'good' | 'bad' | 'neutral' | 'social' } {
  switch (o.kind) {
    case 'gain': return { emoji: '💰', title: `+${o.amount} Gold`, tone: 'good' };
    case 'double': return { emoji: '✖️2', title: 'Double Gold!', tone: 'good' };
    case 'triple': return { emoji: '✖️3', title: 'Triple Gold!', tone: 'good' };
    case 'lose': return { emoji: '💸', title: `Lose ${o.percent}%`, tone: 'bad' };
    case 'steal': return { emoji: '🦹', title: `Steal ${o.percent}%`, tone: 'social' };
    case 'swap': return { emoji: '🔄', title: 'Swap!', tone: 'social' };
    case 'nothing': return { emoji: '💨', title: 'Nothing', tone: 'neutral' };
  }
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong';
}
