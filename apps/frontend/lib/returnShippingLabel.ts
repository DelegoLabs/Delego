/**
 * Merchant-issued return shipping labels (#1009).
 *
 * The merchant fills in a `ReturnLabelConfig` from the order dispute flow;
 * this module validates it, renders a 4×6in printable PDF (carrier mark,
 * ship-from buyer, ship-to merchant hub, Code 128 tracking barcode) with
 * jsPDF, and hands the PDF to the API so it can be emailed to the buyer.
 *
 * The buyer is only known by Stellar address on the client, so emailing goes
 * through the backend, which resolves the buyer's contact details itself.
 */

import type { jsPDF as JsPDFType } from "jspdf";
import { createRetryingFetch } from "./api";
import {
  CODE128_QUIET_ZONE,
  code128Bars,
  encodeCode128,
  isCode128Encodable,
} from "./code128";
import { env } from "./env";
import { returnAddressLines } from "./returnLabel";

export interface ReturnLabelConfig {
  orderId: string;
  buyerAddress: string;
  merchantHubAddress: string;
  trackingNumber: string;
  carrier: "fedex" | "dhl" | "usps";
}

export type ReturnLabelCarrier = ReturnLabelConfig["carrier"];

export interface CarrierMeta {
  name: string;
  /** Service line printed under the carrier mark. */
  service: string;
  /** Brand-ish accent used for the carrier mark band. */
  color: string;
  textColor: string;
}

export const CARRIERS: Record<ReturnLabelCarrier, CarrierMeta> = {
  fedex: { name: "FedEx", service: "Ground Return", color: "#4d148c", textColor: "#ffffff" },
  dhl: { name: "DHL", service: "Express Return", color: "#ffcc00", textColor: "#d40511" },
  usps: { name: "USPS", service: "Ground Advantage Return", color: "#333366", textColor: "#ffffff" },
};

export const RETURN_LABEL_CARRIERS = Object.keys(CARRIERS) as ReturnLabelCarrier[];

export type ReturnLabelErrors = Partial<Record<keyof ReturnLabelConfig, string>>;

