// Blooket-style game modes (Gold Quest, Racing, Tower Defense, Café), server-authoritative.
// Correct answers and chest outcomes never leave the server before a player commits.
import crypto from 'node:crypto';
import { onCall, HttpsError, type CallableRequest } from '../shims/firebase-functions';
import { autoId, type JsonObject } from '../../../src/lan/shared/values';
import type { WriteOp } from '../../../src/lan/shared/protocol';
import { rt } from '../runtime';
import { getAdminEmail } from '../rules';
import { checkCorrectness } from '../../../functions/src/logic';
import {
  ARCADE_MODES, ARCADE_QUESTION_TYPES,
  type ArcadeAnswerResult, type ArcadeChestResult, type ArcadeEventType, type ArcadeGame, type ArcadeMode,
  type ArcadePlayer, type ArcadeQuestion, type ArcadeSettings, type ArcadeTarget, type ChestOutcome,
} from '../../../src/types/arcade';

const MAX_PLAYERS = 200;
const MAX_TIME_LIMIT = 60 * 60;

interface StoredQuestion {
  id: string;
  type: string;
  text: string;
  options?: string[];
  correctAnswers?: string[];
  imageUrl?: string;
  codeSnippet?: string;
  codeLanguage?: string;
}

interface PrivateState {
  token: string;
  deck: string[];
  deckPos: number;
  currentQ: string | null;
  chests: ChestOutcome[] | null;
  pending: ChestOutcome | null;
  /** Tower Defense / Café: resources granted by correct answers (bounds the reported score). */
  earned: number;
}

// ---------------------------------------------------------------- store helpers

const gamePath = (id: string) => `arcade_games/${id}`;
const playerPath = (g: string, p: string) => `arcade_games/${g}/players/${p}`;
const privPath = (g: string, p: string) => `arcade_private/${g}__${p}`;

function getGame(id: string): ArcadeGame {
  if (typeof id !== 'string' || !id || id.includes('/')) throw new HttpsError('invalid-argument', 'gameId is required');
  const d = rt().docs.getDoc(gamePath(id));
  if (!d) throw new HttpsError('not-found', 'Game not found');
  return { ...(d as unknown as ArcadeGame), id };
}

function getPlayer(gameId: string, playerId: string): ArcadePlayer | null {
  const d = rt().docs.getDoc(playerPath(gameId, playerId));
  return d ? ({ ...(d as unknown as ArcadePlayer), id: playerId }) : null;
}

function listPlayers(gameId: string): ArcadePlayer[] {
  return rt().docs
    .query({ path: `arcade_games/${gameId}/players`, where: [], orderBy: [] })
    .map((d) => ({ ...(d.data as unknown as ArcadePlayer), id: d.id }));
}

function commit(ops: WriteOp[]): void {
  rt().docs.commit(ops);
}

function set(path: string, data: object, merge = false): WriteOp {
  return { op: 'set', path, data: JSON.parse(JSON.stringify(data)) as JsonObject, merge };
}

function event(gameId: string, type: ArcadeEventType, text: string, actorId: string, targetId: string | null = null): WriteOp {
  return set(`arcade_games/${gameId}/events/${Date.now().toString(36)}${autoId().slice(0, 6)}`, {
    type, text, at: Date.now(), actorId, targetId,
  });
}

function requireOwner(req: CallableRequest, game: ArcadeGame): void {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in required');
  const isAdmin = !!req.auth.token.email && req.auth.token.email === getAdminEmail();
  if (game.ownerId !== req.auth.uid && !isAdmin) throw new HttpsError('permission-denied', 'Only the host can do that');
}

/** Authenticates a player by the secret token issued at join time (students may be guests). */
function requirePlayer(data: { gameId?: string; playerId?: string; token?: string }): { game: ArcadeGame; player: ArcadePlayer; priv: PrivateState } {
  const game = getGame(String(data.gameId ?? ''));
  const playerId = String(data.playerId ?? '');
  const player = playerId && !playerId.includes('/') ? getPlayer(game.id, playerId) : null;
  const priv = player ? (rt().docs.getDoc(privPath(game.id, player.id)) as unknown as PrivateState | null) : null;
  if (!player || !priv || typeof data.token !== 'string' || priv.token !== data.token) {
    throw new HttpsError('permission-denied', 'You are not in this game. Join again with the PIN.');
  }
  return { game, player, priv };
}

