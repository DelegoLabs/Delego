"use client";

/**
 * Paginated merchant payout ledger (#1011) with a UTC date filter, per-token
 * gross/fee/net totals, an accounting CSV export of the filtered range, and
 * copyable transaction hashes deep-linked to Stellar Expert.
 */

import { useEffect, useMemo, useState } from "react";
import { CopyButton } from "./wallet/CopyButton";
import { downloadCsv } from "../lib/csv";
import type { PayoutRecord } from "../lib/merchantPayouts";
import type { NetworkId } from "../lib/networks";
import {
  buildPayoutCsv,
  filterPayoutsByDate,
  formatStroopsFixed,
  payoutCsvFilename,
  payoutTotalsByToken,
  sortPayoutRows,
  stellarExpertTxUrl,
  toPayoutHistoryRow,
  type PayoutDateRange,
} from "../lib/payoutHistory";
import { truncateHash } from "../lib/proofAttachments";

export type { PayoutHistoryRow } from "../lib/payoutHistory";

export interface PayoutHistoryTableProps {
  payouts: PayoutRecord[];
  networkId: NetworkId;
  pageSize?: number;
}

const cell = { padding: "0.5rem", whiteSpace: "nowrap" } as const;
const numCell = { ...cell, fontVariantNumeric: "tabular-nums", textAlign: "right" } as const;
const inputStyle = {
  padding: "0.375rem 0.5rem",
  borderRadius: "0.375rem",
  border: "1px solid #d1d5db",
  font: "inherit",
} as const;

export function PayoutHistoryTable({
  payouts,
  networkId,
  pageSize = 20,
}: PayoutHistoryTableProps) {
  const [range, setRange] = useState<PayoutDateRange>({});
  const [page, setPage] = useState(0);

  const rows = useMemo(
    () => sortPayoutRows(payouts.map(toPayoutHistoryRow)),
    [payouts]
  );
  const filtered = useMemo(() => filterPayoutsByDate(rows, range), [rows, range]);
  const totals = useMemo(() => payoutTotalsByToken(filtered), [filtered]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice(page * pageSize, (page + 1) * pageSize);

  // A narrower date range can leave the current page past the end.
  useEffect(() => {
    if (page >= pageCount) setPage(pageCount - 1);
  }, [page, pageCount]);

  const rangeInvalid = Boolean(range.from && range.to && range.from > range.to);

  function exportCsv() {
    downloadCsv(payoutCsvFilename(range), buildPayoutCsv(filtered, networkId));
  }

  return (
    <section
      aria-labelledby="payout-history-heading"
      style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: "0.75rem",
        }}
      >
        <h2 id="payout-history-heading" style={{ margin: 0, fontSize: "1.125rem" }}>
          Payout history
        </h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "flex-end" }}>
          <label style={{ display: "flex", flexDirection: "column", fontSize: "0.75rem" }}>
            From (UTC)
            <input
              type="date"
              value={range.from ?? ""}
              onChange={(e) => {
                setRange((r) => ({ ...r, from: e.target.value || undefined }));
                setPage(0);
              }}
              style={inputStyle}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", fontSize: "0.75rem" }}>
            To (UTC)
            <input
              type="date"
              value={range.to ?? ""}
              onChange={(e) => {
                setRange((r) => ({ ...r, to: e.target.value || undefined }));
                setPage(0);
              }}
              style={inputStyle}
            />
          </label>
          <button
            type="button"
            onClick={exportCsv}
            disabled={filtered.length === 0}
            style={{
              padding: "0.4375rem 0.875rem",
              borderRadius: "0.375rem",
              border: "none",
              background: filtered.length === 0 ? "#9ca3af" : "#2563eb",
              color: "#fff",
              fontWeight: 600,
              cursor: filtered.length === 0 ? "not-allowed" : "pointer",
            }}
          >
            Export CSV
          </button>
        </div>
      </div>

      {rangeInvalid && (
        <p role="alert" style={{ margin: 0, color: "#dc2626", fontSize: "0.8125rem" }}>
          The start date is after the end date.
        </p>
      )}

      {filtered.length === 0 ? (
        <p style={{ color: "#6b7280", margin: 0 }}>
          {rows.length === 0 ? "No payouts yet." : "No payouts in this date range."}
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>
                <th scope="col" style={cell}>Payout</th>
                <th scope="col" style={cell}>Order</th>
                <th scope="col" style={cell}>Settled</th>
                <th scope="col" style={cell}>Token</th>
                <th scope="col" style={numCell}>Gross</th>
                <th scope="col" style={numCell}>Fee</th>
                <th scope="col" style={numCell}>Net payout</th>
                <th scope="col" style={cell}>Transaction</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const explorerUrl = stellarExpertTxUrl(row.txHash, networkId);
                return (
                  <tr
                    key={row.payoutId}
                    data-testid={`payout-row-${row.payoutId}`}
                    style={{ borderBottom: "1px solid #f3f4f6" }}
                  >
                    <td style={cell}>
                      <code>{row.payoutId.slice(0, 8)}</code>
                    </td>
                    <td style={cell}>
                      <code>{row.orderId.slice(0, 8)}</code>
                    </td>
                    <td style={cell}>
                      <time dateTime={row.settledAt}>
                        {new Date(row.settledAt).toLocaleString()}
                      </time>
                    </td>
                    <td style={cell}>{row.tokenSymbol}</td>
                    <td style={numCell}>{formatStroopsFixed(row.grossAmountStroops)}</td>
                    <td style={{ ...numCell, color: "#6b7280" }}>
                      −{formatStroopsFixed(row.feeDeductionStroops)}
                    </td>
                    <td style={{ ...numCell, fontWeight: 600 }}>
                      {formatStroopsFixed(row.netPayoutStroops)}
                    </td>
                    <td style={cell}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                        <code title={row.txHash}>{truncateHash(row.txHash)}</code>
                        <CopyButton value={row.txHash} label="Copy transaction hash" />
                        {explorerUrl && (
                          <a href={explorerUrl} target="_blank" rel="noopener noreferrer">
                            Stellar Expert
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              {Object.entries(totals).map(([token, t]) => (
                <tr
                  key={token}
                  data-testid={`payout-totals-${token}`}
                  style={{ borderTop: "2px solid #e5e7eb", fontWeight: 600 }}
                >
                  <th scope="row" colSpan={3} style={{ ...cell, textAlign: "left" }}>
                    Total ({t.count} payout{t.count === 1 ? "" : "s"})
                  </th>
                  <td style={cell}>{token}</td>
                  <td style={numCell}>{formatStroopsFixed(t.grossStroops)}</td>
                  <td style={{ ...numCell, color: "#6b7280" }}>
                    −{formatStroopsFixed(t.feeStroops)}
                  </td>
                  <td style={numCell}>{formatStroopsFixed(t.netStroops)}</td>
                  <td style={cell} />
                </tr>
              ))}
            </tfoot>
          </table>
        </div>
      )}

      {pageCount > 1 && (
        <nav
          aria-label="Payout history pages"
          style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
        >
          <button
            type="button"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            Previous
          </button>
          <span style={{ fontSize: "0.8125rem", color: "#6b7280" }}>
            Page {page + 1} of {pageCount}
          </span>
          <button
            type="button"
            disabled={page + 1 >= pageCount}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          >
            Next
          </button>
        </nav>
      )}
    </section>
  );
}

export default PayoutHistoryTable;
