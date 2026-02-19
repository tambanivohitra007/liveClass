interface WaveBackgroundProps {
  className?: string;
  variant?: 'light' | 'dark';
  position?: 'top' | 'bottom' | 'both';
  flip?: boolean;
}

const lightFills = [
  'rgba(212,86,107,0.04)',
  'rgba(212,86,107,0.07)',
  'rgba(212,86,107,0.10)',
  'rgba(212,86,107,0.14)',
];

const darkFills = [
  'rgba(26,50,99,0.15)',
  'rgba(26,50,99,0.25)',
  'rgba(26,50,99,0.35)',
  'rgba(26,50,99,0.45)',
];

// 4 hand-crafted cubic bezier wave paths with different amplitudes and offsets
const wavePaths = [
  // Layer 1: gentle, wide wave
  'M0,224 C180,180 360,260 540,220 C720,180 900,240 1080,200 C1260,160 1380,210 1440,192 L1440,320 L0,320 Z',
  // Layer 2: slightly higher, offset peaks
  'M0,256 C160,210 320,280 520,240 C720,200 880,270 1100,230 C1280,200 1400,240 1440,224 L1440,320 L0,320 Z',
  // Layer 3: more pronounced curve
  'M0,270 C200,230 380,300 580,250 C780,200 960,290 1160,250 C1320,220 1400,260 1440,248 L1440,320 L0,320 Z',
  // Layer 4: frontmost, most visible
  'M0,288 C240,260 400,310 600,280 C800,250 1000,300 1200,272 C1340,256 1420,280 1440,270 L1440,320 L0,320 Z',
];

function WaveSvg({ fills, flip }: { fills: string[]; flip?: boolean }) {
  return (
    <svg
      viewBox="0 0 1440 320"
      preserveAspectRatio="none"
      className="absolute bottom-0 w-full h-[40%]"
      style={flip ? { transform: 'scaleY(-1)', bottom: 'auto', top: 0 } : undefined}
    >
      {wavePaths.map((d, i) => (
        <path key={i} d={d} fill={fills[i]} />
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
  const fills = variant === 'dark' ? darkFills : lightFills;

  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}>
      {(position === 'bottom' || position === 'both') && (
        <WaveSvg fills={fills} flip={flip} />
      )}
      {(position === 'top' || position === 'both') && (
        <WaveSvg fills={fills} flip={!flip} />
      )}
    </div>
  );
}
