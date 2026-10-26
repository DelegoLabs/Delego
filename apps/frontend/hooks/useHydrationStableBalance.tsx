/**
 * useHydrationStableBalance - Hook for rendering balance values without hydration mismatches
 *
 * Problem: Server-side rendering uses default locale while client uses user's locale,
 * causing React hydration mismatch warnings when formatted numbers differ (e.g. "100.00" vs "100,00").
 *
 * Solution: Render a stable skeleton on server, then format with user locale after mount.
 */

"use client";

import { useEffect, useState } from "react";

interface BalanceFormatOptions {
  /** Number of decimal places to show */
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
}

interface UseHydrationStableBalanceResult {
  /**
   * Stable server-rendered placeholder for initial paint.
   * Uses a non-breaking space to prevent layout shift.
   */
  serverPlaceholder: React.ReactNode;
  /** Formatted balance after client hydration with user's locale */
  formattedValue: string | null;
  /** True after client has mounted and formatted the value */
  isHydrated: boolean;
  /** Force reformatting (e.g., when locale changes) */
  refetch: () => void;
}

/**
 * Returns a stable server placeholder and formatted client value to prevent hydration mismatches.
 * 
 * @param stroopAmount - BigInt or string amount in stroops
 * @param decimals - Number of decimal places (default: 2 for XLM)
 * @param currencyCode - Currency code for Intl.NumberFormat (default: undefined)
 * @param options - Intl.NumberFormat options
 * @example
 * const { serverPlaceholder, formattedValue, isHydrated } = useHydrationStableBalance(amount);
 * return (
 *   <span>
 *     {isHydrated ? formattedValue : serverPlaceholder}
 *   </span>
 * );
 */
/** Stable server/client-first paint — never locale-format on the server. */
export const HYDRATION_BALANCE_PLACEHOLDER = "---";

const STROOPS_PER_UNIT = 10_000_000n;

/** Deterministic format (en-US digits) so snapshots do not depend on host locale. */
function formatStroops(
  stroopAmount: bigint | string,
  decimals: number,
  currencyCode: string,
  options: BalanceFormatOptions = {},
): string {
  const amount =
    typeof stroopAmount === "string" ? BigInt(stroopAmount) : stroopAmount;
  const min = options.minimumFractionDigits ?? decimals;
  const max = options.maximumFractionDigits ?? decimals;

  // Fixed-point divide in number space after scaling to avoid SSR locale drift
  const whole = amount / STROOPS_PER_UNIT;
  const frac = amount % STROOPS_PER_UNIT;
  const asNumber = Number(whole) + Number(frac) / Number(STROOPS_PER_UNIT);

  const formatted = asNumber.toLocaleString("en-US", {
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  });

  return `${formatted} ${currencyCode}`;
}

export function useHydrationStableBalance(
  stroopAmount: bigint | string | null | undefined,
  decimals: number = 2,
  currencyCode: string = "XLM",
  options: BalanceFormatOptions = {},
): UseHydrationStableBalanceResult {
  const [isHydrated, setIsHydrated] = useState(false);
  const [formattedValue, setFormattedValue] = useState<string | null>(null);

  // Client-only: never run locale formatting during SSR / first paint
  useEffect(() => {
    if (stroopAmount == null) {
      setFormattedValue(null);
      setIsHydrated(true);
      return;
    }

    try {
      setFormattedValue(
        formatStroops(stroopAmount, decimals, currencyCode, options),
      );
    } catch {
      setFormattedValue(null);
    }
    setIsHydrated(true);
  }, [stroopAmount, decimals, currencyCode, options]);

  const serverPlaceholder = (
    <span aria-busy={!isHydrated} aria-live="polite">
      {HYDRATION_BALANCE_PLACEHOLDER}
    </span>
  );

  const refetch = () => {
    if (stroopAmount == null) {
      setFormattedValue(null);
      return;
    }
    try {
      setFormattedValue(
        formatStroops(stroopAmount, decimals, currencyCode, options),
      );
    } catch {
      setFormattedValue(null);
    }
  };

  return {
    serverPlaceholder,
    // Until hydrated, callers must use serverPlaceholder — not a locale string
    formattedValue: isHydrated ? formattedValue : null,
    isHydrated,
    refetch,
  };
  }

export interface TimestampFormatOptions {
  dateStyle?: "short" | "medium" | "long" | "full";
  timeStyle?: "short" | "medium" | "long" | "full";
  fallbackPlaceholder?: string;
}

function formatTimestamp(
  timestamp: Date | string | null | undefined,
  options: TimestampFormatOptions
): string {
  const fallbackPlaceholder = options.fallbackPlaceholder ?? "--";
  if (timestamp == null) return fallbackPlaceholder;

  try {
    const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
    if (Number.isNaN(date.getTime())) return fallbackPlaceholder;

    return new Intl.DateTimeFormat(undefined, {
      dateStyle: options.dateStyle ?? "medium",
      timeStyle: options.timeStyle ?? "short",
    }).format(date);
  } catch {
    return fallbackPlaceholder;
  }
}

/**
 * Composable hook for timestamp formatting without hydration mismatch.
 * Uses a skeleton placeholder until client-side formatting.
 */
export function useHydrationStableTimestamp(
  timestamp: Date | string | null | undefined,
  options: TimestampFormatOptions = {}
): UseHydrationStableBalanceResult {
  const [isHydrated, setIsHydrated] = useState(false);
  const [formattedValue, setFormattedValue] = useState<string | null>(null);

  useEffect(() => {
    setFormattedValue(formatTimestamp(timestamp, options));
    setIsHydrated(true);
  }, [timestamp, options]);

  const serverPlaceholder = (
    <span aria-busy="true" aria-live="polite">
      {"\u00A0"}
    </span>
  );

  const refetch = () => {
    setFormattedValue(formatTimestamp(timestamp, options));
  };

  return {
    serverPlaceholder,
    formattedValue,
    isHydrated,
    refetch,
  };
}
