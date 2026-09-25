/**
 * Return shipping labels generated when a dispute resolves with a return (#712).
 */

export interface ReturnLabelData {
  orderId: string;
  carrier: string;
  trackingNumber: string;
  labelPdfUrl: string;
  returnAddress: string;
}

/** Splits a comma- or newline-separated address into printable lines. */
export function returnAddressLines(address: string): string[] {
  return address
    .split(/\r?\n|,/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Only http(s) and blob URLs are embedded, so a label URL can't run script. */
export function isEmbeddableLabelUrl(url: string): boolean {
  try {
    const parsed = new URL(url, "http://localhost");
    return ["http:", "https:", "blob:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}
