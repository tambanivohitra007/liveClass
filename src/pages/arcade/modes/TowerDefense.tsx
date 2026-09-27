import { useCallback, useEffect, useRef, useState } from 'react';
import { Coins, Heart, Swords, Trophy, Clock, ArrowUpCircle, X, RotateCcw } from 'lucide-react';
import type { SelfPacedGameProps } from './types';

/* ------------------------------------------------------------------ */
/* Static game data                                                    */
/* ------------------------------------------------------------------ */

/** Logical board (portrait). In landscape the board is drawn transposed. */
const COLS = 9;
const ROWS = 13;

/** Path waypoints in logical cell coordinates (cell indices). First point is off-board. */
const WAYPOINTS: ReadonlyArray<readonly [number, number]> = [
  [1, -1], [1, 2], [7, 2], [7, 5], [1, 5], [1, 8], [7, 8], [7, 11], [4, 11], [4, 12],
];
const BASE_CELL: readonly [number, number] = [4, 12];

const START_COINS = 100;
const START_LIVES = 10;
const FIRST_BREAK = 5;
const WAVE_BREAK = 7;
const MAX_DT = 0.05;

type EnemyKind = 'basic' | 'fast' | 'tank' | 'boss';
interface EnemyDef { emoji: string; hp: number; speed: number; reward: number; score: number; size: number; lives: number }
const ENEMIES: Record<EnemyKind, EnemyDef> = {
  basic: { emoji: '👾', hp: 32, speed: 1.1, reward: 4, score: 10, size: 0.62, lives: 1 },
  fast: { emoji: '🦇', hp: 20, speed: 2.1, reward: 4, score: 15, size: 0.56, lives: 1 },
  tank: { emoji: '🐢', hp: 110, speed: 0.6, reward: 8, score: 30, size: 0.72, lives: 2 },
  boss: { emoji: '👹', hp: 600, speed: 0.45, reward: 40, score: 200, size: 0.95, lives: 5 },
};

type TowerKind = 'archer' | 'cannon' | 'frost';
interface TowerDef {
  name: string; emoji: string; color: string; cost: number; range: number; damage: number;
  cooldown: number; splash: number; slow: number; projSpeed: number; blurb: string;
}
const TOWERS: Record<TowerKind, TowerDef> = {
  archer: { name: 'Archer', emoji: '🏹', color: '#22c55e', cost: 50, range: 2.6, damage: 11, cooldown: 0.55, splash: 0, slow: 0, projSpeed: 11, blurb: 'Fast, single target' },
  cannon: { name: 'Cannon', emoji: '💣', color: '#f97316', cost: 80, range: 2.2, damage: 24, cooldown: 1.5, splash: 1.1, slow: 0, projSpeed: 7, blurb: 'Splash damage' },
  frost: { name: 'Frost', emoji: '❄️', color: '#38bdf8', cost: 60, range: 2.1, damage: 5, cooldown: 0.9, splash: 0.7, slow: 0.5, projSpeed: 9, blurb: 'Slows enemies' },
};
const TOWER_KINDS: TowerKind[] = ['archer', 'cannon', 'frost'];
const MAX_LEVEL = 3;

function upgradeCost(kind: TowerKind, level: number): number {
  return Math.round(TOWERS[kind].cost * 0.8 * level);
}
function towerStats(kind: TowerKind, level: number) {
  const d = TOWERS[kind];
  const m = level - 1;
  return {
    range: d.range + 0.35 * m,
    damage: d.damage * Math.pow(1.65, m),
    cooldown: d.cooldown * Math.pow(0.88, m),
    splash: d.splash > 0 ? d.splash + 0.15 * m : 0,
    slow: d.slow > 0 ? Math.min(0.7, d.slow + 0.08 * m) : 0,
  };
}

/* Path geometry (cell-center coordinates) */
const PATH_PTS = WAYPOINTS.map(([c, r]) => ({ x: c + 0.5, y: r + 0.5 }));
const SEG_LEN: number[] = [];
let PATH_LEN = 0;
for (let i = 1; i < PATH_PTS.length; i++) {
  const l = Math.hypot(PATH_PTS[i].x - PATH_PTS[i - 1].x, PATH_PTS[i].y - PATH_PTS[i - 1].y);
  SEG_LEN.push(l);
  PATH_LEN += l;
}
const PATH_CELLS = new Set<string>();
for (let i = 1; i < WAYPOINTS.length; i++) {
  const [c0, r0] = WAYPOINTS[i - 1];
  const [c1, r1] = WAYPOINTS[i];
  const steps = Math.max(Math.abs(c1 - c0), Math.abs(r1 - r0));
  for (let s = 0; s <= steps; s++) {
    const c = c0 + Math.sign(c1 - c0) * s;
    const r = r0 + Math.sign(r1 - r0) * s;
    if (r >= 0 && r < ROWS && c >= 0 && c < COLS) PATH_CELLS.add(`${c},${r}`);
  }
}