/** Normalises a tracking number for printing/encoding: upper-case, no spaces. */
export function normalizeTrackingNumber(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

export function validateReturnLabelConfig(
  config: ReturnLabelConfig
): ReturnLabelErrors {
  const errors: ReturnLabelErrors = {};
  if (!config.orderId.trim()) errors.orderId = "Order is required.";
  if (returnAddressLines(config.buyerAddress).length === 0) {
    errors.buyerAddress = "Buyer (ship-from) address is required.";
  }
  if (returnAddressLines(config.merchantHubAddress).length < 2) {
    errors.merchantHubAddress =
      "Enter the full return hub address (street, city, postcode…).";
  }
  const tracking = normalizeTrackingNumber(config.trackingNumber);
  if (!tracking) {
    errors.trackingNumber = "Tracking number is required.";
  } else if (!isCode128Encodable(tracking) || tracking.length > 40) {
    errors.trackingNumber =
      "Tracking number may only contain letters, digits and symbols (max 40).";
  }
  if (!(config.carrier in CARRIERS)) errors.carrier = "Choose a carrier.";
  return errors;
}

export function returnLabelFilename(config: ReturnLabelConfig): string {
  const safeOrder = config.orderId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32);
  return `return-label-${safeOrder || "order"}.pdf`;
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

/** 4×6in thermal label, in points. */
export const LABEL_WIDTH_PT = 288;
export const LABEL_HEIGHT_PT = 432;
const MARGIN = 14;

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/**
 * Draws the label onto `doc`. Split from `generateReturnLabelPdf` so tests
 * can assert on a jsPDF instance directly.
 */
export function drawReturnLabel(doc: JsPDFType, config: ReturnLabelConfig): void {
  const carrier = CARRIERS[config.carrier];
  const tracking = normalizeTrackingNumber(config.trackingNumber);
  const contentWidth = LABEL_WIDTH_PT - MARGIN * 2;
  let y = MARGIN;

  // Carrier mark band.
  doc.setFillColor(...hexToRgb(carrier.color));
  doc.rect(MARGIN, y, contentWidth, 40, "F");
  doc.setTextColor(...hexToRgb(carrier.textColor));
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text(carrier.name, MARGIN + 10, y + 27);
  doc.setFontSize(9);
  doc.text(carrier.service.toUpperCase(), LABEL_WIDTH_PT - MARGIN - 10, y + 25, {
    align: "right",
  });
  y += 52;

  doc.setTextColor(0, 0, 0);

  // Ship from (buyer).
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text("FROM (BUYER)", MARGIN, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  y += 11;
  for (const line of returnAddressLines(config.buyerAddress).slice(0, 4)) {
    doc.text(line, MARGIN, y, { maxWidth: contentWidth });
    y += 11;
  }
  y += 6;
  doc.setLineWidth(1);
  doc.line(MARGIN, y, LABEL_WIDTH_PT - MARGIN, y);
  y += 16;

  // Ship to (merchant return hub) — the largest text on the label.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("SHIP TO — MERCHANT RETURN HUB", MARGIN, y);
  doc.setFontSize(13);
  y += 16;
  for (const line of returnAddressLines(config.merchantHubAddress).slice(0, 5)) {
    doc.text(line, MARGIN, y, { maxWidth: contentWidth });
    y += 16;
  }
  y += 4;
  doc.setLineWidth(2);
  doc.line(MARGIN, y, LABEL_WIDTH_PT - MARGIN, y);
  y += 14;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`TRACKING # (${carrier.name})`, LABEL_WIDTH_PT / 2, y, {
    align: "center",
  });
  y += 8;

  // Code 128 tracking barcode, scaled to the label width.
  const encoding = encodeCode128(tracking);
  const modules = encoding.totalModules + CODE128_QUIET_ZONE * 2;
  const moduleWidth = contentWidth / modules;
  const barHeight = 80;
  doc.setFillColor(0, 0, 0);
  for (const bar of code128Bars(encoding)) {
    doc.rect(MARGIN + bar.x * moduleWidth, y, bar.width * moduleWidth, barHeight, "F");
  }
  y += barHeight + 14;
  doc.setFont("courier", "bold");
  doc.setFontSize(12);
  doc.text(tracking, LABEL_WIDTH_PT / 2, y, { align: "center" });

  // Footer: order reference.
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`Order ${config.orderId}`, MARGIN, LABEL_HEIGHT_PT - MARGIN);
  doc.text("RETURN — Delego", LABEL_WIDTH_PT - MARGIN, LABEL_HEIGHT_PT - MARGIN, {
    align: "right",
  });
}

/** Renders the label to a PDF Blob. jsPDF is loaded on demand. */
export async function generateReturnLabelPdf(
  config: ReturnLabelConfig
): Promise<Blob> {
  const errors = validateReturnLabelConfig(config);
  const first = Object.values(errors)[0];
  if (first) throw new Error(first);

  const { jsPDF } = (await import("jspdf")) as { jsPDF: typeof JsPDFType };
  const doc = new jsPDF({
    unit: "pt",
    format: [LABEL_WIDTH_PT, LABEL_HEIGHT_PT],
    orientation: "portrait",
  });
  doc.setProperties({
    title: `Return label — order ${config.orderId}`,
    subject: "Return shipping label",
    creator: "Delego",
  });
  drawReturnLabel(doc, config);
  return doc.output("blob");
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

const retryingFetch = createRetryingFetch();

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read label."));
    reader.readAsDataURL(blob);
  });
}

/**
 * Emails the generated label to the order's buyer. There is no SDK method
 * for this yet, so it calls the REST endpoint directly (same pattern as
 * `lib/merchantPayouts.ts`).
 */
export async function emailReturnLabelToBuyer(
  config: ReturnLabelConfig,
  pdf: Blob
): Promise<void> {
  const res = await retryingFetch(
    `${env.NEXT_PUBLIC_API_URL}/merchant/orders/${encodeURIComponent(
      config.orderId
    )}/return-label/email`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        carrier: config.carrier,
        trackingNumber: normalizeTrackingNumber(config.trackingNumber),
        merchantHubAddress: config.merchantHubAddress,
        filename: returnLabelFilename(config),
        labelPdfBase64: await blobToBase64(pdf),
      }),
    }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? `Could not email the label (${res.status}).`);
  }
}
