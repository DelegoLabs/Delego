/**
 * Merchant quote comparison helpers (#685). Amounts are stroops strings on the
 * wire and bigint in the math.
 */

export interface MerchantQuote {
  merchantId: string;
  merchantName: string;
  itemPriceStroops: string;
  shippingPriceStroops: string;
  estimatedDeliveryDays: number;
  reputationScore: number;
  contractEscrowSupported: boolean;
}

export type QuoteSortKey = "totalCost" | "speed" | "reputation";

function parseStroops(value: string): bigint {
  const trimmed = value.trim();
  return /^\d+$/.test(trimmed) ? BigInt(trimmed) : 0n;
}

export function totalCostStroops(quote: MerchantQuote): bigint {
  return (
    parseStroops(quote.itemPriceStroops) +
    parseStroops(quote.shippingPriceStroops)
  );
}

function compareBigint(a: bigint, b: bigint): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Returns a new array ordered best-first for the chosen key: cheapest total,
 * fastest delivery, or highest reputation. Ties fall back to total cost, then
 * merchant name, so the order is stable across renders.
 */
export function sortQuotes(
  quotes: MerchantQuote[],
  key: QuoteSortKey
): MerchantQuote[] {
  return [...quotes].sort((a, b) => {
    let primary = 0;
    if (key === "totalCost")
      primary = compareBigint(totalCostStroops(a), totalCostStroops(b));
    else if (key === "speed")
      primary = a.estimatedDeliveryDays - b.estimatedDeliveryDays;
    else primary = b.reputationScore - a.reputationScore;
    if (primary !== 0) return primary;
    const cost = compareBigint(totalCostStroops(a), totalCostStroops(b));
    return cost !== 0 ? cost : a.merchantName.localeCompare(b.merchantName);
  });
}

/** Scales `value` into 0..1 within [min, max]; 1 is best. A zero range scores 1. */
function normalize(
  value: number,
  min: number,
  max: number,
  higherIsBetter: boolean
): number {
  if (max === min) return 1;
  const ratio = (value - min) / (max - min);
  return higherIsBetter ? ratio : 1 - ratio;
}

/** Weights for the best-value score; total cost dominates. */
export const BEST_VALUE_WEIGHTS = {
  cost: 0.5,
  speed: 0.2,
  reputation: 0.3,
} as const;

/**
 * Picks the agent's recommended best-value quote: a weighted blend of total
 * cost, delivery speed and reputation, each normalized across the quote set.
 * Quotes that support contract escrow win ties. Returns null for no quotes.
 */
export function pickBestValueQuote(
  quotes: MerchantQuote[]
): MerchantQuote | null {
  if (quotes.length === 0) return null;

  // Costs can exceed Number.MAX_SAFE_INTEGER only for absurd prices; the
  // normalized ratio is all that matters here.
  const costs = quotes.map((q) => Number(totalCostStroops(q)));
  const days = quotes.map((q) => q.estimatedDeliveryDays);
  const reps = quotes.map((q) => q.reputationScore);
  const [minCost, maxCost] = [Math.min(...costs), Math.max(...costs)];
  const [minDays, maxDays] = [Math.min(...days), Math.max(...days)];
  const [minRep, maxRep] = [Math.min(...reps), Math.max(...reps)];

  let best: MerchantQuote | null = null;
  let bestScore = -Infinity;
  quotes.forEach((q, i) => {
    const score =
      BEST_VALUE_WEIGHTS.cost * normalize(costs[i], minCost, maxCost, false) +
      BEST_VALUE_WEIGHTS.speed * normalize(days[i], minDays, maxDays, false) +
      BEST_VALUE_WEIGHTS.reputation * normalize(reps[i], minRep, maxRep, true);
    const beatsTie =
      Math.abs(score - bestScore) < 1e-9 &&
      q.contractEscrowSupported &&
      !best?.contractEscrowSupported;
    if (score > bestScore + 1e-9 || beatsTie) {
      best = q;
      bestScore = score;
    }
  });
  return best;
}
