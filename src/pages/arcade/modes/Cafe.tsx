import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { ArrowUpCircle, ChefHat, Clock, Coins, Lock, Smile, Frown, Trophy, X } from 'lucide-react';
import type { SelfPacedGameProps } from './types';

/* ------------------------------------------------------------------ */
/* Static data                                                         */
/* ------------------------------------------------------------------ */

type ItemId = 'toast' | 'croissant' | 'juice' | 'donut' | 'salad' | 'pizza';

interface MenuItem {
  id: ItemId;
  emoji: string;
  name: string;
  basePrice: number;
  /** Cash needed to unlock; 0 = unlocked at start. */
  unlockCost: number;
}

const MENU: MenuItem[] = [
  { id: 'toast', emoji: '🍞', name: 'Toast', basePrice: 2, unlockCost: 0 },
  { id: 'croissant', emoji: '🥐', name: 'Croissant', basePrice: 3, unlockCost: 0 },
  { id: 'juice', emoji: '🧃', name: 'Juice', basePrice: 2, unlockCost: 0 },
  { id: 'donut', emoji: '🍩', name: 'Donut', basePrice: 4, unlockCost: 20 },
  { id: 'salad', emoji: '🥗', name: 'Salad', basePrice: 5, unlockCost: 40 },
  { id: 'pizza', emoji: '🍕', name: 'Pizza', basePrice: 6, unlockCost: 70 },
];
const MENU_BY_ID = Object.fromEntries(MENU.map((m) => [m.id, m])) as Record<ItemId, MenuItem>;

const FACES = ['😀', '😃', '🙂', '😎', '🤓', '🥸', '🤠', '😺', '🐶', '🐼', '🐸', '🦊', '🐯', '🐵', '👽', '🤖'];
const SEATS = 3;
const MAX_LEVEL = 3;
const START_STOCK = 5;
const TICK_MS = 200;
/** Max simulated time per tick, so a backgrounded tab doesn't expire every customer at once. */
const MAX_DT = 500;
const LEAVE_ANIM_MS = 700;
const FLOATER_MS = 1100;

function priceOf(item: ItemId, level: number): number {
  return Math.round(MENU_BY_ID[item].basePrice * (1 + 0.5 * (level - 1)));
}
function upgradeCost(item: ItemId, level: number): number {
  return MENU_BY_ID[item].basePrice * 8 * level;
}
/** Patience shrinks from 24 s to a floor of 12 s over the first ~6 minutes. */
function patienceFor(gameTime: number): number {
  return Math.max(12000, 24000 - (gameTime / 60000) * 2000);
}

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

interface ItemState {
  unlocked: boolean;
  level: number;
  stock: number;
}

interface OrderLine {
  item: ItemId;
  served: boolean;
}

interface Customer {
  id: number;
  face: string;
  order: OrderLine[];
  /** Game-time ms when the customer sat down. */
  arrivedAt: number;
  patience: number;
  leaving: null | { mood: 'happy' | 'angry'; at: number };
}

interface Floater {
  id: number;
  seat: number;
  text: string;
  tone: 'good' | 'bad';
  born: number;
}

interface CafeState {
  items: Record<ItemId, ItemState>;
  seats: (Customer | null)[];
  cash: number;
  earned: number;
  served: number;
  lost: number;
  /** Simulated time (only advances while not paused). */
  gameTime: number;
  /** Animation time (always advances) — used for leave/floater cleanup. */
  animTime: number;
  nextSpawnAt: number;
  nextId: number;
  seed: number;
  floaters: Floater[];
}

type Action =
  | { type: 'tick'; dt: number; paused: boolean }
  | { type: 'serve'; seat: number; line: number }
  | { type: 'restock'; target: ItemId | 'split'; units: number }
  | { type: 'unlock'; item: ItemId }
  | { type: 'upgrade'; item: ItemId };

function initState(): CafeState {
  const items = {} as Record<ItemId, ItemState>;
  for (const m of MENU) {
    items[m.id] = { unlocked: m.unlockCost === 0, level: 1, stock: m.unlockCost === 0 ? START_STOCK : 0 };
  }
  return {
    items,
    seats: Array.from({ length: SEATS }, () => null),
    cash: 0,
    earned: 0,
    served: 0,
    lost: 0,
    gameTime: 0,
    animTime: 0,
    nextSpawnAt: 1200,
    nextId: 1,
    seed: (Math.random() * 2 ** 31) >>> 0,
    floaters: [],
  };
}

