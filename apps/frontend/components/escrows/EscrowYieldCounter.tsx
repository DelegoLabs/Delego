"use client";

import { useEffect, useRef, useState } from "react";

export interface YieldCounterProps {
  /** Escrow principal in stroops. */
  principalStroops: bigint;
  /** Annual percentage rate in basis points (e.g. 450 = 4.5%). */
  aprBps: number;
  /** Unix timestamp (ms) when the deposit was made. */
  depositTimestamp: number;
}

/** 365.25-day year, matching continuous APR accrual. */
const SECONDS_PER_YEAR = 31_557_600;
const STROOPS_PER_UNIT = 10_000_000;
const BPS_DENOMINATOR = 10_000;

/**
 * Interest accrued since `depositTimestamp`, in whole asset units (not stroops).
 * Derived only from elapsed time — callers do not refetch to advance it.
 * Returns 0 when the inputs cannot produce a real, non-negative accrual.
 */
export function accruedYieldUnits(
  principalStroops: bigint,
  aprBps: number,
  depositTimestamp: number,
  nowMs: number
): number {
  if (principalStroops <= 0n) return 0;
  if (!Number.isFinite(aprBps) || aprBps <= 0) return 0;
  if (!Number.isFinite(depositTimestamp) || depositTimestamp <= 0) return 0;
  const elapsedSeconds = (nowMs - depositTimestamp) / 1000;
  if (elapsedSeconds <= 0) return 0;
  const principal = Number(principalStroops);
  const accruedStroops =
    principal * (aprBps / BPS_DENOMINATOR) * (elapsedSeconds / SECONDS_PER_YEAR);
  if (!Number.isFinite(accruedStroops) || accruedStroops <= 0) return 0;
  return accruedStroops / STROOPS_PER_UNIT;
}

function formatYield(units: number): string {
  return units.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 7,
  });
}

/**
 * Real-time accrued yield counter with micro-animations for Blend escrows.
 *
 * Uses `requestAnimationFrame` for high-frequency ticker updates, providing
 * smooth visual feedback as yield accumulates. The displayed amount advances
 * continuously from elapsed time, with no network refetch.
 */
export function EscrowYieldCounter({
  principalStroops,
  aprBps,
  depositTimestamp,
}: YieldCounterProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [displayUnits, setDisplayUnits] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    startTimeRef.current = performance.now();

    const tick = (timestamp: number) => {
      // Use performance.now() for smooth animation timing, but derive
      // the actual yield from Date.now() for correctness.
      const elapsed = timestamp - startTimeRef.current;
      // Throttle state updates to ~30fps for smooth animation without
      // excessive re-renders. The yield value itself is computed from
      // the real clock.
      if (elapsed >= 33) {
        setNowMs(Date.now());
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  // Smooth interpolation between displayed value and actual value
  const targetUnits = accruedYieldUnits(
    principalStroops,
    aprBps,
    depositTimestamp,
    nowMs
  );

  useEffect(() => {
    // Micro-animation: ease the displayed value toward the target
    // for a smooth counting effect.
    const diff = targetUnits - displayUnits;
    if (Math.abs(diff) < 0.0000001) {
      setDisplayUnits(targetUnits);
      return;
    }
    // Exponential easing factor — fast approach, smooth landing
    const eased = displayUnits + diff * 0.15;
    setDisplayUnits(eased);
  }, [targetUnits, displayUnits]);

  const formatted = formatYield(displayUnits);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.125rem",
      }}
    >
      <span
        style={{
          fontSize: "0.75rem",
          color: "#6b7280",
        }}
      >
        Accrued yield
      </span>
      <span
        data-testid="escrow-yield-counter"
        style={{
          fontSize: "1.25rem",
          fontWeight: 600,
          fontVariantNumeric: "tabular-nums",
          letterSpacing: "-0.01em",
          transition: "opacity 0.15s ease-out",
        }}
      >
        {formatted} XLM
      </span>
      <span
        style={{
          fontSize: "0.6875rem",
          color: "#9ca3af",
        }}
      >
        {(aprBps / 100).toFixed(2)}% APR
      </span>
    </div>
  );
}
