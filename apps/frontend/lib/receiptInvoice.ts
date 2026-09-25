/**
 * Digital receipt / tax invoice helpers (#714).
 *
 * Money fields are stroops strings so they can be re-rendered in the user's
 * display-currency preference (see hooks/useCurrency.tsx).
 */

export interface ReceiptDetails {
  orderId: string;
  escrowId: string;
  date: string;
  buyerAddress: string;
  merchantName: string;
  items: { title: string; quantity: number; unitPrice: string; total: string }[];
  subtotal: string;
  networkFee: string;
  totalPaid: string;
  stellarTxHash: string;
}

/** Parses a stroops string, falling back to 0 for malformed input. */
export function receiptStroops(value: string): bigint {
  const trimmed = value?.trim() ?? "";
  return /^\d+$/.test(trimmed) ? BigInt(trimmed) : 0n;
}

export function invoiceFilename(receipt: ReceiptDetails): string {
  return `delego-invoice-${receipt.orderId}`;
}

/**
 * Code 39 element widths, 9 elements per symbol alternating bar/space
 * starting with a bar. "w" = wide, "n" = narrow; every symbol has exactly
 * three wide elements.
 */
const CODE39_PATTERNS: Record<string, string> = {
  "0": "nnnwwnwnn",
  "1": "wnnwnnnnw",
  "2": "nnwwnnnnw",
  "3": "wnwwnnnnn",
  "4": "nnnwwnnnw",
  "5": "wnnwwnnnn",
  "6": "nnwwwnnnn",
  "7": "nnnwnnwnw",
  "8": "wnnwnnwnn",
  "9": "nnwwnnwnn",
  A: "wnnnnwnnw",
  B: "nnwnnwnnw",
  C: "wnwnnwnnn",
  D: "nnnnwwnnw",
  E: "wnnnwwnnn",
  F: "nnwnwwnnn",
  G: "nnnnnwwnw",
  H: "wnnnnwwnn",
  I: "nnwnnwwnn",
  J: "nnnnwwwnn",
  K: "wnnnnnnww",
  L: "nnwnnnnww",
  M: "wnwnnnnwn",
  N: "nnnnwnnww",
  O: "wnnnwnnwn",
  P: "nnwnwnnwn",
  Q: "nnnnnnwww",
  R: "wnnnnnwwn",
  S: "nnwnnnwwn",
  T: "nnnnwnwwn",
  U: "wwnnnnnnw",
  V: "nwwnnnnnw",
  W: "wwwnnnnnn",
  X: "nwnnwnnnw",
  Y: "wwnnwnnnn",
  Z: "nwwnwnnnn",
  "-": "nwnnnnwnw",
  ".": "wwnnnnwnn",
  " ": "nwwnnnwnn",
  "*": "nwnnwnwnn",
};

export const CODE39_PATTERN_TABLE: Readonly<Record<string, string>> =
  CODE39_PATTERNS;

/** Upper-cases and replaces characters Code 39 cannot encode with "-". */
export function sanitizeCode39(value: string): string {
  return value
    .toUpperCase()
    .split("")
    .map((ch) => (ch !== "*" && CODE39_PATTERNS[ch] ? ch : "-"))
    .join("");
}

export interface BarcodeBar {
  /** x offset in narrow-module units */
  x: number;
  /** width in narrow-module units */
  width: number;
}

const WIDE = 3;
const NARROW = 1;

/**
 * Encodes `value` as Code 39 (with `*` start/stop) and returns the bar
 * rectangles, plus the total width, in narrow-module units — ready to render
 * as an SVG with `viewBox="0 0 {width} h"`.
 */
export function encodeCode39(value: string): { bars: BarcodeBar[]; width: number } {
  const symbols = `*${sanitizeCode39(value)}*`;
  const bars: BarcodeBar[] = [];
  let x = 0;

  symbols.split("").forEach((symbol, index) => {
    const pattern = CODE39_PATTERNS[symbol];
    for (let i = 0; i < pattern.length; i += 1) {
      const width = pattern[i] === "w" ? WIDE : NARROW;
      if (i % 2 === 0) bars.push({ x, width });
      x += width;
    }
    // Narrow inter-character gap.
    if (index < symbols.length - 1) x += NARROW;
  });

  return { bars, width: x };
}
