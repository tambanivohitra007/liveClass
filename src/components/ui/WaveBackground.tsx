import { useId } from 'react';

interface WaveBackgroundProps {
  className?: string;
  variant?: 'light' | 'dark';
  position?: 'top' | 'bottom' | 'both';
  flip?: boolean;
}

// Abstract shapes: diagonal sweeps, counter-curves, and floating arcs
// that cross at different angles for layered depth.
const shapes = [
  // 1 — Primary diagonal sweep (blurred → atmospheric glow)
  { d: 'M0,700 C240,620 520,500 800,420 C1080,340 1260,360 1440,280 L1440,900 L0,900 Z', blur: true },
  // 2 — Counter-diagonal ribbon (blurred, crosses shape 1)
  { d: 'M1440,720 C1200,660 960,560 720,510 C480,460 280,500 0,460 L0,900 L1440,900 Z', blur: true },
  // 3 — Floating arc in upper zone (blurred → nebula feel)
  { d: 'M-100,280 C200,180 540,140 840,170 C1140,200 1340,130 1540,80 L1540,260 C1340,310 1140,380 840,350 C540,320 200,370 -100,440 Z', blur: true },
  // 4 — Sharp diagonal band (crisp edge, structural)
  { d: 'M0,800 C320,750 660,660 980,600 C1180,560 1340,550 1440,520 L1440,620 C1340,650 1180,660 980,700 C660,760 320,850 0,900 Z', blur: false },
  // 5 — Thin horizon line (crisp, grounds the composition)
  { d: 'M0,860 C360,840 720,800 1080,780 C1260,770 1380,774 1440,770 L1440,810 C1380,814 1260,818 1080,828 C720,848 360,880 0,900 Z', blur: false },
];

// Each shape gets a gradient with direction, two color stops, and opacities.
interface GradientDef {
  c1: string; o1: number;
  c2: string; o2: number;
  x1: string; y1: string; x2: string; y2: string;
}

const lightDefs: GradientDef[] = [
  // 1 — blue → cyan, diagonal
  { c1: '#3B82F6', o1: 0.05, c2: '#06B6D4', o2: 0.03, x1: '0', y1: '1', x2: '1', y2: '0' },
  // 2 — violet → blue, reverse diagonal
  { c1: '#8B5CF6', o1: 0.04, c2: '#3B82F6', o2: 0.02, x1: '1', y1: '1', x2: '0', y2: '0' },
  // 3 — cyan → violet, vertical
  { c1: '#06B6D4', o1: 0.04, c2: '#8B5CF6', o2: 0.02, x1: '0', y1: '1', x2: '0', y2: '0' },
  // 4 — blue → teal, diagonal
  { c1: '#3B82F6', o1: 0.06, c2: '#14B8A6', o2: 0.03, x1: '0', y1: '1', x2: '1', y2: '0' },
  // 5 — slate wash, horizontal
  { c1: '#64748B', o1: 0.05, c2: '#94A3B8', o2: 0.02, x1: '0', y1: '0', x2: '1', y2: '0' },
];

const darkDefs: GradientDef[] = [
  { c1: '#3B82F6', o1: 0.14, c2: '#06B6D4', o2: 0.07, x1: '0', y1: '1', x2: '1', y2: '0' },
  { c1: '#8B5CF6', o1: 0.12, c2: '#3B82F6', o2: 0.06, x1: '1', y1: '1', x2: '0', y2: '0' },
  { c1: '#06B6D4', o1: 0.10, c2: '#8B5CF6', o2: 0.05, x1: '0', y1: '1', x2: '0', y2: '0' },
  { c1: '#3B82F6', o1: 0.16, c2: '#14B8A6', o2: 0.08, x1: '0', y1: '1', x2: '1', y2: '0' },
  { c1: '#475569', o1: 0.12, c2: '#64748B', o2: 0.06, x1: '0', y1: '0', x2: '1', y2: '0' },
];

function AbstractWaves({
  id,
  defs,
  flipped,
}: {
  id: string;
  defs: GradientDef[];
  flipped: boolean;
}) {
  return (
    <svg
      viewBox="0 0 1440 900"
      preserveAspectRatio="none"
      className="absolute inset-0 w-full h-full"
      style={flipped ? { transform: 'rotate(180deg)' } : undefined}
    >
      <defs>
        <filter id={`${id}-blur`}>
          <feGaussianBlur stdDeviation="40" />
        </filter>
        {defs.map((g, i) => (
          <linearGradient
            key={i}
            id={`${id}-g${i}`}
            x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2}
          >
            <stop offset="0%" stopColor={g.c1} stopOpacity={g.o1} />
            <stop offset="100%" stopColor={g.c2} stopOpacity={g.o2} />
          </linearGradient>
        ))}
      </defs>
      {shapes.map((s, i) => (
        <path
          key={i}
          d={s.d}
          fill={`url(#${id}-g${i})`}
          filter={s.blur ? `url(#${id}-blur)` : undefined}
        />
      ))}
    </svg>
  );
}

export default function WaveBackground({
  className = '',
  variant = 'light',
  position = 'bottom',
  flip = false,
}: WaveBackgroundProps) {
  const id = useId();
  const defs = variant === 'dark' ? darkDefs : lightDefs;

  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}>
      {(position === 'bottom' || position === 'both') && (
        <AbstractWaves id={`${id}-b`} defs={defs} flipped={flip} />
      )}
      {(position === 'top' || position === 'both') && (
        <AbstractWaves id={`${id}-t`} defs={defs} flipped={!flip} />
      )}
    </div>
  );
}
