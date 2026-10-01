/**
 * Automated sales tax / VAT breakdown (#723).
 *
 * The breakdown is derived, not authoritative: Delego settles in XLM on
 * Stellar, so the tax shown here is an *estimate* computed from the order's
 * taxable base and the rate registered for the buyer's jurisdiction. Every
 * consumer of this module must present it as an estimate — see
 * `TaxBreakdownPanel`.
 *
 * Money is stroops-as-string throughout so the value survives JSON and can be
 * handed straight to `<Amount>` (which takes a bigint via `receiptStroops`).
 */

const STROOPS_PER_UNIT = 10_000_000n;

/** Basis-point denominator used when resolving a jurisdiction's default rate. */
const RATE_SCALE = 10_000n;

export interface TaxBreakdown {
  /** Taxable base in stroops (line-item subtotal; excludes the network fee). */
  subtotalStroops: string;
  /** Effective rate, e.g. 20 for 20% VAT. 0 for non-taxable goods. */
  taxRatePercent: number;
  taxAmountStroops: string;
  /** Human label for the taxing authority, e.g. "EU VAT" / "Non-taxable". */
  jurisdiction: string;
  /** subtotal + tax, in stroops. Excludes the network fee. */
  totalStroops: string;
}

/**
 * Digital goods are taxed at 0% in most jurisdictions (and are treated as
 * zero-rated for VAT in the EU), so they must not pick up the jurisdiction's
 * standard rate. Matched case-insensitively against an order's category.
 */
export const NON_TAXABLE_CATEGORIES: readonly string[] = [
  "digital",
  "digital-goods",
  "digital goods",
  "software",
  "downloads",
  "gift-cards",
  "gift cards",
];

export interface JurisdictionTaxRate {
  /** Display label, e.g. "UK VAT". */
  label: string;
  /** Default rate in basis points (1 bps = 0.01%), e.g. 2000 for 20%. */
  bps: number;
}

/**
 * Default sales tax / VAT rates by jurisdiction code. Only the codes Delego
 * needs to distinguish zero-rating from a standard rate are listed; anything
 * unlisted falls back to 0% rather than guessing a rate.
 */
export const DEFAULT_TAX_RATES: Record<string, JurisdictionTaxRate> = {
  "EU": { label: "EU VAT", bps: 2000 },
  "GB": { label: "UK VAT", bps: 2000 },
  "US-CA": { label: "US Sales Tax (CA)", bps: 725 },
  "US-NY": { label: "US Sales Tax (NY)", bps: 400 },
  "US-TX": { label: "US Sales Tax (TX)", bps: 625 },
  "NON-TAXABLE": { label: "Non-taxable", bps: 0 },
};

export const UNKNOWN_TAX_LABEL = "Tax not applicable";
export const NON_TAXABLE_LABEL = "Non-taxable digital goods";

function toStroops(value: bigint | string | number | null | undefined): bigint {
  if (value === null || value === undefined) return 0n;
  if (typeof value === "bigint") return value;
  const trimmed = String(value).trim();
  return /^\d+$/.test(trimmed) ? BigInt(trimmed) : 0n;
}

/** True when a category is a non-taxable digital good. */
export function isNonTaxableCategory(category?: string | null): boolean {
  const normalized = (category ?? "").trim().toLowerCase();
  if (!normalized) return false;
  return NON_TAXABLE_CATEGORIES.includes(normalized);
}

/**
 * Resolves the effective rate for a category in a jurisdiction. Non-taxable
 * digital goods always resolve to 0% regardless of the jurisdiction, and an
 * unknown jurisdiction resolves to 0% rather than inventing a rate.
 */
export function resolveTaxRatePercent(
  category: string | null | undefined,
  jurisdictionCode: string | null | undefined
): number {
  if (isNonTaxableCategory(category)) return 0;
  const entry = DEFAULT_TAX_RATES[(jurisdictionCode ?? "").trim().toUpperCase()];
  if (!entry) return 0;
  // 1 bps = 0.01%, so 2000 bps = 20%.
  return entry.bps / 100;
}

/** "20" → "20%", "7.25" → "7.25%", "0" → "0%". */
export function formatTaxRate(percent: number): string {
  return `${Number.isInteger(percent) ? percent : Number(percent.toFixed(2))}%`;
}

/** Human label for the taxing authority shown in the breakdown. */
export function resolveJurisdictionLabel(
  category: string | null | undefined,
  jurisdictionCode: string | null | undefined
): string {
  if (isNonTaxableCategory(category)) return NON_TAXABLE_LABEL;
  const entry = DEFAULT_TAX_RATES[(jurisdictionCode ?? "").trim().toUpperCase()];
  return entry?.label ?? UNKNOWN_TAX_LABEL;
}

export interface TaxBreakdownInput {
  /** Sum of line items in stroops — the taxable base. */
  subtotalStroops: bigint | string | number;
  /** Stellar network fee in stroops. Excluded from the taxable base. */
  networkFeeStroops?: bigint | string | number;
  category?: string | null;
  jurisdictionCode?: string | null;
  /** Overrides the jurisdiction default when supplied. */
  taxRatePercent?: number;
}

/**
 * Builds the order-level tax breakdown.
 *
 * The network fee is deliberately excluded from the taxable base — it is a
 * cost of moving the payment, not part of the consideration for the goods —
 * and is reported separately by the caller. Tax is rounded half-up to the
 * nearest stroop so the displayed total always reconciles exactly.
 */
export function computeTaxBreakdown(input: TaxBreakdownInput): TaxBreakdown {
  const subtotal = toStroops(input.subtotalStroops);
  const ratePercent =
    input.taxRatePercent !== undefined
      ? input.taxRatePercent
      : resolveTaxRatePercent(input.category, input.jurisdictionCode);

  // Half-up on the exact rational: (subtotal * bps) / 10_000, +1/2, floor.
  // 20% → 2000 bps → 1_000_000_000 * 2000 / 10_000 = 200_000_000 stroops.
  const bps = BigInt(Math.round(Math.max(0, ratePercent) * 100));
  const tax = (subtotal * bps + RATE_SCALE / 2n) / RATE_SCALE;

  return {
    subtotalStroops: subtotal.toString(),
    taxRatePercent: ratePercent,
    taxAmountStroops: tax.toString(),
    jurisdiction: resolveJurisdictionLabel(input.category, input.jurisdictionCode),
    totalStroops: (subtotal + tax).toString(),
  };
}

/** True when the breakdown is zero-rated (no tax charged). */
export function isZeroRated(breakdown: TaxBreakdown): boolean {
  return breakdown.taxRatePercent === 0;
}

/** Sum of a list of breakdowns — the tax total for a whole exported report. */
export function sumTaxAmounts(breakdowns: TaxBreakdown[]): bigint {
  return breakdowns.reduce(
    (sum, breakdown) => sum + toStroops(breakdown.taxAmountStroops),
    0n
  );
}

/** XLM value of a stroops string, for the 0.00 style copy under each line. */
export function taxStroopsToAmountString(value: string): string {
  const stroops = toStroops(value);
  const whole = stroops / STROOPS_PER_UNIT;
  const fraction = (stroops % STROOPS_PER_UNIT).toString().padStart(7, "0");
  const trimmed = fraction.replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole.toString();
}
