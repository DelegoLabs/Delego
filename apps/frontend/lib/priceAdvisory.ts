import type { PriceRangeHint } from "./approvalExplainability";

/**
 * Price advisory strip for the approval drawer (#571).
 *
 * Approvers see an item price with no frame of reference. When the payload
 * carries comparable-range hints (`OrderExplainability.priceRangeByProductId`)
 * we can summarize them into one non-blocking advisory:
 *
 *  - "within"  — every compared item sits inside its typical range (green)
 *  - "above"   — at least one item is priced above its typical-range high (amber)
 *  - "no-data" — the hint mechanism is engaged but nothing resolved (gray)
 *
 * Strictly advisory: it never blocks approval and it is never shown when the
 * payload carries no hints at all (`assessPriceAdvisory` returns `null`), so
 * the UI never fabricates a frame of reference that isn't in the data.
 */

export type PriceAdvisoryLevel = "within" | "above" | "no-data";

export interface PriceAdvisory {
  level: PriceAdvisoryLevel;
  /** Line items with a resolvable typical-range hint. */
  comparedCount: number;
  /** Of those, how many are priced above the range high. */
  aboveCount: number;
}

interface LineItemLike {
  productId?: string;
  unitPriceStroops?: bigint | string | number;
}

function toBigInt(value: bigint | string | number | undefined): bigint | null {
  if (value === undefined) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

/**
 * Summarizes per-line-item price hints into a single advisory, or `null` when
 * there are no hints to summarize (no strip should render).
 */
export function assessPriceAdvisory(
  lineItems: readonly LineItemLike[],
  priceRangeByProductId: Record<string, PriceRangeHint> | undefined
): PriceAdvisory | null {
  // No hint field on the payload ⇒ no advisory, ever.
  if (
    !priceRangeByProductId ||
    Object.keys(priceRangeByProductId).length === 0
  ) {
    return null;
  }

  let comparedCount = 0;
  let aboveCount = 0;

  for (const item of lineItems) {
    if (!item.productId) continue;
    const range = priceRangeByProductId[item.productId];
    if (!range) continue;
    const unit = toBigInt(item.unitPriceStroops);
    if (unit === null) continue;

    comparedCount += 1;
    if (unit > range.highStroops) aboveCount += 1;
  }

  if (comparedCount === 0) {
    return { level: "no-data", comparedCount: 0, aboveCount: 0 };
  }
  return {
    level: aboveCount > 0 ? "above" : "within",
    comparedCount,
    aboveCount,
  };
}

/**
 * sessionStorage key for "I've reviewed the pricing" — the amber
 * acknowledgement is remembered per session so an approver doesn't re-tick it
 * on every above-range order in the same sitting.
 */
export const PRICE_ADVISORY_ACK_KEY = "delego:approval-price-ack";

function hasSessionStorage(): boolean {
  return (
    typeof window !== "undefined" && typeof window.sessionStorage !== "undefined"
  );
}

/** Whether the approver has already acknowledged an above-range price this session. */
export function readPriceAdvisoryAck(): boolean {
  if (!hasSessionStorage()) return false;
  try {
    return window.sessionStorage.getItem(PRICE_ADVISORY_ACK_KEY) === "1";
  } catch {
    return false;
  }
}

/** Records the per-session acknowledgement. Never throws. */
export function writePriceAdvisoryAck(): void {
  if (!hasSessionStorage()) return;
  try {
    window.sessionStorage.setItem(PRICE_ADVISORY_ACK_KEY, "1");
  } catch {
    // Storage unavailable — the approver just re-ticks next time.
  }
}
