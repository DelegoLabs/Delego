"use client";

import { useCallback } from "react";
import { Badge, Button, Card } from "@delegolabs/ui";
import type { PendingApprovalItem } from "../../hooks/usePendingApprovals";
import { formatXlm } from "../../lib/orders";

// ─── helpers ────────────────────────────────────────────────────────────────

/** Shorten a Stellar address or user ID to a readable prefix. */
function shortenAddress(value: string, length = 8): string {
  if (value.length <= length + 3) return value;
  return `${value.slice(0, length)}…`;
}

/** Returns "Expired" when now >= expiresAt, otherwise "Xd Yh" remaining. */
function formatExpiry(expiresAt: Date, now: Date): string {
  const remainingMs = expiresAt.getTime() - now.getTime();
  if (remainingMs <= 0) return "Expired";
  const totalMinutes = Math.floor(remainingMs / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function expiryTone(
  expiresAt: Date,
  now: Date
): "error" | "warning" | "neutral" {
  const remainingMs = expiresAt.getTime() - now.getTime();
  if (remainingMs <= 0) return "error";
  const remainingHours = remainingMs / 3_600_000;
  if (remainingHours < 4) return "warning";
  return "neutral";
}

// ─── row ────────────────────────────────────────────────────────────────────

interface ApprovalRowProps {
  item: PendingApprovalItem;
  pending: boolean;
  now: Date;
  onApprove: (item: PendingApprovalItem) => void;
  onReject: (item: PendingApprovalItem) => void;
}

function ApprovalRow({
  item,
  pending,
  now,
  onApprove,
  onReject,
}: ApprovalRowProps) {
  const expiry = formatExpiry(item.expiresAt, now);
  const tone = expiryTone(item.expiresAt, now);
  const xlmAmount = formatXlm(item.amountStroops);

  return (
    <li
      className="approval-row"
      data-testid={`approval-row-${item.orderId}`}
      aria-label={`Pending approval for order ${item.orderId}`}
    >
      <div className="approval-row-details">
        <span className="approval-row-id" data-testid="approval-order-id">
          <strong>Order</strong> {shortenAddress(item.orderId, 8)}
        </span>
        <span
          className="approval-row-amount"
          data-testid="approval-amount"
        >
          {xlmAmount} XLM
        </span>
        <span
          className="approval-row-recipient"
          data-testid="approval-recipient"
        >
          To: {shortenAddress(item.recipient, 12)}
        </span>
        <span
          className="approval-row-requested-by"
          data-testid="approval-requested-by"
        >
          By: {shortenAddress(item.requestedBy, 12)}
        </span>
        <Badge tone={tone} data-testid="approval-expiry-badge">
          Expires: {expiry}
        </Badge>
      </div>
      <div className="approval-row-actions">
        <Button
          variant="primary"
          onClick={() => onApprove(item)}
          disabled={pending}
          ariaLabel={`Approve order ${item.orderId}`}
          data-testid={`btn-approve-${item.orderId}`}
        >
          {pending ? "…" : "✓ Approve & Sign"}
        </Button>
        <Button
          variant="ghost"
          onClick={() => onReject(item)}
          disabled={pending}
          ariaLabel={`Reject order ${item.orderId}`}
          data-testid={`btn-reject-${item.orderId}`}
        >
          ✕ Reject
        </Button>
      </div>
    </li>
  );
}

// ─── main component ──────────────────────────────────────────────────────────

export interface MultiSigApprovalQueueProps {
  /** The full list of items requiring a secondary signature. */
  items: PendingApprovalItem[];
  /** Order IDs with an in-flight mutation — the row buttons are disabled. */
  pendingIds: Set<string>;
  /** True while the first fetch is loading. */
  loading?: boolean;
  /** Non-null when a fetch error has occurred. */
  error?: string | null;
  /**
   * The wallet address of the currently connected user.
   * Passed through to the parent's approve/reject handlers via `onApprove` / `onReject`.
   */
  approverAddress?: string | null;
  /** Called when the user clicks "Approve & Sign" on a row. */
  onApprove: (item: PendingApprovalItem, approverAddress: string) => void;
  /** Called when the user clicks "Reject" on a row. */
  onReject: (item: PendingApprovalItem, approverAddress: string) => void;
  /** Overridable clock for deterministic tests. */
  now?: Date;
}

/**
 * MultiSigApprovalQueue (#780)
 *
 * Renders the pending-approval queue for the multi-sig dual-control
 * dashboard. Each row shows order metadata (ID, amount, recipient,
 * requester, expiry) plus 1-click "Approve & Sign" and "Reject" buttons
 * that are disabled while a mutation is in-flight.
 *
 * The component is intentionally data-agnostic: it receives pre-derived
 * `PendingApprovalItem[]` from `usePendingApprovals` so it can be tested
 * in isolation without a live hook.
 */
export function MultiSigApprovalQueue({
  items,
  pendingIds,
  loading = false,
  error = null,
  approverAddress = null,
  onApprove,
  onReject,
  now = new Date(),
}: MultiSigApprovalQueueProps) {
  const handleApprove = useCallback(
    (item: PendingApprovalItem) => {
      if (!approverAddress) return;
      onApprove(item, approverAddress);
    },
    [approverAddress, onApprove]
  );

  const handleReject = useCallback(
    (item: PendingApprovalItem) => {
      if (!approverAddress) return;
      onReject(item, approverAddress);
    },
    [approverAddress, onReject]
  );

  if (loading && items.length === 0) {
    return (
      <div
        className="card skeleton"
        aria-busy="true"
        aria-label="Loading pending approvals"
        data-testid="multi-sig-queue-loading"
      >
        <div className="skeleton-title" />
        <div className="skeleton-text" />
        <div className="skeleton-text" />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="settings-status error"
        role="alert"
        data-testid="multi-sig-queue-error"
      >
        {error}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <Card title="Pending approvals">
        <p
          className="stat-label"
          data-testid="multi-sig-queue-empty"
          style={{ textAlign: "center", padding: "1.5rem 0" }}
        >
          🎉 No pending approvals — you&apos;re all caught up.
        </p>
      </Card>
    );
  }

  const walletMissing = !approverAddress;

  return (
    <section aria-label="Pending approvals queue">
      {walletMissing && (
        <div
          className="settings-status"
          role="status"
          data-testid="multi-sig-queue-no-wallet"
        >
          Connect your wallet to approve or reject orders.
        </div>
      )}
      <ul
        className="approval-list"
        aria-label={`${items.length} pending approval${items.length === 1 ? "" : "s"}`}
        data-testid="multi-sig-approval-list"
      >
        {items.map((item) => (
          <ApprovalRow
            key={item.orderId}
            item={item}
            pending={pendingIds.has(item.orderId)}
            now={now}
            onApprove={handleApprove}
            onReject={handleReject}
          />
        ))}
      </ul>
    </section>
  );
}
