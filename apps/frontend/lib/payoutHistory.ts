/**
 * Merchant payout history ledger (#1011): row shaping, date filtering,
 * gross/fee/net arithmetic and the accounting CSV export.
 *
 * All money math is BigInt stroops (1 unit = 10,000,000 stroops) and every
 * amount in the CSV is an exact fixed-point decimal string, so spreadsheet
 * totals reconcile to the stroop with on-chain settlement.
 */

import { toCsv } from "./csv";
import type { PayoutRecord } from "./merchantPayouts";
import type { NetworkId } from "./networks";
import { resolveProofHashExplorerUrl } from "./proofAttachments";

export interface PayoutHistoryRow {
  payoutId: string;
  orderId: string;
  settledAt: string;
  tokenSymbol: string;
  grossAmountStroops: string;
  feeDeductionStroops: string;
  netPayoutStroops: string;
  txHash: string;
}

export interface PayoutDateRange {
  /** Inclusive start date, `YYYY-MM-DD` (UTC). */
  from?: string;
  /** Inclusive end date, `YYYY-MM-DD` (UTC). */
  to?: string;
}

export interface PayoutTotals {
  grossStroops: bigint;
  feeStroops: bigint;
  netStroops: bigint;
  count: number;
}

const STROOP_DECIMALS = 7;
const DAY_MS = 86_400_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toBigInt(value: string): bigint {
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}

/** Shapes an API payout record into a ledger row; net = gross − fee. */
export function toPayoutHistoryRow(record: PayoutRecord): PayoutHistoryRow {
  const gross = toBigInt(record.amountStroops);
  const fee = toBigInt(record.feeStroops);
  return {
    payoutId: record.id,
    orderId: record.orderId ?? record.escrowId,
    settledAt: record.ledgerClosedAt,
    tokenSymbol: record.currency,
    grossAmountStroops: gross.toString(),
    feeDeductionStroops: fee.toString(),
    netPayoutStroops: (gross - fee).toString(),
    txHash: record.transactionHash,
  };
}

/** Newest first, so the table and the CSV read like a bank statement. */
export function sortPayoutRows(rows: PayoutHistoryRow[]): PayoutHistoryRow[] {
  return [...rows].sort(
    (a, b) => Date.parse(b.settledAt) - Date.parse(a.settledAt)
  );
}

/** Keeps rows settled within the inclusive UTC date range. */
export function filterPayoutsByDate(
  rows: PayoutHistoryRow[],
  range: PayoutDateRange
): PayoutHistoryRow[] {
  const from =
    range.from && DATE_RE.test(range.from)
      ? Date.parse(`${range.from}T00:00:00Z`)
      : -Infinity;
  const to =
    range.to && DATE_RE.test(range.to)
      ? Date.parse(`${range.to}T00:00:00Z`) + DAY_MS
      : Infinity;
  return rows.filter((row) => {
    const at = Date.parse(row.settledAt);
    return Number.isFinite(at) && at >= from && at < to;
  });
}

/** Gross/fee/net totals per token — amounts in different tokens never mix. */
export function payoutTotalsByToken(
  rows: PayoutHistoryRow[]
): Record<string, PayoutTotals> {
  const totals: Record<string, PayoutTotals> = {};
  for (const row of rows) {
    const t = (totals[row.tokenSymbol] ??= {
      grossStroops: 0n,
      feeStroops: 0n,
      netStroops: 0n,
      count: 0,
    });
    t.grossStroops += toBigInt(row.grossAmountStroops);
    t.feeStroops += toBigInt(row.feeDeductionStroops);
    t.netStroops += toBigInt(row.netPayoutStroops);
    t.count += 1;
  }
  return totals;
}

/** Exact fixed-point rendering: 125000000n → "12.5000000". */
export function formatStroopsFixed(stroops: bigint | string): string {
  const value = typeof stroops === "bigint" ? stroops : toBigInt(stroops);
  const negative = value < 0n;
  const digits = (negative ? -value : value)
    .toString()
    .padStart(STROOP_DECIMALS + 1, "0");
  const whole = digits.slice(0, -STROOP_DECIMALS);
  const fraction = digits.slice(-STROOP_DECIMALS);
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

/** Stellar Expert deep link for a payout transaction, or null for a bad hash. */
export function stellarExpertTxUrl(
  txHash: string,
  networkId: NetworkId
): string | null {
  return resolveProofHashExplorerUrl(txHash, networkId);
}

/**
 * Neutralises spreadsheet formula injection: a text cell starting with
 * `=`, `+`, `-`, `@`, tab or CR is prefixed with `'` so Excel/Sheets treat it
 * as text. Only applied to free-text columns — numeric amounts are emitted
 * as-is so they stay summable.
 */
function safeText(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export const PAYOUT_CSV_HEADER = [
  "Payout ID",
  "Order ID",
  "Settled At (UTC)",
  "Token",
  "Gross Amount",
  "Fee Deduction",
  "Net Payout",
  "Transaction Hash",
  "Stellar Expert URL",
];

/** Builds the accounting CSV for `rows` (one line per payout). */
export function buildPayoutCsv(
  rows: PayoutHistoryRow[],
  networkId: NetworkId
): string {
  return toCsv(
    PAYOUT_CSV_HEADER,
    rows.map((row) => {
      const at = Date.parse(row.settledAt);
      return [
        safeText(row.payoutId),
        safeText(row.orderId),
        Number.isFinite(at) ? new Date(at).toISOString() : safeText(row.settledAt),
        safeText(row.tokenSymbol),
        formatStroopsFixed(row.grossAmountStroops),
        formatStroopsFixed(row.feeDeductionStroops),
        formatStroopsFixed(row.netPayoutStroops),
        safeText(row.txHash),
        stellarExpertTxUrl(row.txHash, networkId) ?? "",
      ];
    })
  );
}

/** `delego-payouts-2026-01-01_to_2026-03-31.csv`, or `-all` without a range. */
export function payoutCsvFilename(range: PayoutDateRange): string {
  const from = range.from && DATE_RE.test(range.from) ? range.from : null;
  const to = range.to && DATE_RE.test(range.to) ? range.to : null;
  if (!from && !to) return "delego-payouts-all.csv";
  return `delego-payouts-${from ?? "start"}_to_${to ?? "today"}.csv`;
}
