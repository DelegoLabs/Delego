"use client";

import Link from "next/link";
import { Amount, Badge } from "@delegolabs/ui";
import { useCurrency } from "../../hooks/useCurrency";
import type { ApprovalDecisionRecord } from "../../lib/approvals";

export interface ApprovalHistoryTableProps {
  records: ApprovalDecisionRecord[];
}

function formatDecidedAt(date: Date): string {
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** Read-only table of decided approvals. Empty state is handled by the caller. */
export function ApprovalHistoryTable({ records }: ApprovalHistoryTableProps) {
  const { currencyId, rate } = useCurrency();

  return (
    <div className="comparison-table-wrapper">
      <table className="comparison-table order-table">
        <thead>
          <tr>
            <th scope="col">Order</th>
            <th scope="col">Item</th>
            <th scope="col">Merchant</th>
            <th scope="col">Amount</th>
            <th scope="col">Decision</th>
            <th scope="col">Reason</th>
            <th scope="col">Decided</th>
            <th scope="col">Agent</th>
            <th scope="col">Delegation</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.orderId}>
              <td>
                <Link
                  href={`/orders/${record.orderId}`}
                  className="order-id"
                  title={`View receipt for ${record.orderId}`}
                >
                  {record.orderId}
                </Link>
              </td>
              <td>{record.item}</td>
              <td>{record.merchantId || "—"}</td>
              <td className="order-amount">
                <Amount
                  stroops={record.amountStroops}
                  currency={currencyId}
                  xlmUsdRate={rate?.xlmUsdRate}
                />
              </td>
              <td>
                <Badge
                  tone={record.decision === "approved" ? "success" : "error"}
                >
                  {record.decision === "approved" ? "Approved" : "Rejected"}
                </Badge>
              </td>
              <td>{record.reason || "—"}</td>
              <td>
                <time dateTime={record.decidedAt.toISOString()}>
                  {formatDecidedAt(record.decidedAt)}
                </time>
              </td>
              <td>{record.agentId || "—"}</td>
              <td>{record.delegationId}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