function requireLive(game: ArcadeGame): void {
  if (game.status === 'lobby') throw new HttpsError('failed-precondition', 'The game has not started yet');
  if (game.status === 'ended') throw new HttpsError('failed-precondition', 'The game is over');
}

// ---------------------------------------------------------------- questions

const questionCache = new Map<string, StoredQuestion[]>();

function playable(q: StoredQuestion): boolean {
  if (!(ARCADE_QUESTION_TYPES as readonly string[]).includes(q.type)) return false;
  if (!q.correctAnswers?.length) return false;
  if ((q.type === 'mcq' || q.type === 'tf') && !(q.options?.length)) return false;
  return true;
}

function loadQuestions(quizId: string): StoredQuestion[] {
  return rt().docs
    .query({ path: 'questions', where: [['quizId', '==', quizId]], orderBy: [] })
    .map((d) => ({ ...(d.data as unknown as StoredQuestion), id: d.id }))
    .filter(playable);
}

function gameQuestions(game: ArcadeGame): StoredQuestion[] {
  let qs = questionCache.get(game.id);
  if (!qs) {
    qs = loadQuestions(game.quizId);
    questionCache.set(game.id, qs);
  }
  return qs;
}

function shuffle<T>(a: T[]): T[] {
  const out = [...a];
  for (let i = out.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function publicQuestion(q: StoredQuestion): ArcadeQuestion {
  const multi = q.type === 'mcq' && (q.correctAnswers?.length ?? 0) > 1;
  return {
    id: q.id,
    type: q.type as ArcadeQuestion['type'],
    text: q.text,
    options: q.type === 'mcq' || q.type === 'tf' ? shuffle(q.options ?? []) : [],
    multi,
    imageUrl: q.imageUrl ?? null,
    codeSnippet: q.codeSnippet ?? null,
    codeLanguage: q.codeLanguage ?? null,
  };
}

function isCorrect(q: StoredQuestion, answer: string): boolean {
  if (q.type === 'short') {
    const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
    return (q.correctAnswers ?? []).some((a) => norm(a) === norm(answer));
  }
  return checkCorrectness(answer, q);
}

// ---------------------------------------------------------------- Gold Quest chests

function rand(): number {
  return crypto.randomInt(1_000_000) / 1_000_000;
}

function pick<T>(items: T[]): T {
  return items[crypto.randomInt(items.length)];
}

/** Chest amounts grow as the player answers more, like Blooket. */
function rollChest(correctSoFar: number, othersHaveGold: boolean): ChestOutcome {
  const tier = 1 + Math.floor(correctSoFar / 5);
  const r = rand();
  if (r < 0.46) return { kind: 'gain', amount: pick([10, 15, 20, 25, 30, 40, 50, 75, 100]) * tier };
  if (r < 0.54) return { kind: 'double' };
  if (r < 0.58) return { kind: 'triple' };
  if (r < 0.68) return { kind: 'lose', percent: pick([25, 50]) };
  if (r < 0.82 && othersHaveGold) return { kind: 'steal', percent: pick([10, 20, 25, 50]) };
  if (r < 0.86 && othersHaveGold) return { kind: 'swap' };
  if (r < 0.93) return { kind: 'nothing' };
  return { kind: 'gain', amount: pick([10, 20, 30]) * tier };
}

function describe(o: ChestOutcome): string {
  switch (o.kind) {
    case 'gain': return `+${o.amount} gold`;
    case 'double': return 'doubled their gold';
    case 'triple': return 'tripled their gold';
    case 'lose': return `lost ${o.percent}% of their gold`;
    case 'steal': return `steal ${o.percent}%`;
    case 'swap': return 'swap';
    case 'nothing': return 'nothing';
  }
}

// ---------------------------------------------------------------- end-of-game

function endGame(gameId: string, reason: string): void {
  const game = getGame(gameId);
  if (game.status === 'ended') return;
  const players = listPlayers(gameId).sort((a, b) => b.score - a.score || (a.finishedAt ?? Infinity) - (b.finishedAt ?? Infinity));
  const winnerId = game.winnerId ?? players[0]?.id ?? null;
  commit([set(gamePath(gameId), { status: 'ended', endedAt: Date.now(), winnerId, joinLocked: true }, true)]);
  questionCache.delete(gameId);
  console.log(`[arcade] game ${game.pinCode} ended (${reason})`);
}

let ticker: NodeJS.Timeout | null = null;
function startTicker(): void {
  if (ticker) return;
  ticker = setInterval(() => {
    const now = Date.now();
    for (const d of rt().docs.query({ path: 'arcade_games', where: [['status', '==', 'live']], orderBy: [] })) {
      const endsAt = d.data.endsAt as number | null;
      if (endsAt && endsAt <= now) endGame(d.id, 'time');
    }
  }, 1000);
  ticker.unref();
}

// ---------------------------------------------------------------- callables

function uniquePin(): string {
  const docs = rt().docs;
  for (let i = 0; i < 50; i++) {
    const pin = String(100000 + crypto.randomInt(900000));
    const clash = ['sessions', 'live_gradings', 'mini_games', 'arcade_games'].some(
      (c) => docs.query({ path: c, where: [['pinCode', '==', pin], ['status', '!=', 'ended']], orderBy: [], limit: 1 }).length > 0,
    );
    if (!clash) return pin;
  }
  throw new HttpsError('resource-exhausted', 'Could not allocate a PIN, try again');
}

function clampSettings(mode: ArcadeMode, s: Partial<ArcadeSettings> | undefined): ArcadeSettings {
  const d = ARCADE_MODES[mode].defaults;
  const num = (v: unknown, dflt: number | null): number | null => {
    const x = v === undefined ? dflt : v;
    return x === null || x === '' ? null : Number(x);
  };
  const time = num(s?.timeLimitSec, d.timeLimitSec);
  const goal = num(s?.goal, d.goal);
  const settings: ArcadeSettings = {
    timeLimitSec: time === null || !Number.isFinite(time) ? null : Math.min(MAX_TIME_LIMIT, Math.max(60, Math.round(time))),
    goal: goal === null || !Number.isFinite(goal) ? null : Math.max(1, Math.round(goal)),
  };
  if (mode === 'racing') settings.goal = Math.min(100, Math.max(5, settings.goal ?? 20));
  if (mode === 'gold' && settings.goal !== null) settings.goal = Math.min(1_000_000, Math.max(100, settings.goal));
  if (mode !== 'racing' && mode !== 'gold') settings.goal = null;
  if (settings.timeLimitSec === null && settings.goal === null) settings.timeLimitSec = d.timeLimitSec ?? 7 * 60;
  return settings;
}

export const arcadeCreate = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in to host a game');
  const { quizId, mode, settings } = (req.data ?? {}) as { quizId?: string; mode?: ArcadeMode; settings?: Partial<ArcadeSettings> };
  if (!mode || !(mode in ARCADE_MODES)) throw new HttpsError('invalid-argument', 'Unknown game mode');
  if (!quizId || typeof quizId !== 'string' || quizId.includes('/')) throw new HttpsError('invalid-argument', 'Choose a question set');
  const quiz = rt().docs.getDoc(`quizzes/${quizId}`);
  if (!quiz) throw new HttpsError('not-found', 'Question set not found');
  const user = rt().docs.getDoc(`users/${req.auth.uid}`);
  if (quiz.ownerId !== req.auth.uid && quiz.visibility !== 'public' && user?.role !== 'teacher') {
    throw new HttpsError('permission-denied', 'You cannot host this question set');
  }
  const questions = loadQuestions(quizId);
  if (questions.length === 0) {
    throw new HttpsError('failed-precondition', 'This set has no questions arcade games can use (multiple choice, true/false, short answer or code output).');
  }
  const id = autoId();
  const game: Omit<ArcadeGame, 'id'> = {
    ownerId: req.auth.uid,
    quizId,
    quizTitle: String(quiz.title ?? 'Untitled'),
    mode,
    pinCode: uniquePin(),
    status: 'lobby',
    joinLocked: false,
    settings: clampSettings(mode, settings),
    questionCount: questions.length,
    playerCount: 0,
    createdAt: Date.now(),
    startedAt: null,
    endsAt: null,
    endedAt: null,
    winnerId: null,
  };
  commit([set(gamePath(id), game)]);
  questionCache.set(id, questions);
  return { gameId: id, pinCode: game.pinCode };
});

