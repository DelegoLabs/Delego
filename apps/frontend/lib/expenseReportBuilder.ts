import type { Order } from "@delegolabs/types";
import { toCsv } from "./csv";

/**
 * Custom expense reports for corporate buyers (#793): filter orders by date
 * range, category, and merchant, then export the rows as CSV or JSON. All
 * computation is client-side from the orders already loaded via useOrders,
 * so no new endpoint is required.
 */

export interface ExpenseReportFilter {
  startDate: Date;
  endDate: Date;
  categories: string[];
  format: "csv" | "json";
  /** Optional merchant restriction; omitted/empty means all merchants. */
  merchants?: string[];
}

export interface ExpenseReportRow {
  orderId: string;
  date: string;
  merchantId: string;
  category: string;
  status: string;
  amountStroops: string;
}

export interface ExpenseReport {
  startDate: string;
  endDate: string;
  format: "csv" | "json";
  categories: string[];
  merchants: string[];
  rows: ExpenseReportRow[];
  totalStroops: bigint;
  orderCount: number;
}

/** Category used when an order doesn't carry a category of its own. */
export const UNCATEGORIZED = "Uncategorized";

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * Resolves an order's category. Orders don't have a first-class category
 * field today, so fall back to the first line item's category and, failing
 * that, to `Uncategorized`.
 */
export function orderCategory(order: Order): string {
  const candidate = (order as { category?: unknown }).category;
  if (typeof candidate === "string" && candidate.trim()) {
    return candidate.trim();
  }
  const lineItems = (order as { lineItems?: unknown }).lineItems;
  if (Array.isArray(lineItems)) {
    for (const item of lineItems) {
      const category = (item as { category?: unknown })?.category;
      if (typeof category === "string" && category.trim()) {
        return category.trim();
      }
    }
  }
  return UNCATEGORIZED;
}

/** Merchant identifier shown in the report and used for merchant filtering. */
export function orderMerchant(order: Order): string {
  const order2 = order as { merchantId?: unknown; merchantName?: unknown };
  if (typeof order2.merchantId === "string" && order2.merchantId) {
    return order2.merchantId;
  }
  if (typeof order2.merchantName === "string" && order2.merchantName) {
    return order2.merchantName;
  }
  return "Unknown merchant";
}

function uniqueSorted(values: Iterable<string>): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

/** Distinct categories present in the order list, for the filter UI. */
export function availableCategories(orders: Order[]): string[] {
  return uniqueSorted(orders.map(orderCategory));
}

/** Distinct merchants present in the order list, for the filter UI. */
export function availableMerchants(orders: Order[]): string[] {
  return uniqueSorted(orders.map(orderMerchant));
}

/**
 * Filters orders into an expense report. Date bounds are inclusive of the
 * whole start/end days; empty category/merchant selections mean "all".
 */
export function buildExpenseReport(
  orders: Order[],
  filter: ExpenseReportFilter
): ExpenseReport {
  const rangeStart = startOfDay(filter.startDate).getTime();
  const rangeEnd = endOfDay(filter.endDate).getTime();
  const categories = new Set(filter.categories);
  const merchants = new Set(filter.merchants ?? []);

  const rows: ExpenseReportRow[] = orders
    .filter((order) => {
      const createdAt = new Date(order.createdAt).getTime();
      if (
        Number.isNaN(createdAt) ||
        createdAt < rangeStart ||
        createdAt > rangeEnd
      ) {
        return false;
      }
      if (categories.size > 0 && !categories.has(orderCategory(order))) {
        return false;
      }
      if (merchants.size > 0 && !merchants.has(orderMerchant(order))) {
        return false;
      }
      return true;
    })
    .map((order) => ({
      orderId: order.id,
      date: new Date(order.createdAt).toISOString(),
      merchantId: orderMerchant(order),
      category: orderCategory(order),
      status: order.status,
      amountStroops: BigInt(order.totalStroops ?? 0).toString(),
    }))
    .sort((a, b) => b.date.localeCompare(a.date));

  const totalStroops = rows.reduce(
    (sum, row) => sum + BigInt(row.amountStroops),
    0n
  );

  return {
    startDate: startOfDay(filter.startDate).toISOString(),
    endDate: endOfDay(filter.endDate).toISOString(),
    format: filter.format,
    categories: uniqueSorted(categories),
    merchants: uniqueSorted(merchants),
    rows,
    totalStroops,
    orderCount: rows.length,
  };
}

/** Serializes a report as an RFC 4180 CSV document. */
export function expenseReportToCsv(report: ExpenseReport): string {
  const header = [
    "Order",
    "Date",
    "Merchant",
    "Category",
    "Status",
    "Amount (stroops)",
  ];
  const rows = report.rows.map((row) => [
    row.orderId,
    row.date,
    row.merchantId,
    row.category,
    row.status,
    row.amountStroops,
  ]);
  return toCsv(header, rows);
}

/** Serializes a report as JSON (stroops as strings to preserve precision). */
export function expenseReportToJson(report: ExpenseReport): string {
  return JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      startDate: report.startDate,
      endDate: report.endDate,
      categories: report.categories,
      merchants: report.merchants,
      totalStroops: report.totalStroops.toString(),
      orderCount: report.orderCount,
      rows: report.rows,
    },
    null,
    2
  );
}

/** Suggested download filename, e.g. `delego-expense-report-2026-01-31.csv`. */
export function expenseReportFilename(
  report: ExpenseReport,
  format: "csv" | "json" = report.format,
  now: Date = new Date()
): string {
  const stamp = now.toISOString().slice(0, 10);
  return `delego-expense-report-${stamp}.${format}`;
}
