"use client";

import { useEffect, useMemo } from "react";

export interface ConfettiBurstProps {
  /** Number of particles to render. Defaults to 24. */
  count?: number;
  /** How long the burst stays mounted before `onDone`, in ms. Defaults to 1800. */
  durationMs?: number;
  /** Called once the burst finishes — or immediately when motion is reduced. */
  onDone?: () => void;
}

const PARTICLE_COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#ec4899", "#8b5cf6"];

/**
 * Travel/flip variants. Each maps to a `release-confetti-fall-*` keyframe in
 * globals.css, so per-particle motion needs no inline CSS custom properties —
 * only the standard `left` / `background` / `animation-delay` are set inline.
 */
const PARTICLE_VARIANTS = ["a", "b", "c", "d"] as const;

/**
 * Whether the user has asked their OS to reduce motion. Exported so callers
 * (and tests) can share the same check. Falls back to `false` where
 * `matchMedia` isn't available, e.g. jsdom.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Small deterministic PRNG so particle layout is stable across runs/tests. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Purely decorative celebration for a successful escrow release (#707).
 *
 * Intentionally dependency-free — no confetti library — and renders nothing
 * when the user prefers reduced motion, so the success state is still
 * announced through the modal's text rather than through animation.
 */
export function ConfettiBurst({ count = 24, durationMs = 1800, onDone }: ConfettiBurstProps) {
  const reducedMotion = useMemo(() => prefersReducedMotion(), []);

  useEffect(() => {
    if (reducedMotion) {
      onDone?.();
      return;
    }
    const timer = setTimeout(() => onDone?.(), durationMs);
    return () => clearTimeout(timer);
  }, [reducedMotion, durationMs, onDone]);

  const particles = useMemo(() => {
    const random = mulberry32(0x5eed);
    return Array.from({ length: count }, (_, index) => ({
      id: index,
      left: Math.round(random() * 100),
      delayMs: Math.round(random() * 350),
      variant: PARTICLE_VARIANTS[index % PARTICLE_VARIANTS.length],
      color: PARTICLE_COLORS[index % PARTICLE_COLORS.length],
    }));
  }, [count]);

  if (reducedMotion) return null;

  return (
    <div
      aria-hidden="true"
      data-testid="confetti-burst"
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      {particles.map((particle) => (
        <span
          key={particle.id}
          className={`release-confetti-piece release-confetti-piece--${particle.variant}`}
          data-testid="confetti-piece"
          style={{
            left: `${particle.left}%`,
            background: particle.color,
            animationDelay: `${particle.delayMs}ms`,
          }}
        />
      ))}
    </div>
  );
}