export const arcadeJoin = onCall(async (req) => {
  const { gameId, nickname, avatar, playerId, token } = (req.data ?? {}) as Record<string, string | undefined>;
  const game = getGame(String(gameId ?? ''));
  if (game.status === 'ended') throw new HttpsError('failed-precondition', 'This game has ended');

  // Rejoin with the secret issued earlier (refresh, lost Wi-Fi, closed tab).
  if (playerId && token) {
    const existing = getPlayer(game.id, playerId);
    const priv = existing ? (rt().docs.getDoc(privPath(game.id, playerId)) as unknown as PrivateState | null) : null;
    if (existing && priv && priv.token === token) {
      return { playerId, nickname: existing.nickname, avatar: existing.avatar, token };
    }
  }

  if (game.joinLocked) throw new HttpsError('failed-precondition', 'This game is locked. Ask your teacher to unlock it.');
  const name = String(nickname ?? '').trim().slice(0, 20);
  if (!name) throw new HttpsError('invalid-argument', 'Choose a nickname');
  const players = listPlayers(game.id);
  if (players.length >= MAX_PLAYERS) throw new HttpsError('resource-exhausted', 'This game is full');
  if (players.some((p) => p.nickname.toLowerCase() === name.toLowerCase())) {
    throw new HttpsError('already-exists', 'That nickname is taken — pick another one');
  }

  const id = autoId();
  const newToken = crypto.randomBytes(24).toString('hex');
  const now = Date.now();
  const player: Omit<ArcadePlayer, 'id'> = {
    nickname: name,
    avatar: String(avatar ?? '🙂').slice(0, 8),
    score: 0,
    correct: 0,
    answered: 0,
    streak: 0,
    joinedAt: now,
    lastActiveAt: now,
    finishedAt: null,
  };
  const priv: PrivateState = { token: newToken, deck: [], deckPos: 0, currentQ: null, chests: null, pending: null, earned: 0 };
  commit([
    set(playerPath(game.id, id), player),
    set(privPath(game.id, id), priv),
    set(gamePath(game.id), { playerCount: players.length + 1 }, true),
  ]);
  return { playerId: id, nickname: name, avatar: player.avatar, token: newToken };
});

