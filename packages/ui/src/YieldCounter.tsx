"use client";

import { useEffect, useState } from "react";

export interface AccruedYieldProps {
  /** Escrow principal in stroops. */
  principalStroops: string;
  /** Annual percentage yield, e.g. 5 for 5%. */
  apyPercent: number;
  /** ISO-8601 time the principal was locked. */
  lockedTimestamp: string;
  /** Display code such as "XLM" or "USDC". */
  assetCode: string;
}

/** 365.25-day year, matching continuous APR accrual. */
const SECONDS_PER_YEAR = 31_557_600;
const STROOPS_PER_UNIT = 10_000_000;

/**
 * Interest accrued since `lockedTimestamp`, in whole asset units (not stroops).
 * Derived only from elapsed time — callers do not refetch to advance it.
 * Returns 0 when the inputs cannot produce a real, non-negative accrual.
 */
export function accruedYieldUnits(
  principalStroops: string,
  apyPercent: number,
  lockedTimestamp: string,
  nowMs: number
): number {
  const principal = Number(principalStroops);
  if (!Number.isFinite(principal) || principal <= 0) return 0;
  if (!Number.isFinite(apyPercent) || apyPercent <= 0) return 0;
  const lockedMs = Date.parse(lockedTimestamp);
  if (Number.isNaN(lockedMs)) return 0;
  const elapsedSeconds = (nowMs - lockedMs) / 1000;
  if (elapsedSeconds <= 0) return 0;
  const accruedStroops = principal * (apyPercent / 100) * (elapsedSeconds / SECONDS_PER_YEAR);
  if (!Number.isFinite(accruedStroops) || accruedStroops <= 0) return 0;
  return accruedStroops / STROOPS_PER_UNIT;
}

function formatYield(units: number, assetCode: string): string {
  const value = units.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 7,
  });
  return `${value} ${assetCode}`;
}

/**
 * Live accrued-yield figure. The displayed amount advances once a second from
 * elapsed time, with no network refetch.
 */
export function YieldCounter({
  principalStroops,
  apyPercent,
  lockedTimestamp,
  assetCode,
}: AccruedYieldProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const units = accruedYieldUnits(principalStroops, apyPercent, lockedTimestamp, nowMs);

  return (
    <p style={{ margin: 0, display: "flex", flexDirection: "column", gap: "0.125rem" }}>
      <span style={{ fontSize: "0.75rem", color: "#6b7280" }}>Accrued yield</span>
      <span
        data-testid="yield-counter"
        style={{
          fontSize: "1.25rem",
          fontWeight: 600,
          fontVariantNumeric: "tabular-nums",
          letterSpacing: "-0.01em",
        }}
      >
        {formatYield(units, assetCode)}
      </span>
    </p>
  );
}
