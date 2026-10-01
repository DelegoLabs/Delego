"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import {
  getPendingApprovalItems,
  loadPendingApprovalsOnce,
  subscribeToPendingApprovals,
} from "../lib/pendingApprovalStore";
import { adaptPendingApprovals } from "../lib/pendingApprovals";
import { fetchPendingApprovals } from "../services/approvals";
import { useNow } from "./useNow";

/**
 * Count of transactions still awaiting a secondary signature, for the
 * navigation badge (#780).
 *
 * Reads the shared store rather than its own copy, so a signature made on the
 * dashboard decrements the badge immediately. If nothing has loaded the queue
 * yet, the badge triggers a single shared fetch — failures are non-fatal and
 * simply leave the badge hidden.
 */
export function usePendingApprovalBadge(): number {
  const items = useSyncExternalStore(
    subscribeToPendingApprovals,
    getPendingApprovalItems,
    getPendingApprovalItems
  );
  // A ticking clock so rows whose window closed drop out of the count on their
  // own, without waiting for the next queue refresh.
  const now = useNow(60_000);

  useEffect(() => {
    loadPendingApprovalsOnce(async () => {
      const res = await fetchPendingApprovals();
      if (res.error) throw new Error(res.error.message);
      return adaptPendingApprovals(res.data);
    }).catch(() => {
      // Non-fatal: the badge stays hidden until a later successful load.
    });
  }, []);

  return useMemo(() => {
    const nowMs = now.getTime();
    return items.filter((item) => item.expiresAt.getTime() > nowMs).length;
  }, [items, now]);
}
