import { useId } from 'react';

interface WaveBackgroundProps {
  className?: string;
  variant?: 'light' | 'dark';
  position?: 'top' | 'bottom' | 'both';
  flip?: boolean;
}

// Broad sweeping ribbon shapes that overlap to create layered depth.
// Inspired by smooth diagonal curves in monochrome gray.
const shapes = [
  // 1 — Large background sweep from upper-left down to lower-right
  { d: 'M0,0 C300,50 600,200 900,350 C1200,500 1350,600 1440,700 L1440,900 L0,900 Z' },
  // 2 — Counter-curve arc from bottom-right sweeping up-left
  { d: 'M1440,200 C1200,300 900,500 600,580 C300,660 100,680 0,700 L0,900 L1440,900 Z' },
  // 3 — Thin accent ribbon
  { d: 'M0,700 C240,650 540,560 820,490 C1100,420 1300,390 1440,360 L1440,420 C1300,450 1100,480 820,550 C540,620 240,710 0,760 Z' },
  // 4 — Subtle upper arc adding depth to the top area
  { d: 'M-50,0 C200,80 500,180 800,200 C1100,220 1300,160 1500,100 L1500,0 Z' },
];

interface GradientDef {
  c1: string; o1: number;
  c2: string; o2: number;
  x1: string; y1: string; x2: string; y2: string;
}

const lightDefs: GradientDef[] = [
  // 1 — soft gray sweep
  { c1: '#CBD5E1', o1: 0.45, c2: '#E2E8F0', o2: 0.25, x1: '0', y1: '0', x2: '1', y2: '1' },
  // 2 — counter gray arc
  { c1: '#E2E8F0', o1: 0.35, c2: '#CBD5E1', o2: 0.40, x1: '1', y1: '0', x2: '0', y2: '1' },
  // 3 — thin gray accent ribbon
  { c1: '#CBD5E1', o1: 0.30, c2: '#E2E8F0', o2: 0.20, x1: '0', y1: '1', x2: '1', y2: '0' },
  // 4 — subtle top fill
  { c1: '#E2E8F0', o1: 0.20, c2: '#F1F5F9', o2: 0.10, x1: '0', y1: '1', x2: '1', y2: '0' },
];

const darkDefs: GradientDef[] = [
  { c1: '#1E293B', o1: 0.50, c2: '#334155', o2: 0.30, x1: '0', y1: '0', x2: '1', y2: '1' },
  { c1: '#334155', o1: 0.40, c2: '#1E293B', o2: 0.45, x1: '1', y1: '0', x2: '0', y2: '1' },
  { c1: '#1E293B', o1: 0.35, c2: '#334155', o2: 0.25, x1: '0', y1: '1', x2: '1', y2: '0' },
  { c1: '#334155', o1: 0.25, c2: '#1E293B', o2: 0.15, x1: '0', y1: '1', x2: '1', y2: '0' },
];

function RibbonWaves({
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
        <RibbonWaves id={`${id}-b`} defs={defs} flipped={flip} />
      )}
      {(position === 'top' || position === 'both') && (
        <RibbonWaves id={`${id}-t`} defs={defs} flipped={!flip} />
      )}
    </div>
  );
}
