/**
 * Return shipping labels generated when a dispute resolves with a return.
 *
 * Covers the printable-label flow added for #796 (carrier barcode + RMA
 * number) and the original carrier-PDF flow from #712 as an optional extra.
 */

export interface ReturnLabelData {
  /** Return Merchandise Authorization number printed on the label. */
  rmaNumber: string;
  /** Merchant return address; newline- or comma-separated. */
  returnAddress: string;
  /** Carrier barcode as an SVG document string. */
  carrierBarcodeSvg: string;
  orderId?: string;
  carrier?: string;
  trackingNumber?: string;
  /** Optional carrier-hosted PDF label for the legacy #712 preview. */
  labelPdfUrl?: string;
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

/**
 * Encodes a carrier barcode SVG as a data URL for use as an `<img>` source.
 * Returns null when the value is not a self-contained SVG or contains script
 * content, so untrusted label data can never execute in the page.
 */
export function barcodeSvgToDataUrl(svg: string): string | null {
  const trimmed = svg.trim();
  if (!trimmed.startsWith("<svg") || !trimmed.includes("</svg>")) return null;
  if (/<script[\s>]/i.test(trimmed) || /\son\w+\s*=/i.test(trimmed)) {
    return null;
  }
  if (typeof window === "undefined" || typeof window.btoa !== "function") {
    return null;
  }

  const bytes = new TextEncoder().encode(trimmed);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:image/svg+xml;base64,${window.btoa(binary)}`;
}