function pathPos(dist: number): { x: number; y: number } {
  let d = Math.max(0, dist);
  for (let i = 0; i < SEG_LEN.length; i++) {
    if (d <= SEG_LEN[i]) {
      const t = SEG_LEN[i] === 0 ? 0 : d / SEG_LEN[i];
      const a = PATH_PTS[i];
      const b = PATH_PTS[i + 1];
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    d -= SEG_LEN[i];
  }
  return { ...PATH_PTS[PATH_PTS.length - 1] };
}

/* ------------------------------------------------------------------ */
/* Simulation state                                                    */
/* ------------------------------------------------------------------ */

interface Enemy {
  id: number; kind: EnemyKind; hp: number; maxHp: number; dist: number; x: number; y: number;
  slowUntil: number; slowFactor: number; hitFlash: number;
}
interface Tower { id: number; kind: TowerKind; c: number; r: number; level: number; spent: number; cd: number; flash: number }
interface Projectile {
  x: number; y: number; targetId: number; tx: number; ty: number; speed: number; damage: number;
  splash: number; slow: number; color: string;
}
interface Effect { kind: 'ring' | 'text'; x: number; y: number; t: number; life: number; radius: number; color: string; text: string }
type Phase = 'break' | 'wave' | 'over';

interface Sim {
  time: number; coins: number; lives: number; wave: number; wavesCleared: number; score: number;
  phase: Phase; breakLeft: number; spawnQueue: { kind: EnemyKind; delay: number }[]; spawnTimer: number;
  enemies: Enemy[]; towers: Tower[]; projectiles: Projectile[]; effects: Effect[]; nextId: number;
}

function newSim(): Sim {
  return {
    time: 0, coins: START_COINS, lives: START_LIVES, wave: 0, wavesCleared: 0, score: 0,
    phase: 'break', breakLeft: FIRST_BREAK, spawnQueue: [], spawnTimer: 0,
    enemies: [], towers: [], projectiles: [], effects: [], nextId: 1,
  };
}

function buildWave(wave: number): { kind: EnemyKind; delay: number }[] {
  const q: { kind: EnemyKind; delay: number }[] = [];
  const count = 5 + wave * 2;
  const gap = Math.max(0.35, 0.95 - wave * 0.04);
  for (let i = 0; i < count; i++) {
    let kind: EnemyKind = 'basic';
    if (wave >= 2 && i % 3 === 1) kind = 'fast';
    if (wave >= 3 && i % 4 === 3) kind = 'tank';
    if (wave >= 6 && i % 5 === 0) kind = 'fast';
    q.push({ kind, delay: kind === 'tank' ? gap * 1.4 : gap });
  }
  if (wave % 5 === 0) q.push({ kind: 'boss', delay: 1.5 });
  return q;
}

function hpScale(wave: number): number {
  return (1 + 0.28 * (wave - 1)) * Math.pow(1.04, wave - 1);
}

/* ------------------------------------------------------------------ */
/* Rendering helpers                                                   */
/* ------------------------------------------------------------------ */

interface Layout { w: number; h: number; dpr: number; cell: number; ox: number; oy: number; landscape: boolean }
type Selection = { type: 'empty'; c: number; r: number } | { type: 'tower'; c: number; r: number };

const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

function drawBackground(L: Layout): HTMLCanvasElement {
  const bg = document.createElement('canvas');
  bg.width = Math.max(1, Math.round(L.w * L.dpr));
  bg.height = Math.max(1, Math.round(L.h * L.dpr));
  const ctx = bg.getContext('2d');
  if (!ctx) return bg;
  ctx.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
  ctx.fillStyle = '#0B1222';
  ctx.fillRect(0, 0, L.w, L.h);
  const cs = L.cell;
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      const [sx, sy] = L.landscape ? [L.ox + r * cs, L.oy + c * cs] : [L.ox + c * cs, L.oy + r * cs];
      const onPath = PATH_CELLS.has(`${c},${r}`);
      ctx.fillStyle = onPath ? '#3b2f25' : (c + r) % 2 === 0 ? '#13301f' : '#16371f';
      ctx.fillRect(sx, sy, cs + 0.5, cs + 0.5);
    }
  }
  // Path stroke
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  PATH_PTS.forEach((p, i) => {
    const [sx, sy] = L.landscape ? [L.ox + p.y * cs, L.oy + p.x * cs] : [L.ox + p.x * cs, L.oy + p.y * cs];
    if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
  });
  ctx.strokeStyle = '#a07a4f';
  ctx.lineWidth = cs * 0.72;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = cs * 0.08;
  ctx.setLineDash([cs * 0.2, cs * 0.3]);
  ctx.stroke();
  ctx.restore();
  // Board border
  const bw = (L.landscape ? ROWS : COLS) * cs;
  const bh = (L.landscape ? COLS : ROWS) * cs;
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 2;
  ctx.strokeRect(L.ox, L.oy, bw, bh);
  // Base
  const [bc, br] = BASE_CELL;
  const [bx, by] = L.landscape ? [L.ox + (br + 0.5) * cs, L.oy + (bc + 0.5) * cs] : [L.ox + (bc + 0.5) * cs, L.oy + (br + 0.5) * cs];
  ctx.font = `${cs * 0.85}px ${EMOJI_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🏰', bx, by);
  return bg;
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

interface Hud {
  coins: number; lives: number; wave: number; score: number; best: number;
  phase: Phase; breakLeft: number; timeLeft: number | null;
}
const INITIAL_HUD: Hud = {
  coins: START_COINS, lives: START_LIVES, wave: 0, score: 0, best: 0, phase: 'break', breakLeft: FIRST_BREAK, timeLeft: null,
};

interface Floater { id: number; amount: number }

function fmtTime(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function TowerDefense(props: SelfPacedGameProps) {
  const { earn, reportScore, endsAt, ended, nickname, avatar } = props;

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<Sim>(newSim());
  const layoutRef = useRef<Layout | null>(null);
  const bgRef = useRef<HTMLCanvasElement | null>(null);
  const selRef = useRef<Selection | null>(null);
  const bestRef = useRef(0);
  const endedRef = useRef(ended);
  const endsAtRef = useRef(endsAt);
  const reportRef = useRef(reportScore);
  const earnRef = useRef(earn);
  const pendingRef = useRef(false);
  const mountedRef = useRef(true);
  const floaterId = useRef(0);

  const [hud, setHud] = useState<Hud>(INITIAL_HUD);
  const [sel, setSel] = useState<Selection | null>(null);
  const [selTower, setSelTower] = useState<{ kind: TowerKind; level: number; spent: number } | null>(null);
  const [earning, setEarning] = useState(false);
  const [floaters, setFloaters] = useState<Floater[]>([]);

  useEffect(() => { endedRef.current = ended; }, [ended]);
  useEffect(() => { endsAtRef.current = endsAt; }, [endsAt]);
  useEffect(() => { reportRef.current = reportScore; }, [reportScore]);
  useEffect(() => { earnRef.current = earn; }, [earn]);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const syncHud = useCallback(() => {
    const s = simRef.current;
    const ea = endsAtRef.current;
    setHud({
      coins: Math.floor(s.coins), lives: s.lives, wave: s.wave, score: s.score, best: bestRef.current,
      phase: s.phase, breakLeft: Math.ceil(s.breakLeft), timeLeft: ea == null ? null : Math.max(0, ea - Date.now()),
    });
  }, []);

  const applySelection = useCallback((next: Selection | null) => {
    selRef.current = next;
    setSel(next);
    if (next && next.type === 'tower') {
      const t = simRef.current.towers.find((tw) => tw.c === next.c && tw.r === next.r);
      setSelTower(t ? { kind: t.kind, level: t.level, spent: t.spent } : null);
    } else {
      setSelTower(null);
    }
  }, []);

  /* ---------------- Resize ---------------- */
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const w = Math.max(1, rect.width);
      const h = Math.max(1, rect.height);
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      const landscape = w > h * 1.05;
      const gc = landscape ? ROWS : COLS;
      const gr = landscape ? COLS : ROWS;
      const cell = Math.max(4, Math.floor(Math.min(w / gc, h / gr)));
      const L: Layout = { w, h, dpr, cell, landscape, ox: Math.floor((w - gc * cell) / 2), oy: Math.floor((h - gr * cell) / 2) };
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      layoutRef.current = L;
      bgRef.current = drawBackground(L);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  /* ---------------- Game loop ---------------- */
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let hudTimer = 0;
    let lastReported = -1;

    const addEffect = (e: Omit<Effect, 't'>) => { simRef.current.effects.push({ ...e, t: 0 }); };

    const damage = (s: Sim, en: Enemy, amount: number, slow: number) => {
      en.hp -= amount;
      en.hitFlash = 0.12;
      if (slow > 0) {
        en.slowFactor = Math.min(en.slowFactor, 1 - slow);
        en.slowUntil = s.time + 1.6;
      }
    };

    const update = (dt: number) => {
      const s = simRef.current;
      s.time += dt;

      // Waves
      if (s.phase === 'break') {
        s.breakLeft -= dt;
        if (s.breakLeft <= 0) {
          s.wave += 1;
          s.phase = 'wave';
          s.spawnQueue = buildWave(s.wave);
          s.spawnTimer = 0.2;
        }
      } else if (s.phase === 'wave') {
        s.spawnTimer -= dt;
        if (s.spawnTimer <= 0 && s.spawnQueue.length > 0) {
          const next = s.spawnQueue.shift();
          if (next) {
            const def = ENEMIES[next.kind];
            const hp = Math.round(def.hp * hpScale(s.wave));
            const p = pathPos(0);
            s.enemies.push({
              id: s.nextId++, kind: next.kind, hp, maxHp: hp, dist: 0, x: p.x, y: p.y,
              slowUntil: 0, slowFactor: 1, hitFlash: 0,
            });
            s.spawnTimer = next.delay;
          }
        }
        if (s.spawnQueue.length === 0 && s.enemies.length === 0) {
          s.wavesCleared += 1;
          s.score += 100;
          s.coins += 20 + s.wave * 5;
          s.phase = 'break';
          s.breakLeft = WAVE_BREAK;
          addEffect({ kind: 'text', x: COLS / 2, y: ROWS / 2, life: 1.6, radius: 0, color: '#facc15', text: `Wave ${s.wave} cleared! +100` });
        }
      }

      // Enemies move
      for (const en of s.enemies) {
        if (s.time > en.slowUntil) en.slowFactor = 1;
        en.dist += ENEMIES[en.kind].speed * en.slowFactor * dt;
        const p = pathPos(en.dist);
        en.x = p.x; en.y = p.y;
        if (en.hitFlash > 0) en.hitFlash -= dt;
      }
      const leaked = s.enemies.filter((en) => en.dist >= PATH_LEN);
      if (leaked.length > 0) {
        for (const en of leaked) {
          s.lives = Math.max(0, s.lives - ENEMIES[en.kind].lives);
          addEffect({ kind: 'ring', x: BASE_CELL[0] + 0.5, y: BASE_CELL[1] + 0.5, life: 0.5, radius: 1.2, color: '#ef4444', text: '' });
        }
        s.enemies = s.enemies.filter((en) => en.dist < PATH_LEN);
        if (s.lives <= 0) {
          s.phase = 'over';
          return;
        }
      }

      // Towers fire
      for (const t of s.towers) {
        t.cd -= dt;
        if (t.flash > 0) t.flash -= dt;
        if (t.cd > 0) continue;
        const st = towerStats(t.kind, t.level);
        const cx = t.c + 0.5;
        const cy = t.r + 0.5;
        let target: Enemy | null = null;
        for (const en of s.enemies) {
          if (Math.hypot(en.x - cx, en.y - cy) <= st.range && (!target || en.dist > target.dist)) target = en;
        }
        if (!target) continue;
        t.cd = st.cooldown;
        t.flash = 0.1;
        const def = TOWERS[t.kind];
        s.projectiles.push({
          x: cx, y: cy, targetId: target.id, tx: target.x, ty: target.y, speed: def.projSpeed,
          damage: st.damage, splash: st.splash, slow: st.slow, color: def.color,
        });
      }

      // Projectiles
      const alive: Projectile[] = [];
      for (const pr of s.projectiles) {
        const tgt = s.enemies.find((en) => en.id === pr.targetId);
        if (tgt) { pr.tx = tgt.x; pr.ty = tgt.y; }
        const dx = pr.tx - pr.x;
        const dy = pr.ty - pr.y;
        const d = Math.hypot(dx, dy);
        const step = pr.speed * dt;
        if (d <= step || d < 0.05) {
          if (pr.splash > 0) {
            for (const en of s.enemies) {
              if (Math.hypot(en.x - pr.tx, en.y - pr.ty) <= pr.splash) damage(s, en, pr.damage, pr.slow);
            }
            addEffect({ kind: 'ring', x: pr.tx, y: pr.ty, life: 0.35, radius: pr.splash, color: pr.color, text: '' });
          } else if (tgt) {
            damage(s, tgt, pr.damage, pr.slow);
          }
        } else {
          pr.x += (dx / d) * step;
          pr.y += (dy / d) * step;
          alive.push(pr);
        }
      }
      s.projectiles = alive;

      // Deaths
      const survivors: Enemy[] = [];
      for (const en of s.enemies) {
        if (en.hp <= 0) {
          const def = ENEMIES[en.kind];
          s.score += def.score;
          s.coins += def.reward;
          addEffect({ kind: 'text', x: en.x, y: en.y - 0.2, life: 0.8, radius: 0, color: '#fde047', text: `+${def.reward}` });
          addEffect({ kind: 'ring', x: en.x, y: en.y, life: 0.3, radius: 0.5, color: '#ffffff', text: '' });
        } else {
          survivors.push(en);
        }
      }
      s.enemies = survivors;
    };

    const updateEffects = (dt: number) => {
      const s = simRef.current;
      for (const e of s.effects) e.t += dt;
      s.effects = s.effects.filter((e) => e.t < e.life);
    };

    const draw = () => {
      const canvas = canvasRef.current;
      const L = layoutRef.current;
      if (!canvas || !L) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const s = simRef.current;
      const cs = L.cell;
      const toScreen = (x: number, y: number): [number, number] =>
        L.landscape ? [L.ox + y * cs, L.oy + x * cs] : [L.ox + x * cs, L.oy + y * cs];

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (bgRef.current) ctx.drawImage(bgRef.current, 0, 0);
      ctx.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Selection highlight + range
      const selection = selRef.current;
      if (selection) {
        const [sx, sy] = toScreen(selection.c, selection.r);
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 2;
        ctx.strokeRect(sx + 1, sy + 1, cs - 2, cs - 2);
        const tw = s.towers.find((t) => t.c === selection.c && t.r === selection.r);
        const [cx, cy] = toScreen(selection.c + 0.5, selection.r + 0.5);
        const range = tw ? towerStats(tw.kind, tw.level).range : 2.4;
        ctx.beginPath();
        ctx.arc(cx, cy, range * cs, 0, Math.PI * 2);
        ctx.fillStyle = tw ? `${TOWERS[tw.kind].color}22` : 'rgba(250,204,21,0.10)';
        ctx.fill();
        ctx.strokeStyle = tw ? TOWERS[tw.kind].color : 'rgba(250,204,21,0.6)';
        ctx.setLineDash([6, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Towers
      for (const t of s.towers) {
        const def = TOWERS[t.kind];
        const [sx, sy] = toScreen(t.c, t.r);
        const pad = cs * 0.08;
        ctx.fillStyle = t.flash > 0 ? '#ffffff' : def.color;
        ctx.globalAlpha = t.flash > 0 ? 0.9 : 0.85;
        ctx.beginPath();
        ctx.roundRect(sx + pad, sy + pad, cs - pad * 2, cs - pad * 2, cs * 0.18);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(15,23,41,0.55)';
        ctx.beginPath();
        ctx.roundRect(sx + pad * 2, sy + pad * 2, cs - pad * 4, cs - pad * 4, cs * 0.14);
        ctx.fill();
        ctx.font = `${cs * 0.52}px ${EMOJI_FONT}`;
        ctx.fillText(def.emoji, sx + cs / 2, sy + cs / 2 + cs * 0.02);
        // level pips
        for (let i = 0; i < t.level; i++) {
          ctx.fillStyle = '#facc15';
          ctx.beginPath();
          ctx.arc(sx + cs * (0.3 + i * 0.2), sy + cs * 0.86, Math.max(1.5, cs * 0.06), 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Enemies
      for (const en of s.enemies) {
        const def = ENEMIES[en.kind];
        const [ex, ey] = toScreen(en.x, en.y);
        const size = def.size * cs;
        if (en.slowFactor < 1) {
          ctx.fillStyle = 'rgba(56,189,248,0.45)';
          ctx.beginPath();
          ctx.arc(ex, ey, size * 0.55, 0, Math.PI * 2);
          ctx.fill();
        }
        if (en.hitFlash > 0) {
          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          ctx.beginPath();
          ctx.arc(ex, ey, size * 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.font = `${size}px ${EMOJI_FONT}`;
        ctx.fillText(def.emoji, ex, ey);
        // HP bar
        const bw = Math.max(cs * 0.7, size);
        const bh = Math.max(3, cs * 0.09);
        const bx = ex - bw / 2;
        const by = ey - size * 0.62 - bh;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(bx, by, bw, bh);
        const frac = Math.max(0, en.hp / en.maxHp);
        ctx.fillStyle = frac > 0.5 ? '#22c55e' : frac > 0.25 ? '#eab308' : '#ef4444';
        ctx.fillRect(bx, by, bw * frac, bh);
      }

      // Projectiles
      for (const pr of s.projectiles) {
        const [px, py] = toScreen(pr.x, pr.y);
        ctx.fillStyle = pr.color;
        ctx.beginPath();
        ctx.arc(px, py, Math.max(2.5, cs * (pr.splash > 0 ? 0.13 : 0.08)), 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Effects
      for (const e of s.effects) {
        const k = e.t / e.life;
        const [x, y] = toScreen(e.x, e.y);
        ctx.globalAlpha = Math.max(0, 1 - k);
        if (e.kind === 'ring') {
          ctx.strokeStyle = e.color;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(x, y, Math.max(1, e.radius * cs * (0.3 + 0.7 * k)), 0, Math.PI * 2);
          ctx.stroke();
        } else {
          const big = e.text.length > 6;
          ctx.font = `bold ${big ? Math.max(14, cs * 0.5) : Math.max(11, cs * 0.34)}px system-ui, sans-serif`;
          ctx.lineWidth = 3;
          ctx.strokeStyle = 'rgba(0,0,0,0.7)';
          ctx.strokeText(e.text, x, y - k * cs * 0.6);
          ctx.fillStyle = e.color;
          ctx.fillText(e.text, x, y - k * cs * 0.6);
        }
        ctx.globalAlpha = 1;
      }
    };

    const frame = (now: number) => {
      const dt = Math.min(MAX_DT, Math.max(0, (now - last) / 1000));
      last = now;
      const s = simRef.current;
      const running = !endedRef.current && s.phase !== 'over';
      if (running) update(dt);
      updateEffects(dt);

      if (s.score > bestRef.current) bestRef.current = s.score;
      if (bestRef.current !== lastReported) {
        lastReported = bestRef.current;
        reportRef.current(bestRef.current);
      }

      draw();

      hudTimer -= dt;
      if (hudTimer <= 0) {
        hudTimer = running ? 0.2 : 0.5;
        if (mountedRef.current) syncHud();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [syncHud]);

  /* ---------------- Input ---------------- */
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const L = layoutRef.current;
    const canvas = canvasRef.current;
    if (!L || !canvas || endedRef.current || simRef.current.phase === 'over') return;
    const rect = canvas.getBoundingClientRect();
    const gx = (e.clientX - rect.left - L.ox) / L.cell;
    const gy = (e.clientY - rect.top - L.oy) / L.cell;
    const lx = L.landscape ? gy : gx;
    const ly = L.landscape ? gx : gy;
    const c = Math.floor(lx);
    const r = Math.floor(ly);
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) { applySelection(null); return; }
    const cur = selRef.current;
    if (cur && cur.c === c && cur.r === r) { applySelection(null); return; }
    const tower = simRef.current.towers.find((t) => t.c === c && t.r === r);
    if (tower) { applySelection({ type: 'tower', c, r }); return; }
    if (PATH_CELLS.has(`${c},${r}`) || (c === BASE_CELL[0] && r === BASE_CELL[1])) { applySelection(null); return; }
    applySelection({ type: 'empty', c, r });
  }, [applySelection]);

  const build = useCallback((kind: TowerKind) => {
    const cur = selRef.current;
    const s = simRef.current;
    if (!cur || cur.type !== 'empty' || endedRef.current || s.phase === 'over') return;
    const cost = TOWERS[kind].cost;
    if (s.coins < cost) return;
    s.coins -= cost;
    s.towers.push({ id: s.nextId++, kind, c: cur.c, r: cur.r, level: 1, spent: cost, cd: 0, flash: 0 });
    s.effects.push({ kind: 'ring', x: cur.c + 0.5, y: cur.r + 0.5, t: 0, life: 0.4, radius: 0.8, color: TOWERS[kind].color, text: '' });
    applySelection({ type: 'tower', c: cur.c, r: cur.r });
    syncHud();
  }, [applySelection, syncHud]);

  const upgrade = useCallback(() => {
    const cur = selRef.current;
    const s = simRef.current;
    if (!cur || cur.type !== 'tower' || endedRef.current || s.phase === 'over') return;
    const t = s.towers.find((tw) => tw.c === cur.c && tw.r === cur.r);
    if (!t || t.level >= MAX_LEVEL) return;
    const cost = upgradeCost(t.kind, t.level);
    if (s.coins < cost) return;
    s.coins -= cost;
    t.level += 1;
    t.spent += cost;
    s.effects.push({ kind: 'ring', x: t.c + 0.5, y: t.r + 0.5, t: 0, life: 0.5, radius: 1, color: '#facc15', text: '' });
    s.effects.push({ kind: 'text', x: t.c + 0.5, y: t.r + 0.2, t: 0, life: 0.9, radius: 0, color: '#facc15', text: `Lv ${t.level}` });
    applySelection(cur);
    syncHud();
  }, [applySelection, syncHud]);

  const sell = useCallback(() => {
    const cur = selRef.current;
    const s = simRef.current;
    if (!cur || cur.type !== 'tower' || endedRef.current || s.phase === 'over') return;
    const t = s.towers.find((tw) => tw.c === cur.c && tw.r === cur.r);
    if (!t) return;
    const refund = Math.floor(t.spent / 2);
    s.coins += refund;
    s.towers = s.towers.filter((tw) => tw !== t);
    s.effects.push({ kind: 'text', x: t.c + 0.5, y: t.r + 0.4, t: 0, life: 0.9, radius: 0, color: '#fde047', text: `+${refund}` });
    applySelection(null);
    syncHud();
  }, [applySelection, syncHud]);

  const onEarn = useCallback(() => {
    if (pendingRef.current || endedRef.current) return;
    pendingRef.current = true;
    setEarning(true);
    earnRef.current()
      .catch(() => 0)
      .then((amount) => {
        pendingRef.current = false;
        if (!mountedRef.current) return;
        setEarning(false);
        const n = Math.max(0, Math.floor(Number(amount) || 0));
        simRef.current.coins += n;
        const id = ++floaterId.current;
        setFloaters((f) => [...f, { id, amount: n }]);
        window.setTimeout(() => {
          if (mountedRef.current) setFloaters((f) => f.filter((x) => x.id !== id));
        }, 1400);
        syncHud();
      });
  }, [syncHud]);

  const restart = useCallback(() => {
    if (endedRef.current) return;
    simRef.current = newSim();
    applySelection(null);
    syncHud();
  }, [applySelection, syncHud]);

  /* ---------------- Render ---------------- */
  const showAvatar = avatar && avatar.length <= 8 && !avatar.includes('/');
  const over = hud.phase === 'over' && !ended;
  const lowTime = hud.timeLeft != null && hud.timeLeft < 30_000;

  return (
    <div className="h-full w-full flex flex-col text-white select-none overflow-hidden" style={{ background: '#0F1729' }}>
      <style>{`
        @keyframes td-float { 0% { opacity: 0; transform: translate(-50%, 0) scale(0.8); } 15% { opacity: 1; transform: translate(-50%, -8px) scale(1.1); } 100% { opacity: 0; transform: translate(-50%, -56px) scale(1); } }
      `}</style>

      {/* HUD */}
      <div className="shrink-0 px-2 pt-2 pb-1">
        <div className="flex items-center gap-1.5 rounded-2xl bg-white/5 border border-white/10 px-2 py-1.5 text-sm font-bold">
          <div className="flex items-center gap-1 min-w-0 mr-auto">
            {showAvatar && <span className="text-lg leading-none">{avatar}</span>}
            <span className="truncate max-w-24 text-white/80 font-semibold">{nickname}</span>
          </div>
          <span className="flex items-center gap-1 rounded-xl bg-yellow-400/15 text-yellow-300 px-2 py-1">
            <Coins size={15} />{hud.coins}
          </span>
          <span className={`flex items-center gap-1 rounded-xl px-2 py-1 ${hud.lives <= 3 ? 'bg-red-500/25 text-red-300' : 'bg-rose-400/15 text-rose-300'}`}>
            <Heart size={15} />{hud.lives}
          </span>
          <span className="flex items-center gap-1 rounded-xl bg-sky-400/15 text-sky-300 px-2 py-1">
            <Swords size={15} />{Math.max(1, hud.wave)}
          </span>
          <span className="flex items-center gap-1 rounded-xl bg-purple-400/15 text-purple-300 px-2 py-1">
            <Trophy size={15} />{hud.best}
          </span>
          {hud.timeLeft != null && (
            <span className={`flex items-center gap-1 rounded-xl px-2 py-1 tabular-nums ${lowTime ? 'bg-red-500/25 text-red-300' : 'bg-white/10 text-white/80'}`}>
              <Clock size={15} />{fmtTime(hud.timeLeft)}
            </span>
          )}
        </div>
      </div>

      {/* Board */}
      <div ref={wrapRef} className="relative flex-1 min-h-0 mx-2">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 touch-none"
          style={{ touchAction: 'none' }}
          onPointerDown={onPointerDown}
        />
        {hud.phase === 'break' && !ended && (
          <div className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 rounded-full bg-black/60 border border-white/15 px-3 py-1 text-sm font-bold whitespace-nowrap">
            {hud.wave === 0 ? 'First wave' : `Wave ${hud.wave + 1}`} in {Math.max(0, hud.breakLeft)}s
            {hud.wave > 0 && hud.wave % 5 === 4 && <span className="ml-1 text-red-300">— 👹 Boss!</span>}
          </div>
        )}
        {hud.phase === 'wave' && hud.wave > 0 && hud.wave % 5 === 0 && !ended && (
          <div className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 rounded-full bg-red-600/70 px-3 py-1 text-sm font-bold whitespace-nowrap">
            👹 Boss wave {hud.wave}
          </div>
        )}

        {over && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/65 backdrop-blur-sm rounded-2xl">
            <div className="rounded-2xl bg-[#0F1729] border border-white/15 p-6 text-center shadow-2xl mx-4">
              <div className="text-5xl mb-2">💥</div>
              <h2 className="text-2xl mb-1">Base destroyed!</h2>
              <p className="text-white/70 mb-1">You reached wave {hud.wave}.</p>
              <p className="text-lg font-bold mb-4">Final score {hud.score}</p>
              {hud.best > hud.score && <p className="text-sm text-white/60 -mt-3 mb-4">Best: {hud.best}</p>}
              <button
                onClick={restart}
                className="inline-flex items-center gap-2 rounded-2xl bg-sky-500 hover:bg-sky-400 active:translate-y-0.5 px-6 py-3 text-lg font-bold shadow-[0_4px_0_#0369a1]"
              >
                <RotateCcw size={20} /> Rebuild
              </button>
            </div>
          </div>
        )}
        {ended && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm rounded-2xl">
            <div className="rounded-2xl bg-[#0F1729] border border-white/15 p-6 text-center shadow-2xl mx-4">
              <div className="text-5xl mb-2">⏰</div>
              <h2 className="text-2xl mb-1">Time&apos;s up!</h2>
              <p className="text-xl font-bold">Final score {hud.best}</p>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="shrink-0 px-2 pt-2 pb-2 pb-safe space-y-2">
        {!ended && !over && sel?.type === 'empty' && (
          <div className="flex gap-2">
            {TOWER_KINDS.map((k) => {
              const d = TOWERS[k];
              const afford = hud.coins >= d.cost;
              return (
                <button
                  key={k}
                  onClick={() => build(k)}
                  disabled={!afford}
                  className={`flex-1 min-h-16 rounded-2xl border px-1 py-1.5 flex flex-col items-center justify-center transition active:scale-95 ${afford ? 'bg-white/10 border-white/20 hover:bg-white/15' : 'bg-white/5 border-white/5 opacity-50'}`}
                  style={afford ? { boxShadow: `inset 0 -3px 0 ${d.color}` } : undefined}
                >
                  <span className="text-2xl leading-none">{d.emoji}</span>
                  <span className="text-xs font-bold mt-0.5">{d.name}</span>
                  <span className="text-xs text-yellow-300 font-bold flex items-center gap-0.5"><Coins size={11} />{d.cost}</span>
                </button>
              );
            })}
            <button
              onClick={() => applySelection(null)}
              aria-label="Cancel"
              className="w-12 min-h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10"
            >
              <X size={20} />
            </button>
          </div>
        )}

        {!ended && !over && sel?.type === 'tower' && selTower && (() => {
          const d = TOWERS[selTower.kind];
          const maxed = selTower.level >= MAX_LEVEL;
          const cost = maxed ? 0 : upgradeCost(selTower.kind, selTower.level);
          const afford = !maxed && hud.coins >= cost;
          const refund = Math.floor(selTower.spent / 2);
          return (
            <div className="flex gap-2 items-stretch">
              <div className="flex items-center gap-2 rounded-2xl bg-white/5 border border-white/10 px-2 min-w-0">
                <span className="text-2xl">{d.emoji}</span>
                <div className="leading-tight min-w-0">
                  <div className="text-sm font-bold truncate">{d.name}</div>
                  <div className="text-xs text-white/60">Lv {selTower.level}/{MAX_LEVEL}</div>
                </div>
              </div>
              <button
                onClick={upgrade}
                disabled={!afford}
                className={`flex-1 min-h-14 rounded-2xl px-2 font-bold flex items-center justify-center gap-1.5 transition active:scale-95 ${afford ? 'bg-emerald-500 hover:bg-emerald-400 shadow-[0_3px_0_#047857]' : 'bg-white/5 text-white/40'}`}
              >
                <ArrowUpCircle size={18} />
                {maxed ? 'Max level' : <>Upgrade <span className="flex items-center gap-0.5 text-yellow-200"><Coins size={13} />{cost}</span></>}
              </button>
              <button
                onClick={sell}
                className="min-h-14 rounded-2xl px-3 font-bold bg-rose-500/80 hover:bg-rose-500 shadow-[0_3px_0_#9f1239] active:scale-95 flex items-center gap-1"
              >
                Sell <span className="text-yellow-200">+{refund}</span>
              </button>
              <button
                onClick={() => applySelection(null)}
                aria-label="Close"
                className="w-11 min-h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10"
              >
                <X size={18} />
              </button>
            </div>
          );
        })()}

        {!ended && !over && !sel && (
          <p className="text-center text-xs text-white/50">Tap an empty tile to build a tower · tap a tower to upgrade or sell</p>
        )}

        <div className="relative">
          <button
            onClick={onEarn}
            disabled={earning || ended}
            className={`w-full min-h-14 rounded-2xl text-lg font-bold flex items-center justify-center gap-2 transition active:translate-y-0.5 ${earning || ended ? 'bg-yellow-500/30 text-white/60' : 'bg-yellow-400 hover:bg-yellow-300 text-[#0F1729] shadow-[0_4px_0_#a16207]'}`}
          >
            {earning ? 'Answering…' : '💰 Earn coins'}
          </button>
          {floaters.map((f) => (
            <span
              key={f.id}
              className={`pointer-events-none absolute left-1/2 top-0 text-2xl font-extrabold drop-shadow ${f.amount > 0 ? 'text-yellow-300' : 'text-red-400'}`}
              style={{ animation: 'td-float 1.4s ease-out forwards' }}
            >
              {f.amount > 0 ? `+${f.amount} 💰` : 'No coins'}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