export const arcadeStart = onCall(async (req) => {
  const game = getGame(String(req.data?.gameId ?? ''));
  requireOwner(req, game);
  if (game.status !== 'lobby') throw new HttpsError('failed-precondition', 'Game already started');
  const now = Date.now();
  commit([set(gamePath(game.id), {
    status: 'live',
    startedAt: now,
    endsAt: game.settings.timeLimitSec ? now + game.settings.timeLimitSec * 1000 : null,
  }, true)]);
  startTicker();
  return { ok: true };
});

export const arcadeEnd = onCall(async (req) => {
  const game = getGame(String(req.data?.gameId ?? ''));
  requireOwner(req, game);
  endGame(game.id, 'host');
  return { ok: true };
});

export const arcadeSetLock = onCall(async (req) => {
  const game = getGame(String(req.data?.gameId ?? ''));
  requireOwner(req, game);
  commit([set(gamePath(game.id), { joinLocked: !!req.data?.locked }, true)]);
  return { ok: true };
});

export const arcadeKick = onCall(async (req) => {
  const game = getGame(String(req.data?.gameId ?? ''));
  requireOwner(req, game);
  const pid = String(req.data?.playerId ?? '');
  if (!getPlayer(game.id, pid)) throw new HttpsError('not-found', 'Player not found');
  commit([
    { op: 'delete', path: playerPath(game.id, pid) },
    { op: 'delete', path: privPath(game.id, pid) },
    set(gamePath(game.id), { playerCount: Math.max(0, listPlayers(game.id).length - 1) }, true),
  ]);
  return { ok: true };
});

/** Deals the next question from the player's own shuffled deck (reshuffled when exhausted). */
export const arcadeNext = onCall(async (req) => {
  const { game, player, priv } = requirePlayer(req.data ?? {});
  requireLive(game);
  if (game.mode === 'gold' && (priv.chests || priv.pending)) {
    throw new HttpsError('failed-precondition', 'Open your chest first');
  }
  if (player.finishedAt) throw new HttpsError('failed-precondition', 'You already finished');
  const qs = gameQuestions(game);
  if (qs.length === 0) throw new HttpsError('failed-precondition', 'No questions available');
  let { deck, deckPos } = priv;
  if (!priv.currentQ) {
    if (deckPos >= deck.length || !deck.every((id) => qs.some((q) => q.id === id))) {
      deck = shuffle(qs.map((q) => q.id));
      // Avoid asking the same question twice in a row across reshuffles.
      if (deck.length > 1 && deck[0] === priv.deck[priv.deck.length - 1]) deck.push(deck.shift()!);
      deckPos = 0;
    }
    priv.currentQ = deck[deckPos];
    commit([set(privPath(game.id, player.id), { deck, deckPos: deckPos + 1, currentQ: priv.currentQ }, true)]);
  }
  const q = qs.find((x) => x.id === priv.currentQ)!;
  return { question: publicQuestion(q) };
});