/** mulberry32 step — keeps the reducer pure. */
function nextRand(seed: number): [number, number] {
  const s = (seed + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, s];
}

function unlockedIds(items: Record<ItemId, ItemState>): ItemId[] {
  return MENU.filter((m) => items[m.id].unlocked).map((m) => m.id);
}

function reducer(state: CafeState, action: Action): CafeState {
  switch (action.type) {
    case 'tick': {
      const animTime = state.animTime + action.dt;
      let { gameTime, nextSpawnAt, nextId, seed, lost } = state;
      let floaters = state.floaters.filter((f) => animTime - f.born < FLOATER_MS);
      let changed = floaters.length !== state.floaters.length;

      // Remove customers whose leave animation finished.
      let seats = state.seats.map((c) => {
        if (c?.leaving && animTime - c.leaving.at > LEAVE_ANIM_MS) {
          changed = true;
          return null;
        }
        return c;
      });

      if (!action.paused) {
        gameTime += action.dt;
        changed = true;

        // Patience expiry.
        seats = seats.map((c, i) => {
          if (c && !c.leaving && gameTime - c.arrivedAt >= c.patience) {
            lost += 1;
            floaters = [...floaters, { id: nextId++, seat: i, text: '😡', tone: 'bad', born: animTime }];
            return { ...c, leaving: { mood: 'angry' as const, at: animTime } };
          }
          return c;
        });

        // Spawning.
        const free = seats.findIndex((c) => c === null);
        if (gameTime >= nextSpawnAt && free !== -1) {
          const menu = unlockedIds(state.items);
          let r: number;
          [r, seed] = nextRand(seed);
          const face = FACES[Math.floor(r * FACES.length)];
          [r, seed] = nextRand(seed);
          // Orders grow a little over time: 1–2 items early, up to 3 later.
          const maxItems = gameTime > 60000 ? 3 : 2;
          const count = 1 + Math.floor(r * maxItems);
          const order: OrderLine[] = [];
          for (let k = 0; k < count; k++) {
            [r, seed] = nextRand(seed);
            order.push({ item: menu[Math.floor(r * menu.length)], served: false });
          }
          seats = seats.map((c, i) =>
            i === free
              ? { id: nextId++, face, order, arrivedAt: gameTime, patience: patienceFor(gameTime), leaving: null }
              : c,
          );
          [r, seed] = nextRand(seed);
          const baseDelay = Math.max(1800, 4500 - gameTime / 60);
          nextSpawnAt = gameTime + baseDelay * (0.7 + r * 0.6);
        }
      }

      if (!changed) return { ...state, animTime };
      return { ...state, animTime, gameTime, nextSpawnAt, nextId, seed, lost, seats, floaters };
    }

    case 'serve': {
      const c = state.seats[action.seat];
      if (!c || c.leaving) return state;
      const line = c.order[action.line];
      if (!line || line.served) return state;
      const stock = state.items[line.item];
      if (stock.stock <= 0) return state;

      const items = { ...state.items, [line.item]: { ...stock, stock: stock.stock - 1 } };
      const order = c.order.map((l, i) => (i === action.line ? { ...l, served: true } : l));
      let customer: Customer = { ...c, order };
      let { cash, earned, served, nextId } = state;
      let floaters = state.floaters;

      if (order.every((l) => l.served)) {
        const total = order.reduce((sum, l) => sum + priceOf(l.item, items[l.item].level), 0);
        const left = 1 - (state.gameTime - c.arrivedAt) / c.patience;
        const tip = left > 0.6 ? Math.ceil(total * 0.3) : left > 0.3 ? Math.ceil(total * 0.1) : 0;
        const pay = total + tip;
        cash += pay;
        earned += pay;
        served += 1;
        customer = { ...customer, leaving: { mood: 'happy', at: state.animTime } };
        floaters = [
          ...floaters,
          { id: nextId++, seat: action.seat, text: tip ? `+$${pay} (tip!)` : `+$${pay}`, tone: 'good', born: state.animTime },
        ];
      }
      const seats = state.seats.map((s, i) => (i === action.seat ? customer : s));
      return { ...state, items, seats, cash, earned, served, nextId, floaters };
    }

    case 'restock': {
      if (action.units <= 0) return state;
      const items = { ...state.items };
      if (action.target === 'split') {
        const ids = unlockedIds(items).sort((a, b) => items[a].stock - items[b].stock);
        const each = Math.floor(action.units / ids.length);
        let rem = action.units % ids.length;
        for (const id of ids) {
          const add = each + (rem > 0 ? 1 : 0);
          if (rem > 0) rem -= 1;
          items[id] = { ...items[id], stock: items[id].stock + add };
        }
      } else {
        const it = items[action.target];
        if (!it.unlocked) return state;
        items[action.target] = { ...it, stock: it.stock + action.units };
      }
      return { ...state, items };
    }

    case 'unlock': {
      const it = state.items[action.item];
      const cost = MENU_BY_ID[action.item].unlockCost;
      if (it.unlocked || state.cash < cost) return state;
      return {
        ...state,
        cash: state.cash - cost,
        items: { ...state.items, [action.item]: { ...it, unlocked: true, stock: START_STOCK } },
      };
    }

    case 'upgrade': {
      const it = state.items[action.item];
      if (!it.unlocked || it.level >= MAX_LEVEL) return state;
      const cost = upgradeCost(action.item, it.level);
      if (state.cash < cost) return state;
      return {
        ...state,
        cash: state.cash - cost,
        items: { ...state.items, [action.item]: { ...it, level: it.level + 1 } },
      };
    }
  }
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

const CAFE_CSS = `
@keyframes cafe-float { 0% { opacity: 0; transform: translate(-50%, 0) scale(.8); } 15% { opacity: 1; transform: translate(-50%, -8px) scale(1.1); } 100% { opacity: 0; transform: translate(-50%, -60px) scale(1); } }
@keyframes cafe-arrive { 0% { opacity: 0; transform: translateY(16px) scale(.9); } 100% { opacity: 1; transform: none; } }
@keyframes cafe-leave-happy { to { opacity: 0; transform: translateY(-24px) scale(.9); } }
@keyframes cafe-leave-angry { 0%,30%,60% { transform: translateX(-4px); } 15%,45%,75% { transform: translateX(4px); } 100% { opacity: 0; transform: translateY(20px); } }
@keyframes cafe-pop { 0% { transform: scale(1); } 50% { transform: scale(1.18); } 100% { transform: scale(1); } }
`;

function formatClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function Cafe(props: SelfPacedGameProps) {
  const { earn, reportScore, endsAt, ended, nickname, avatar } = props;

  const [state, dispatch] = useReducer(reducer, undefined, initState);
  const [asking, setAsking] = useState(false);
  const [pendingUnits, setPendingUnits] = useState(0);
  const [showUpgrades, setShowUpgrades] = useState(false);
  const [missFlash, setMissFlash] = useState(false);
  const [nowMs, setNowMs] = useState(0);

  const askingRef = useRef(false);
  const endedRef = useRef(ended);
  const pausedRef = useRef(false);

  useEffect(() => {
    endedRef.current = ended;
  }, [ended]);

  // Customers wait while a question is on screen or the restock picker is open.
  const paused = asking || pendingUnits > 0;
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  // Single simulation tick.
  useEffect(() => {
    if (ended) return;
    let last = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      const dt = Math.min(MAX_DT, Math.max(0, now - last));
      last = now;
      setNowMs(now);
      dispatch({ type: 'tick', dt, paused: pausedRef.current });
    }, TICK_MS);
    return () => clearInterval(id);
  }, [ended]);

  useEffect(() => {
    reportScore(state.earned);
  }, [state.earned, reportScore]);

  const restock = useCallback(async () => {
    if (askingRef.current || endedRef.current) return;
    askingRef.current = true;
    setAsking(true);
    let units = 0;
    try {
      units = await earn();
    } finally {
      askingRef.current = false;
      setAsking(false);
    }
    if (endedRef.current) return;
    if (units > 0) {
      setPendingUnits(units);
    } else {
      setMissFlash(true);
      setTimeout(() => setMissFlash(false), 1400);
    }
  }, [earn]);

  const applyRestock = (target: ItemId | 'split') => {
    dispatch({ type: 'restock', target, units: pendingUnits });
    setPendingUnits(0);
  };

  const unlocked = MENU.filter((m) => state.items[m.id].unlocked);
  const remaining = endsAt !== null && nowMs > 0 ? endsAt - nowMs : null;
  const canAffordSomething = MENU.some((m) => {
    const it = state.items[m.id];
    if (!it.unlocked) return state.cash >= m.unlockCost;
    return it.level < MAX_LEVEL && state.cash >= upgradeCost(m.id, it.level);
  });

  return (
    <div
      className="relative h-full w-full flex flex-col text-white overflow-hidden select-none"
      style={{
        background:
          'radial-gradient(ellipse at 50% 0%, rgba(251,146,60,0.14) 0%, transparent 55%), linear-gradient(160deg, #0B1222 0%, #0F1729 50%, #0B1222 100%)',
      }}
    >
      <style>{CAFE_CSS}</style>

      {/* HUD */}
      <div className="shrink-0 px-3 pt-3 pb-2 flex items-center gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-2xl leading-none">{avatar}</span>
          <div className="min-w-0">
            <div className="text-sm font-bold truncate">{nickname}</div>
            <div className="text-[11px] text-white/50 flex items-center gap-2">
              <span className="flex items-center gap-0.5"><Smile className="w-3 h-3 text-emerald-400" />{state.served}</span>
              <span className="flex items-center gap-0.5"><Frown className="w-3 h-3 text-rose-400" />{state.lost}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 bg-amber-400/15 border border-amber-400/30 rounded-xl px-2.5 py-1.5">
          <Coins className="w-4 h-4 text-amber-300" />
          <span className="font-mono font-bold text-amber-200">${state.cash}</span>
        </div>
        <div className="flex items-center gap-1.5 bg-white/[0.07] border border-white/10 rounded-xl px-2.5 py-1.5" title="Total earned (score)">
          <Trophy className="w-4 h-4 text-yellow-300" />
          <span className="font-mono font-bold">{state.earned}</span>
        </div>
        {remaining !== null && (
          <div
            className={`flex items-center gap-1 rounded-xl px-2.5 py-1.5 border font-mono font-bold ${
              remaining < 30000 ? 'bg-rose-500/20 border-rose-400/40 text-rose-200' : 'bg-white/[0.07] border-white/10'
            }`}
          >
            <Clock className="w-4 h-4" />
            {formatClock(remaining)}
          </div>
        )}
      </div>

      {/* Counter */}
      <div className="flex-1 min-h-0 flex flex-col px-3">
        <div className="flex-1 min-h-0 grid grid-cols-3 gap-2 items-end pb-1">
          {state.seats.map((c, seat) => (
            <SeatView
              key={seat}
              seat={seat}
              customer={c}
              state={state}
              paused={paused}
              onServe={(line) => dispatch({ type: 'serve', seat, line })}
            />
          ))}
        </div>
        {/* Counter top */}
        <div className="shrink-0 h-3 rounded-full bg-gradient-to-b from-amber-700 to-amber-900 shadow-[0_4px_12px_rgba(0,0,0,0.4)]" />
        <div className="shrink-0 text-center text-[11px] text-white/40 py-1">
          {paused ? '⏸ Customers are waiting while you cook…' : 'Tap an order item to serve it'}
        </div>
      </div>

      {/* Kitchen */}
      <div className="shrink-0 px-3 pb-3 pt-1 bg-black/20 border-t border-white/10">
        <div className="grid grid-cols-3 gap-2 py-2">
          {unlocked.map((m) => {
            const it = state.items[m.id];
            const empty = it.stock <= 0;
            return (
              <div
                key={m.id}
                className={`rounded-xl px-2 py-1.5 flex items-center gap-1.5 border ${
                  empty ? 'bg-rose-500/10 border-rose-400/40' : 'bg-white/[0.06] border-white/10'
                }`}
              >
                <span className="text-xl leading-none">{m.emoji}</span>
                <div className="min-w-0 flex-1 leading-tight">
                  <div className={`text-sm font-bold font-mono ${empty ? 'text-rose-300' : ''}`}>×{it.stock}</div>
                  <div className="text-[10px] text-white/50">
                    ${priceOf(m.id, it.level)}
                    {it.level > 1 && <span className="text-amber-300"> ★{it.level}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={restock}
            disabled={asking || ended || pendingUnits > 0}
            className={`flex-1 h-14 rounded-2xl font-bold text-base flex items-center justify-center gap-2 transition active:scale-[0.97] disabled:opacity-60 ${
              missFlash
                ? 'bg-rose-500 shadow-[0_4px_0_#9f1239]'
                : 'bg-gradient-to-b from-orange-400 to-orange-600 shadow-[0_4px_0_#9a3412]'
            }`}
          >
            <ChefHat className="w-5 h-5" />
            {asking ? 'Cooking…' : missFlash ? 'Burnt! Try again' : '🍳 Restock (answer a question)'}
          </button>
          <button
            type="button"
            onClick={() => setShowUpgrades(true)}
            disabled={ended}
            className={`relative w-16 h-14 rounded-2xl flex flex-col items-center justify-center text-[10px] font-bold bg-white/10 border border-white/15 active:scale-[0.97] transition disabled:opacity-60`}
            aria-label="Upgrades"
          >
            <ArrowUpCircle className="w-5 h-5 text-amber-300" />
            Shop
            {canAffordSomething && <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />}
          </button>
        </div>
      </div>

      {/* Restock picker */}
      {pendingUnits > 0 && !ended && (
        <div className="absolute inset-0 z-30 bg-black/60 flex items-end sm:items-center justify-center p-3">
          <div className="w-full max-w-md bg-[#141d33] border border-white/10 rounded-2xl p-4">
            <div className="text-center mb-3">
              <div className="text-lg font-bold">✅ Correct! +{pendingUnits} food</div>
              <div className="text-xs text-white/50">What should the kitchen make?</div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {unlocked.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => applyRestock(m.id)}
                  className="rounded-xl bg-white/[0.07] border border-white/10 py-2.5 flex flex-col items-center active:scale-95 transition hover:bg-white/10"
                >
                  <span className="text-3xl leading-none">{m.emoji}</span>
                  <span className="text-xs mt-1">{m.name}</span>
                  <span className="text-[10px] text-white/50">has {state.items[m.id].stock}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => applyRestock('split')}
              className="mt-2 w-full h-11 rounded-xl bg-orange-500/20 border border-orange-400/40 text-orange-200 text-sm font-bold active:scale-[0.98] transition"
            >
              Split evenly (lowest stock first)
            </button>
          </div>
        </div>
      )}

      {/* Upgrades sheet */}
      {showUpgrades && !ended && (
        <div className="absolute inset-0 z-30 bg-black/60 flex items-end sm:items-center justify-center" onClick={() => setShowUpgrades(false)}>
          <div
            className="w-full max-w-md max-h-[80%] flex flex-col bg-[#141d33] border border-white/10 rounded-t-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <div>
                <div className="font-bold text-lg">Café Shop</div>
                <div className="text-xs text-white/50">Spending cash never lowers your score</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-amber-200">${state.cash}</span>
                <button type="button" onClick={() => setShowUpgrades(false)} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center" aria-label="Close">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="overflow-y-auto px-4 pb-4 space-y-2">
              {MENU.map((m) => {
                const it = state.items[m.id];
                if (!it.unlocked) {
                  const ok = state.cash >= m.unlockCost;
                  return (
                    <div key={m.id} className="flex items-center gap-3 rounded-xl bg-white/[0.04] border border-dashed border-white/15 p-2.5">
                      <span className="text-3xl leading-none grayscale opacity-60">{m.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm">{m.name}</div>
                        <div className="text-xs text-white/50">Sells for ${m.basePrice} · new menu item</div>
                      </div>
                      <button
                        type="button"
                        disabled={!ok}
                        onClick={() => dispatch({ type: 'unlock', item: m.id })}
                        className="h-10 px-3 rounded-xl text-sm font-bold flex items-center gap-1 bg-emerald-500 disabled:bg-white/10 disabled:text-white/40 active:scale-95 transition"
                      >
                        <Lock className="w-3.5 h-3.5" /> ${m.unlockCost}
                      </button>
                    </div>
                  );
                }
                const maxed = it.level >= MAX_LEVEL;
                const cost = upgradeCost(m.id, it.level);
                const ok = !maxed && state.cash >= cost;
                return (
                  <div key={m.id} className="flex items-center gap-3 rounded-xl bg-white/[0.06] border border-white/10 p-2.5">
                    <span className="text-3xl leading-none">{m.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm">
                        {m.name} <span className="text-amber-300">{'★'.repeat(it.level)}<span className="text-white/20">{'★'.repeat(MAX_LEVEL - it.level)}</span></span>
                      </div>
                      <div className="text-xs text-white/50">
                        ${priceOf(m.id, it.level)}
                        {!maxed && <> → <span className="text-emerald-300">${priceOf(m.id, it.level + 1)}</span></>}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={!ok}
                      onClick={() => dispatch({ type: 'upgrade', item: m.id })}
                      className="h-10 px-3 rounded-xl text-sm font-bold bg-amber-500 text-black disabled:bg-white/10 disabled:text-white/40 active:scale-95 transition"
                    >
                      {maxed ? 'MAX' : `$${cost}`}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Closed overlay */}
      {ended && (
        <div className="absolute inset-0 z-40 bg-black/75 flex items-center justify-center p-6">
          <div className="text-center bg-[#141d33] border border-white/10 rounded-2xl px-6 py-8 w-full max-w-sm">
            <div className="text-5xl mb-3">☕</div>
            <div className="text-2xl font-bold mb-1">Café closed!</div>
            <div className="text-white/70 mb-4">
              You earned <span className="font-mono font-bold text-amber-300">${state.earned}</span>
            </div>
            <div className="flex justify-center gap-6 text-sm text-white/60">
              <span className="flex items-center gap-1"><Smile className="w-4 h-4 text-emerald-400" /> {state.served} served</span>
              <span className="flex items-center gap-1"><Frown className="w-4 h-4 text-rose-400" /> {state.lost} lost</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Seat                                                                */
/* ------------------------------------------------------------------ */

interface SeatViewProps {
  seat: number;
  customer: Customer | null;
  state: CafeState;
  paused: boolean;
  onServe: (line: number) => void;
}

function SeatView({ seat, customer, state, paused, onServe }: SeatViewProps) {
  const floaters = state.floaters.filter((f) => f.seat === seat);

  const floaterEls = floaters.map((f) => (
    <div
      key={f.id}
      className={`pointer-events-none absolute left-1/2 top-6 z-10 whitespace-nowrap font-bold text-lg drop-shadow ${
        f.tone === 'good' ? 'text-emerald-300' : 'text-rose-300'
      }`}
      style={{ animation: `cafe-float ${FLOATER_MS}ms ease-out forwards` }}
    >
      {f.text}
    </div>
  ));

  if (!customer) {
    return (
      <div className="relative h-full flex flex-col items-center justify-end pb-2">
        {floaterEls}
        <div className="text-3xl opacity-20">🪑</div>
        <div className="text-[10px] text-white/25 mt-1">empty</div>
      </div>
    );
  }

  const elapsed = state.gameTime - customer.arrivedAt;
  const frac = customer.leaving ? 0 : Math.max(0, 1 - elapsed / customer.patience);
  const barColor = frac > 0.6 ? 'bg-emerald-400' : frac > 0.3 ? 'bg-amber-400' : 'bg-rose-500';
  const mood = customer.leaving
    ? customer.leaving.mood === 'happy' ? '😋' : '😡'
    : frac < 0.3 ? '😠' : customer.face;
  const anim = customer.leaving
    ? customer.leaving.mood === 'happy'
      ? `cafe-leave-happy ${LEAVE_ANIM_MS}ms ease-in forwards`
      : `cafe-leave-angry ${LEAVE_ANIM_MS}ms ease-in forwards`
    : 'cafe-arrive 300ms ease-out';

  return (
    <div className="relative h-full flex flex-col items-center justify-end min-w-0">
      {floaterEls}
      <div key={customer.id} className="w-full flex flex-col items-center justify-end min-h-0" style={{ animation: anim }}>
        {/* Order bubble */}
        <div className="w-full rounded-2xl bg-white/[0.08] border border-white/10 p-1.5 flex flex-col gap-1 mb-1.5">
          {customer.order.map((l, i) => {
            const stock = state.items[l.item].stock;
            const out = !l.served && stock <= 0;
            return (
              <button
                key={i}
                type="button"
                disabled={l.served || out || !!customer.leaving}
                onClick={() => onServe(i)}
                className={`h-11 w-full rounded-xl flex items-center justify-center gap-1 text-2xl leading-none transition active:scale-95 ${
                  l.served
                    ? 'bg-emerald-500/25 border border-emerald-400/40'
                    : out
                      ? 'bg-rose-500/10 border border-rose-400/40 opacity-70'
                      : 'bg-white/10 border border-white/20 hover:bg-white/20'
                }`}
              >
                <span className={l.served ? 'opacity-50' : ''} style={l.served ? { animation: 'cafe-pop 250ms ease-out' } : undefined}>
                  {MENU_BY_ID[l.item].emoji}
                </span>
                {l.served ? (
                  <span className="text-sm text-emerald-300">✓</span>
                ) : out ? (
                  <span className="text-[10px] text-rose-300 font-bold">OUT</span>
                ) : null}
              </button>
            );
          })}
        </div>
        {/* Face + patience */}
        <div className="text-4xl sm:text-5xl leading-none mb-1">{mood}</div>
        <div className="w-4/5 h-2 rounded-full bg-white/10 overflow-hidden mb-1">
          <div
            className={`h-full ${barColor} ${paused ? '' : 'transition-[width] duration-200 ease-linear'}`}
            style={{ width: `${frac * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
