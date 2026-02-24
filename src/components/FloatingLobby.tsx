import { useRef, useCallback, useEffect } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import type { SessionPlayer } from '../types/models';

interface AvatarColor {
  bg: string;
  border: string;
  text: string;
}

interface FloatingLobbyProps {
  players: SessionPlayer[];
  avatarColors: AvatarColor[];
}

function getAvatarSize(count: number): number {
  if (count <= 20) return 56;
  if (count <= 50) return 44;
  if (count <= 100) return 36;
  return 28;
}

function getFontClass(size: number): string {
  if (size >= 56) return 'text-2xl';
  if (size >= 44) return 'text-xl';
  if (size >= 36) return 'text-lg';
  return 'text-sm';
}

function getInitialFontClass(size: number): string {
  if (size >= 56) return 'text-sm font-bold';
  if (size >= 44) return 'text-xs font-bold';
  return 'text-[10px] font-bold';
}

export default function FloatingLobby({ players, avatarColors }: FloatingLobbyProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tweensRef = useRef<Map<string, gsap.core.Tween[]>>(new Map());
  const knownIdsRef = useRef<Set<string>>(new Set());
  const positionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const getRandomPosition = useCallback(
    (avatarSize: number, existingPositions: Map<string, { x: number; y: number }>) => {
      const container = containerRef.current;
      if (!container) return { x: 0, y: 0 };
      const padding = 8;
      const maxX = container.clientWidth - avatarSize - padding * 2;
      const maxY = container.clientHeight - avatarSize - padding * 2;
      if (maxX <= 0 || maxY <= 0) return { x: padding, y: padding };

      const minDist = avatarSize * 1.3;
      let bestPos = { x: padding + Math.random() * maxX, y: padding + Math.random() * maxY };

      for (let attempt = 0; attempt < 10; attempt++) {
        const candidate = {
          x: padding + Math.random() * maxX,
          y: padding + Math.random() * maxY,
        };
        let tooClose = false;
        for (const pos of existingPositions.values()) {
          const dx = candidate.x - pos.x;
          const dy = candidate.y - pos.y;
          if (Math.sqrt(dx * dx + dy * dy) < minDist) {
            tooClose = true;
            break;
          }
        }
        if (!tooClose) return candidate;
        bestPos = candidate;
      }
      return bestPos;
    },
    [],
  );

  const getRandomDriftTarget = useCallback((avatarSize: number) => {
    const container = containerRef.current;
    if (!container) return { x: 0, y: 0 };
    const padding = 8;
    const maxX = container.clientWidth - avatarSize - padding * 2;
    const maxY = container.clientHeight - avatarSize - padding * 2;
    if (maxX <= 0 || maxY <= 0) return { x: padding, y: padding };
    return {
      x: padding + Math.random() * maxX,
      y: padding + Math.random() * maxY,
    };
  }, []);

  const startDrift = useCallback(
    (el: Element, playerId: string, avatarSize: number) => {
      const slowMode = players.length >= 60;
      const minDur = slowMode ? 10 : 6;
      const maxDur = slowMode ? 18 : 14;

      const drift = () => {
        const target = getRandomDriftTarget(avatarSize);
        const tween = gsap.to(el, {
          x: target.x,
          y: target.y,
          duration: minDur + Math.random() * (maxDur - minDur),
          ease: 'sine.inOut',
          onComplete: drift,
        });
        // Track this tween
        const existing = tweensRef.current.get(playerId) || [];
        // Replace the drift tween (index 0 is always drift)
        existing[0] = tween;
        tweensRef.current.set(playerId, existing);
        positionsRef.current.set(playerId, target);
      };
      drift();
    },
    [getRandomDriftTarget, players.length],
  );

  const startSecondaryMotion = useCallback(
    (el: Element, playerId: string) => {
      if (players.length >= 60) return;
      const rotTween = gsap.to(el, {
        rotation: gsap.utils.random(-8, 8),
        scale: gsap.utils.random(0.95, 1.05),
        duration: gsap.utils.random(2, 4),
        ease: 'sine.inOut',
        yoyo: true,
        repeat: -1,
      });
      const existing = tweensRef.current.get(playerId) || [];
      existing[1] = rotTween;
      tweensRef.current.set(playerId, existing);
    },
    [players.length],
  );

  // Handle resize — kill all drifts and restart
  useEffect(() => {
    if (prefersReducedMotion) return;
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      const avatarSize = getAvatarSize(players.length);
      // Kill all existing tweens and restart drifts
      for (const [pid, tweenArr] of tweensRef.current.entries()) {
        tweenArr.forEach((t) => t?.kill());
        const el = container.querySelector(`[data-player-id="${pid}"]`);
        if (el) {
          // Re-position within new bounds
          const pos = getRandomPosition(avatarSize, positionsRef.current);
          positionsRef.current.set(pid, pos);
          gsap.set(el, { x: pos.x, y: pos.y });
          startDrift(el, pid, avatarSize);
          startSecondaryMotion(el, pid);
        }
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [prefersReducedMotion, players.length, getRandomPosition, startDrift, startSecondaryMotion]);

  useGSAP(
    () => {
      if (prefersReducedMotion) return;
      const container = containerRef.current;
      if (!container) return;

      const avatarSize = getAvatarSize(players.length);
      const currentIds = new Set(players.map((p) => p.id));

      // Detect removed players
      for (const knownId of knownIdsRef.current) {
        if (!currentIds.has(knownId)) {
          const tweenArr = tweensRef.current.get(knownId);
          if (tweenArr) tweenArr.forEach((t) => t?.kill());
          tweensRef.current.delete(knownId);
          positionsRef.current.delete(knownId);
          knownIdsRef.current.delete(knownId);
        }
      }

      // Detect new players
      const newPlayers = players.filter((p) => !knownIdsRef.current.has(p.id));

      newPlayers.forEach((p, newIndex) => {
        knownIdsRef.current.add(p.id);
        const el = container.querySelector(`[data-player-id="${p.id}"]`);
        if (!el) return;

        // Assign initial position
        const pos = getRandomPosition(avatarSize, positionsRef.current);
        positionsRef.current.set(p.id, pos);
        gsap.set(el, { x: pos.x, y: pos.y, scale: 0, opacity: 0 });

        // Entrance animation
        gsap.to(el, {
          scale: 1,
          opacity: 1,
          duration: 0.6,
          ease: 'back.out(1.7)',
          delay: newIndex * 0.05,
          onComplete: () => {
            startDrift(el, p.id, avatarSize);
            startSecondaryMotion(el, p.id);
          },
        });
      });
    },
    { scope: containerRef, dependencies: [players] },
  );

  // Reduced motion fallback — static grid
  if (prefersReducedMotion) {
    const avatarSize = getAvatarSize(players.length);
    return (
      <div className="flex flex-wrap gap-2 sm:gap-2.5">
        {players.length > 0 ? (
          players.map((p, i) => {
            const color = avatarColors[i % avatarColors.length];
            return (
              <div
                key={p.id}
                title={p.nickname}
                style={{ width: avatarSize, height: avatarSize }}
                className={`rounded-full ${color.bg} border ${color.border} flex items-center justify-center shrink-0 animate-fade-in cursor-default`}
              >
                {p.avatar ? (
                  <span className={`${getFontClass(avatarSize)} leading-none`}>{p.avatar}</span>
                ) : (
                  <span className={`${getInitialFontClass(avatarSize)} ${color.text}`}>
                    {p.nickname.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
            );
          })
        ) : (
          <div className="flex items-center justify-center gap-3 py-8 opacity-50 w-full">
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center animate-pulse">
              <span className="text-white/30 text-lg">+</span>
            </div>
            <span className="text-white/30 italic text-sm">Waiting for players...</span>
          </div>
        )}
      </div>
    );
  }

  const avatarSize = getAvatarSize(players.length);

  return (
    <div
      ref={containerRef}
      className="relative w-full flex-1 min-h-0 overflow-hidden rounded-2xl bg-white/[0.03] border border-white/[0.06]"
    >
      {players.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center gap-3 opacity-50">
          <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center animate-pulse">
            <span className="text-white/30 text-lg">+</span>
          </div>
          <span className="text-white/30 italic text-sm">Waiting for players...</span>
        </div>
      )}
      {players.map((p, i) => {
        const color = avatarColors[i % avatarColors.length];
        return (
          <div
            key={p.id}
            data-player-id={p.id}
            title={p.nickname}
            className={`absolute top-0 left-0 rounded-full ${color.bg} border ${color.border} flex items-center justify-center cursor-default`}
            style={{
              width: avatarSize,
              height: avatarSize,
              opacity: 0,
              willChange: 'transform',
            }}
          >
            {p.avatar ? (
              <span className={`${getFontClass(avatarSize)} leading-none`}>{p.avatar}</span>
            ) : (
              <span className={`${getInitialFontClass(avatarSize)} ${color.text}`}>
                {p.nickname.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