export const arcadeAnswer = onCall(async (req): Promise<ArcadeAnswerResult> => {
  const { game, player, priv } = requirePlayer(req.data ?? {});
  requireLive(game);
  const qs = gameQuestions(game);
  const q = qs.find((x) => x.id === priv.currentQ);
  if (!q) throw new HttpsError('failed-precondition', 'No question to answer');
  const raw = req.data?.answer;
  const answer = Array.isArray(raw) ? JSON.stringify(raw.map(String)) : String(raw ?? '');
  const correct = isCorrect(q, answer);
  const now = Date.now();
  const streak = correct ? player.streak + 1 : 0;
  const update: Partial<ArcadePlayer> = {
    answered: player.answered + 1,
    correct: player.correct + (correct ? 1 : 0),
    streak,
    lastActiveAt: now,
  };
  const ops: WriteOp[] = [];
  const privUpdate: Partial<PrivateState> = { currentQ: null };
  const result: ArcadeAnswerResult = { correct, correctAnswers: q.correctAnswers ?? [] };

  if (correct) {
    switch (game.mode) {
      case 'gold': {
        const othersHaveGold = listPlayers(game.id).some((p) => p.id !== player.id && p.score > 0);
        privUpdate.chests = [0, 1, 2].map(() => rollChest(player.correct, othersHaveGold));
        result.chests = true;
        break;
      }
      case 'racing': {
        const boost = streak > 0 && streak % 3 === 0 ? 1 : 0;
        const goal = game.settings.goal ?? 20;
        const pos = Math.min(goal, player.score + 1 + boost);
        update.score = pos;
        result.progress = pos;
        if (boost) ops.push(event(game.id, 'boost', `${player.nickname} hit a ${streak}-answer streak — speed boost!`, player.id));
        if (pos >= goal) {
          update.finishedAt = now;
          result.finished = true;
          ops.push(event(game.id, 'finish', `🏁 ${player.nickname} crossed the finish line!`, player.id));
          if (!game.winnerId) ops.push(set(gamePath(game.id), { winnerId: player.id }, true));
        }
        break;
      }
      case 'tower':
      case 'cafe': {
        const reward = game.mode === 'tower' ? 40 + Math.min(streak, 5) * 10 : 5 + Math.min(streak, 5);
        privUpdate.earned = priv.earned + reward;
        result.reward = reward;
        break;
      }
    }
  }
  ops.push(set(playerPath(game.id, player.id), update, true), set(privPath(game.id, player.id), privUpdate, true));
  commit(ops);

  if (game.mode === 'racing' && result.finished) endGame(game.id, 'finish line');
  return result;
});

function applyOutcome(game: ArcadeGame, player: ArcadePlayer, o: ChestOutcome, target: ArcadePlayer | null): WriteOp[] {
  const ops: WriteOp[] = [];
  let score = player.score;
  let text = '';
  let type: ArcadeEventType = 'gain';
  switch (o.kind) {
    case 'gain': score += o.amount; text = `${player.nickname} found ${o.amount} gold`; break;
    case 'double': score *= 2; type = 'double'; text = `${player.nickname} doubled their gold!`; break;
    case 'triple': score *= 3; type = 'triple'; text = `${player.nickname} TRIPLED their gold!`; break;
    case 'lose': score = Math.floor(score * (1 - o.percent / 100)); type = 'lose'; text = `${player.nickname} lost ${o.percent}% of their gold`; break;
    case 'nothing': break;
    case 'steal': {
      if (!target) break;
      const amount = Math.floor(target.score * (o.percent / 100));
      score += amount;
      ops.push(set(playerPath(game.id, target.id), { score: target.score - amount }, true));
      type = 'steal';
      text = `${player.nickname} stole ${amount} gold from ${target.nickname}!`;
      break;
    }
    case 'swap': {
      if (!target) break;
      ops.push(set(playerPath(game.id, target.id), { score }, true));
      score = target.score;
      type = 'swap';
      text = `${player.nickname} swapped gold with ${target.nickname}!`;
      break;
    }
  }
  const update: Partial<ArcadePlayer> = { score, lastActiveAt: Date.now() };
  const goal = game.settings.goal;
  if (goal && score >= goal && !player.finishedAt) {
    update.finishedAt = Date.now();
    ops.push(set(gamePath(game.id), { winnerId: player.id }, true));
  }
  ops.push(set(playerPath(game.id, player.id), update, true));
  if (text && (o.kind !== 'gain' || o.amount >= 100)) ops.push(event(game.id, type, text, player.id, target?.id ?? null));
  return ops;
}

