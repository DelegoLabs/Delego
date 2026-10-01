/**
 * Client-side PDF and CSV invoice generator for settled orders (#776).
 *
 * Uses jspdf + jspdf-autotable to build a formatted tax invoice and
 * embeds a QR code that links to the Stellar expert explorer so buyers
 * can verify the on-chain transaction directly from the PDF.
 *
 * All monetary values are expressed in stroops (1 XLM = 10_000_000 stroops)
 * and formatted as decimal XLM in the output document.
 */

import type { jsPDF as JsPDFType } from "jspdf";
import { toCsv, downloadCsv } from "./csv";
import { downloadBlob } from "./download";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InvoiceItem {
  name: string;
  quantity: number;
  unitPriceStroops: bigint;
}

export interface InvoiceData {
  orderId: string;
  escrowId: string;
  buyerAddress: string;
  merchantName: string;
  items: InvoiceItem[];
  totalAmountStroops: bigint;
  taxAmountStroops: bigint;
  settledAt: Date;
  /** Optional Stellar transaction hash for on-chain verification. */
  stellarTxHash?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STROOPS_PER_XLM = 10_000_000n;

/** Converts stroops to a human-readable XLM string (e.g. "1.2500000 XLM"). */
export function stroopsToXlm(stroops: bigint): string {
  const whole = stroops / STROOPS_PER_XLM;
  const remainder = stroops % STROOPS_PER_XLM;
  const fraction = remainder.toString().padStart(7, "0");
  return `${whole}.${fraction} XLM`;
}

/** Produces a stable filename for the invoice PDF. */
export function invoicePdfFilename(data: Pick<InvoiceData, "orderId">): string {
  return `delego-invoice-${data.orderId}.pdf`;
}

/** Produces a stable filename for a batch CSV export. */
export function invoiceCsvFilename(): string {
  const ts = new Date().toISOString().slice(0, 10);
  return `delego-invoices-${ts}.csv`;
}

/** Stellar expert URL for a given transaction hash and network. */
export function explorerUrl(
  txHash: string,
  network: "mainnet" | "testnet" = "testnet"
): string {
  const base =
    network === "mainnet"
      ? "https://stellar.expert/explorer/public/tx"
      : "https://stellar.expert/explorer/testnet/tx";
  return `${base}/${txHash}`;
}

/**
 * Returns a data-URL PNG of a QR code pointing at `url`, resolved
 * asynchronously. Returns null if qrcode generation fails.
 */
async function qrDataUrl(url: string): Promise<string | null> {
  try {
    // Dynamic import keeps this out of the server-side bundle entirely.
    const QRCode = (await import("qrcode")).default;
    return await QRCode.toDataURL(url, {
      width: 96,
      margin: 1,
      color: { dark: "#000000", light: "#ffffff" },
    });
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// PDF generator
// ---------------------------------------------------------------------------

/**
 * Generates a formatted PDF tax invoice and triggers a browser download.
 *
 * The PDF includes:
 * - Header with merchant name, order ID, and date
 * - Buyer and escrow details
 * - Line-item table with quantities, unit prices, and subtotals
 * - Tax and total section
 * - Stellar transaction hash (if provided)
 * - QR code linking to the on-chain transaction explorer
 */
export async function generateInvoicePdf(
  data: InvoiceData,
  network: "mainnet" | "testnet" = "testnet"
): Promise<void> {
  // Dynamic imports keep jspdf and jspdf-autotable out of the initial bundle.
  const { jsPDF } = (await import("jspdf")) as { jsPDF: typeof JsPDFType };
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const marginL = 14;
  const marginR = 14;
  const pageW = doc.internal.pageSize.getWidth();
  const contentW = pageW - marginL - marginR;

  // ---- Header ----
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("TAX INVOICE", marginL, 20);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Delego — Delegated Commerce on Stellar`, marginL, 27);

  // Merchant / date block (right-aligned)
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(data.merchantName, pageW - marginR, 20, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.text(data.settledAt.toLocaleString(), pageW - marginR, 26, {
    align: "right",
  });

  doc.setDrawColor(200, 200, 200);
  doc.line(marginL, 32, pageW - marginR, 32);

  // ---- Invoice meta ----
  let y = 39;
  const col2 = marginL + contentW * 0.55;

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Order ID", marginL, y);
  doc.setFont("helvetica", "normal");
  doc.text(data.orderId, marginL + 28, y);

  doc.setFont("helvetica", "bold");
  doc.text("Escrow ID", col2, y);
  doc.setFont("helvetica", "normal");
  // Long hashes — truncate with ellipsis if needed
  const escrowDisplay =
    data.escrowId.length > 24
      ? `${data.escrowId.slice(0, 12)}…${data.escrowId.slice(-8)}`
      : data.escrowId;
  doc.text(escrowDisplay, col2 + 22, y);

  y += 7;
  doc.setFont("helvetica", "bold");
  doc.text("Buyer", marginL, y);
  doc.setFont("helvetica", "normal");
  const buyerDisplay =
    data.buyerAddress.length > 30
      ? `${data.buyerAddress.slice(0, 14)}…${data.buyerAddress.slice(-10)}`
      : data.buyerAddress;
  doc.text(buyerDisplay, marginL + 28, y);

  // ---- Line items table ----
  y += 10;

  const tableRows = data.items.map((item) => {
    const subtotal = item.unitPriceStroops * BigInt(item.quantity);
    return [
      item.name,
      item.quantity.toString(),
      stroopsToXlm(item.unitPriceStroops),
      stroopsToXlm(subtotal),
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [["Item", "Qty", "Unit price", "Subtotal"]],
    body: tableRows,
    margin: { left: marginL, right: marginR },
    headStyles: {
      fillColor: [30, 30, 30],
      textColor: 255,
      fontStyle: "bold",
      fontSize: 9,
    },
    bodyStyles: { fontSize: 9 },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { cellWidth: 18, halign: "right" },
      2: { cellWidth: 38, halign: "right" },
      3: { cellWidth: 38, halign: "right" },
    },
    theme: "striped",
  });

  // Retrieve the Y cursor after autotable finishes
  const afterTable = (doc as unknown as { lastAutoTable: { finalY: number } })
    .lastAutoTable.finalY;

  // ---- Totals block ----
  let ty = afterTable + 6;
  const totalsX = pageW - marginR - 70;
  const valX = pageW - marginR;

  const subtotalStroops = data.items.reduce(
    (sum, item) => sum + item.unitPriceStroops * BigInt(item.quantity),
    0n
  );
  const netStroops =
    data.totalAmountStroops - data.taxAmountStroops > 0n
      ? data.totalAmountStroops - data.taxAmountStroops
      : subtotalStroops;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Subtotal (excl. VAT)", totalsX, ty);
  doc.text(stroopsToXlm(netStroops), valX, ty, { align: "right" });

  ty += 6;
  doc.text("VAT / Tax", totalsX, ty);
  doc.text(stroopsToXlm(data.taxAmountStroops), valX, ty, { align: "right" });

  ty += 1;
  doc.setDrawColor(80, 80, 80);
  doc.line(totalsX, ty, valX, ty);
  ty += 5;

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Total", totalsX, ty);
  doc.text(stroopsToXlm(data.totalAmountStroops), valX, ty, {
    align: "right",
  });

  // ---- Stellar transaction hash ----
  if (data.stellarTxHash) {
    ty += 12;
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("Stellar transaction hash:", marginL, ty);
    doc.setFont("courier", "normal");
    doc.text(data.stellarTxHash, marginL, ty + 5);

    // QR code for on-chain verification
    const url = explorerUrl(data.stellarTxHash, network);
    const qr = await qrDataUrl(url);
    if (qr) {
      const qrSize = 28;
      doc.addImage(qr, "PNG", pageW - marginR - qrSize, ty - 4, qrSize, qrSize);
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 100, 100);
      doc.text("Scan to verify on-chain", pageW - marginR - qrSize, ty + qrSize - 2);
      doc.setTextColor(0, 0, 0);
    }
  }

  // ---- Footer ----
  const pageH = doc.internal.pageSize.getHeight();
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(150, 150, 150);
  doc.text(
    `Generated by Delego · ${new Date().toISOString()}`,
    pageW / 2,
    pageH - 8,
    { align: "center" }
  );
  doc.setTextColor(0, 0, 0);

  // ---- Save ----
  const filename = invoicePdfFilename(data);
  const pdfBytes = doc.output("arraybuffer");
  downloadBlob(filename, new Blob([pdfBytes], { type: "application/pdf" }));
}

// ---------------------------------------------------------------------------
// CSV batch export
// ---------------------------------------------------------------------------

/** CSV column headers for a batch invoice export. */
const CSV_HEADERS = [
  "Order ID",
  "Escrow ID",
  "Buyer",
  "Merchant",
  "Settled At",
  "Item Names",
  "Item Quantities",
  "Item Unit Prices (XLM)",
  "Subtotal (XLM)",
  "Tax (XLM)",
  "Total (XLM)",
  "Stellar Tx Hash",
];

/** Converts a single InvoiceData record to a CSV row (array of strings). */
export function invoiceDataToCsvRow(data: InvoiceData): string[] {
  const subtotal = data.items.reduce(
    (sum, item) => sum + item.unitPriceStroops * BigInt(item.quantity),
    0n
  );

  return [
    data.orderId,
    data.escrowId,
    data.buyerAddress,
    data.merchantName,
    data.settledAt.toISOString(),
    data.items.map((i) => i.name).join("; "),
    data.items.map((i) => i.quantity.toString()).join("; "),
    data.items.map((i) => stroopsToXlm(i.unitPriceStroops)).join("; "),
    stroopsToXlm(subtotal),
    stroopsToXlm(data.taxAmountStroops),
    stroopsToXlm(data.totalAmountStroops),
    data.stellarTxHash ?? "",
  ];
}

/**
 * Exports an array of invoice records as a single CSV file and triggers a
 * browser download. Suitable for accountants or expense-reporting systems.
 */
export function exportOrdersToCsv(invoices: InvoiceData[]): void {
  const rows = invoices.map(invoiceDataToCsvRow);
  const content = toCsv(CSV_HEADERS, rows);
  downloadCsv(invoiceCsvFilename(), content);
}
