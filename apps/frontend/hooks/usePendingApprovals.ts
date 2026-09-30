"use client";

import { useCallback, useMemo, useState } from "react";
import type { Order } from "@delegolabs/types";
import { useOrders } from "./useOrders";
import { submitApproval, submitRejection } from "../services/approvals";
import { needsApproval } from "../lib/orders";

/**
 * PendingApprovalItem (#780)
 *
 * A flattened view of an order that requires a secondary signature in the
 * multi-sig dual-control approval dashboard. Fields mirror the shape from
 * the issue spec exactly so the queue component can render without further
 * transformation.
 */
export interface PendingApprovalItem {
  orderId: string;
  requestedBy: string;
  amountStroops: bigint;
  recipient: string;
  expiresAt: Date;
}

/** Map a raw Order to a PendingApprovalItem. */
function toPendingApprovalItem(order: Order): PendingApprovalItem {
  const expiresAt = order.expiresAt
    ? new Date(order.expiresAt as string)
    : new Date(
        new Date(order.createdAt as string).getTime() + 72 * 60 * 60 * 1000
      );

  return {
    orderId: order.id,
    requestedBy: order.userId ?? order.delegationId ?? "unknown",
    amountStroops: BigInt(order.totalStroops ?? 0),
    recipient: order.merchantId ?? "unknown",
    expiresAt,
  };
}

export interface UsePendingApprovalsResult {
  /** Pending-approval items derived from the order list. */
  items: PendingApprovalItem[];
  /** True while the first fetch is in-flight. */
  loading: boolean;
  /** Non-null when a network/API error has occurred. */
  error: string | null;
  /** Count of items, convenient for the badge counter. */
  count: number;
  /** Order IDs with an in-flight approve/reject mutation. */
  pendingIds: Set<string>;
  /**
   * 1-click approve: submits an approval for the given order as
   * `approverAddress`. Optimistically reflects the pending state via
   * `pendingIds` while the request is in-flight.
   *
   * Returns the updated Order on success, null on failure.
   */
  approve: (orderId: string, approverAddress: string) => Promise<boolean>;
  /**
   * 1-click reject.
   */
  reject: (
    orderId: string,
    approverAddress: string,
    reason?: string
  ) => Promise<boolean>;
  /** Force-refresh the underlying order list. */
  refresh: () => Promise<void>;
}

const POLL_INTERVAL_MS = 15_000;

/**
 * usePendingApprovals (#780)
 *
 * Drives the multi-sig approval dashboard. Derives a `PendingApprovalItem[]`
 * from the full order list (same polling source as the main approvals page so
 * there's no duplicate fetch), exposes a `count` for the nav badge, and
 * provides 1-click `approve` / `reject` actions that delegate to
 * `services/approvals`.
 */
export function usePendingApprovals(): UsePendingApprovalsResult {
  const { orders, loading, error, refresh } = useOrders({
    pollIntervalMs: POLL_INTERVAL_MS,
  });

  const [localPendingIds, setLocalPendingIds] = useState<Set<string>>(
    new Set()
  );

  const items = useMemo<PendingApprovalItem[]>(
    () =>
      orders
        .filter((order) => needsApproval(order))
        .map(toPendingApprovalItem),
    [orders]
  );

  const count = items.length;

  const markPending = useCallback((id: string) => {
    setLocalPendingIds((prev) => new Set([...prev, id]));
  }, []);

  const unmarkPending = useCallback((id: string) => {
    setLocalPendingIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const approve = useCallback(
    async (orderId: string, approverAddress: string): Promise<boolean> => {
      markPending(orderId);
      try {
        const result = await submitApproval(orderId, approverAddress);
        if (result.error) return false;
        await refresh();
        return true;
      } finally {
        unmarkPending(orderId);
      }
    },
    [markPending, unmarkPending, refresh]
  );

  const reject = useCallback(
    async (
      orderId: string,
      approverAddress: string,
      reason?: string
    ): Promise<boolean> => {
      markPending(orderId);
      try {
        const result = await submitRejection(orderId, approverAddress, reason);
        if (result.error) return false;
        await refresh();
        return true;
      } finally {
        unmarkPending(orderId);
      }
    },
    [markPending, unmarkPending, refresh]
  );

  return {
    items,
    loading,
    error,
    count,
    pendingIds: localPendingIds,
    approve,
    reject,
    refresh,
  };
}