function targetsFor(game: ArcadeGame, playerId: string): ArcadeTarget[] {
  return listPlayers(game.id)
    .filter((p) => p.id !== playerId)
    .sort((a, b) => b.score - a.score)
    .map((p) => ({ id: p.id, nickname: p.nickname, avatar: p.avatar, score: p.score }));
}

export const arcadeChest = onCall(async (req): Promise<ArcadeChestResult> => {
  const { game, player, priv } = requirePlayer(req.data ?? {});
  requireLive(game);
  if (game.mode !== 'gold' || !priv.chests) throw new HttpsError('failed-precondition', 'No chest to open');
  const index = Number(req.data?.index);
  if (![0, 1, 2].includes(index)) throw new HttpsError('invalid-argument', 'Pick a chest');
  const outcome = priv.chests[index];
  const needsTarget = outcome.kind === 'steal' || outcome.kind === 'swap';
  const targets = needsTarget ? targetsFor(game, player.id) : [];
  if (needsTarget && targets.length > 0) {
    commit([set(privPath(game.id, player.id), { chests: null, pending: outcome }, true)]);
    return { outcome, revealed: priv.chests, needsTarget: true, targets, score: player.score };
  }
  const effective: ChestOutcome = needsTarget ? { kind: 'nothing' } : outcome;
  commit([...applyOutcome(game, player, effective, null), set(privPath(game.id, player.id), { chests: null, pending: null }, true)]);
  const after = getPlayer(game.id, player.id)!;
  if (game.settings.goal && after.score >= game.settings.goal) endGame(game.id, 'goal reached');
  return { outcome: effective, revealed: priv.chests, needsTarget: false, targets: [], score: after.score };
});

/** Lets a Gold Quest player continue after a refresh: unopened chests or a pending steal/swap. */
export const arcadeResume = onCall(async (req) => {
  const { game, player, priv } = requirePlayer(req.data ?? {});
  return {
    chests: !!priv.chests,
    pending: priv.pending,
    targets: priv.pending ? targetsFor(game, player.id) : [],
  };
});

export const arcadeTarget = onCall(async (req) => {
  const { game, player, priv } = requirePlayer(req.data ?? {});
  requireLive(game);
  if (!priv.pending) throw new HttpsError('failed-precondition', 'Nothing to use');
  const target = getPlayer(game.id, String(req.data?.targetId ?? ''));
  if (!target || target.id === player.id) throw new HttpsError('invalid-argument', 'Pick another player');
  commit([...applyOutcome(game, player, priv.pending, target), set(privPath(game.id, player.id), { pending: null }, true)]);
  const after = getPlayer(game.id, player.id)!;
  if (game.settings.goal && after.score >= game.settings.goal) endGame(game.id, 'goal reached');
  return {
    score: after.score,
    gained: after.score - player.score,
    targetScore: getPlayer(game.id, target.id)?.score ?? 0,
    outcome: priv.pending,
    describe: describe(priv.pending),
  };
});

/**
 * Tower Defense / Café: the mini-game runs on the student's device and reports its score.
 * The score is bounded by what the server granted, so a tampered client can't top the board.
 */
export const arcadeReport = onCall(async (req) => {
  const { game, player, priv } = requirePlayer(req.data ?? {});
  if (game.mode !== 'tower' && game.mode !== 'cafe') throw new HttpsError('failed-precondition', 'Not a self-paced game');
  if (game.status !== 'live') return { ok: false };
  const reported = Math.floor(Number(req.data?.score));
  if (!Number.isFinite(reported) || reported < 0) throw new HttpsError('invalid-argument', 'Bad score');
  const cap = game.mode === 'tower' ? 500 + priv.earned * 12 : 200 + priv.earned * 25;
  const score = Math.max(player.score, Math.min(reported, cap));
  commit([set(playerPath(game.id, player.id), { score, lastActiveAt: Date.now() }, true)]);
  return { ok: true, score };
});

/** Wakes the end-of-game timer after a restart if a timed game was live. */
setImmediate(() => {
  try {
    if (rt().docs.query({ path: 'arcade_games', where: [['status', '==', 'live']], orderBy: [], limit: 1 }).length) startTicker();
  } catch {
    /* runtime not ready (tests) */
  }
});
