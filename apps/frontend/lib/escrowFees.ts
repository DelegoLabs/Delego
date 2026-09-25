/**
 * Fee-transparency helpers for escrow detail and receipts (Issue 2).
 *
 * Provides a shared `computeEscrowFeeBreakdown` function that converts
 * raw fee-config data into a structured breakdown:  gross → fee lines →
 * net proceeds. Amounts are in stroops (bigint) throughout; formatting
 * is handled at the call site via `formatAmount` / `<Amount>`.
 *
 * Key invariant: when fee config data is absent, line amounts are
 * represented as `null` rather than zero, so callers can render "—" and
 * avoid false precision. Tests assert this invariant directly.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * A single treasury destination that receives a portion of the fee.
 * If only `bps` is known and `fixedStroops` is absent, the fee is
 * dynamic (computed on-chain) and we can only show an estimate.
 */
export interface TreasuryFeeConfig {
  /** Treasury address (may be shortened for display). */
  address: string;
  /** Human label, e.g. "Protocol treasury", "Agent commission". */
  label: string;
  /** Basis points (1 bps = 0.01%). Present when static rate is known. */
  bps?: number;
  /** Fixed amount in stroops. Present when fee is a flat amount. */
  fixedStroops?: bigint;
}

/**
 * Single resolved fee line in a breakdown.
 * `amount` is null when the fee config data is missing — callers must
 * render "—" in that case.
 */
export interface FeeBreakdownLine {
  label: string;
  /** Stroops amount, or null if config was absent. */
  amount: bigint | null;
  /** Basis points, for "X%" display alongside the amount. */
  bps?: number;
  /** True when this is an on-chain computed estimate, not a known static value. */
  isEstimate: boolean;
}

export interface EscrowFeeBreakdown {
  /** Gross amount locked in the escrow. */
  grossStroops: bigint;
  /**
   * Total fee in stroops. Null when no fee config is available.
   * Distinct from zero — zero means "free", null means "unknown".
   */
  totalFeeStroops: bigint | null;
  /**
   * Net proceeds after fees. Null when totalFeeStroops is null.
   */
  netStroops: bigint | null;
  /** Per-treasury breakdown lines. Empty array when no config is available. */
  lines: FeeBreakdownLine[];
  /** True when any line uses estimated (dynamic) fee amounts. */
  hasEstimate: boolean;
  /** True when the entire fee section should be hidden (no config at all). */
  configAbsent: boolean;
}

// ─── Computation ─────────────────────────────────────────────────────────────

/**
 * Resolves the fee amount for a single treasury entry given the gross amount.
 * Returns null when neither bps nor fixedStroops is present (config absent).
 */
function resolveTreasuryFee(
  config: TreasuryFeeConfig,
  grossStroops: bigint
): { amount: bigint | null; isEstimate: boolean } {
  if (config.fixedStroops !== undefined) {
    return { amount: config.fixedStroops, isEstimate: false };
  }
  if (config.bps !== undefined) {
    // Static rate: compute exactly.
    const amount = (grossStroops * BigInt(config.bps)) / 10_000n;
    return { amount, isEstimate: false };
  }
  // Neither field present — dynamic on-chain computation.
  return { amount: null, isEstimate: true };
}

/**
 * Builds the full fee breakdown for one escrow.
 *
 * @param grossStroops  Amount locked in the escrow contract.
 * @param treasuries    Array of fee config entries. Empty array or null/undefined
 *                      means "no fee configuration available" → configAbsent: true.
 */
export function computeEscrowFeeBreakdown(
  grossStroops: bigint,
  treasuries: TreasuryFeeConfig[] | null | undefined
): EscrowFeeBreakdown {
  // No config at all — return all-null and let the UI render "—".
  if (!treasuries || treasuries.length === 0) {
    return {
      grossStroops,
      totalFeeStroops: null,
      netStroops: null,
      lines: [],
      hasEstimate: false,
      configAbsent: true,
    };
  }

  const lines: FeeBreakdownLine[] = [];
  let totalFee: bigint | null = 0n;
  let hasEstimate = false;

  for (const t of treasuries) {
    const { amount, isEstimate } = resolveTreasuryFee(t, grossStroops);
    if (isEstimate) hasEstimate = true;
    if (amount === null) {
      // Any unknown line makes the total unknown.
      totalFee = null;
    } else if (totalFee !== null) {
      totalFee += amount;
    }
    lines.push({ label: t.label, amount, bps: t.bps, isEstimate });
  }

  const netStroops =
    totalFee !== null ? grossStroops - totalFee : null;

  return {
    grossStroops,
    totalFeeStroops: totalFee,
    netStroops,
    lines,
    hasEstimate,
    configAbsent: false,
  };
}

// ─── Formatting helpers ──────────────────────────────────────────────────────

/** Formats a basis-points value as a percentage string, e.g. 50 bps → "0.5%". */
export function formatBps(bps: number): string {
  const pct = bps / 100;
  // Show up to 2 decimal places, but trim trailing zeros.
  return `${parseFloat(pct.toFixed(2))}%`;
}
