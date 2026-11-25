import type { jsPDF as JsPDFType } from "jspdf";
import { downloadBlob } from "./download";
import { formatXlm } from "./orders";
import {
  expenseReportFilename,
  type ExpenseReport,
} from "./expenseReportBuilder";

function formatReportDate(date: string): string {
  return new Date(date).toLocaleDateString();
}

/**
 * Generates and downloads a formatted expense report PDF.
 * PDF dependencies are loaded on demand to keep them out of the initial page
 * bundle.
 */
export async function generateExpenseReportPdf(
  report: ExpenseReport,
  now: Date = new Date()
): Promise<void> {
  const { jsPDF } = (await import("jspdf")) as { jsPDF: typeof JsPDFType };
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const margin = 14;
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("Expense Report", margin, 20);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(
    `Date range: ${formatReportDate(report.startDate)} - ${formatReportDate(report.endDate)}`,
    margin,
    28
  );
  doc.text(
    `Generated: ${now.toLocaleString()}`,
    pageWidth - margin,
    20,
    { align: "right" }
  );
  doc.text(
    `Orders: ${report.orderCount}    Total: ${formatXlm(report.totalStroops)} XLM`,
    margin,
    35
  );
  const categories = report.categories.length
    ? report.categories.join(", ")
    : "All";
  const merchants = report.merchants.length
    ? report.merchants.join(", ")
    : "All";
  const filterSummary = doc.splitTextToSize(
    `Categories: ${categories}    Merchants: ${merchants}`,
    pageWidth - margin * 2
  );
  doc.text(filterSummary, margin, 42);

  const dividerY = 42 + filterSummary.length * 4 + 2;
  doc.setDrawColor(203, 213, 225);
  doc.line(margin, dividerY, pageWidth - margin, dividerY);

  autoTable(doc, {
    startY: dividerY + 5,
    head: [
      ["Order", "Date", "Merchant", "Category", "Status", "Amount (XLM)"],
    ],
    body: report.rows.map((row) => [
      row.orderId,
      new Date(row.date).toLocaleDateString(),
      row.merchantId,
      row.category,
      row.status,
      formatXlm(BigInt(row.amountStroops)),
    ]),
    theme: "striped",
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: "bold",
    },
    styles: { fontSize: 8, cellPadding: 3, overflow: "linebreak" },
    columnStyles: {
      0: { cellWidth: 42 },
      1: { cellWidth: 27 },
      2: { cellWidth: 58 },
      3: { cellWidth: 42 },
      4: { cellWidth: 32 },
      5: { cellWidth: 36, halign: "right" },
    },
    margin: { left: margin, right: margin },
  });

  downloadBlob(expenseReportFilename(report, "pdf", now), doc.output("blob"));
}
