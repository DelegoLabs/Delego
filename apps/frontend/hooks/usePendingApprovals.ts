"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchPendingApprovals, submitApproval } from "../services/approvals";
import {
  adaptPendingApprovals,
  type PendingApprovalItem,
} from "../lib/pendingApprovals";
import {
  arePendingApprovalsLoaded,
  getPendingApprovalItems,
  loadPendingApprovalsOnce,
  removePendingApproval,
} from "../lib/pendingApprovalStore";
import { useWallet } from "./useWallet";

/**
 * Loads the queue of transactions awaiting a secondary signature (#780) and
 * exposes the 1-click "approve & sign" action for a row.
 *
 * State lives in the shared `lib/pendingApprovalStore` so the navigation badge
 * updates the moment a signature lands, without the badge having to refetch.
 */

export interface UsePendingApprovalsOptions {
  /** Re-fetch on this interval (ms); omit to fetch once on mount. */
  pollIntervalMs?: number;
}

export interface UsePendingApprovalsResult {
  items: PendingApprovalItem[];
  loading: boolean;
  error: string | null;
  /** Order IDs with an in-flight signature. */
  signingIds: Set<string>;
  /** Approves + signs `orderId`; resolves false (with `error` set) on failure. */
  sign: (orderId: string) => Promise<boolean>;
  refresh: () => Promise<void>;
}

async function loadQueue(): Promise<PendingApprovalItem[]> {
  const res = await fetchPendingApprovals();
  if (res.error) throw new Error(res.error.message);
  return adaptPendingApprovals(res.data);
}

export function usePendingApprovals(
  options: UsePendingApprovalsOptions = {}
): UsePendingApprovalsResult {
  const { pollIntervalMs } = options;
  const { address } = useWallet();
  // Seeded from the shared store: when the navigation badge got there first,
  // the dashboard adopts that snapshot instead of rendering an empty queue.
  const [items, setItems] = useState<PendingApprovalItem[]>(getPendingApprovalItems);
  const [loading, setLoading] = useState(() => !arePendingApprovalsLoaded());
  const [error, setError] = useState<string | null>(null);
  const [signingIds, setSigningIds] = useState<Set<string>>(new Set());

  // Guards state updates after unmount (polling / in-flight requests).
  const mountedRef = useRef(true);

  const load = useCallback(async (force = false) => {
    if (!force && arePendingApprovalsLoaded()) {
      // Another surface already loaded the queue — adopt it, don't re-request.
      if (mountedRef.current) {
        setItems(getPendingApprovalItems());
        setLoading(false);
      }
      return;
    }
    try {
      const next = await loadPendingApprovalsOnce(loadQueue);
      if (!mountedRef.current) return;
      setItems(next);
      setError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to load approvals");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    let timer: ReturnType<typeof setInterval> | undefined;
    if (pollIntervalMs && pollIntervalMs > 0) {
      timer = setInterval(() => {
        // Polling always re-requests — that is the point of the interval.
        void load(true);
      }, pollIntervalMs);
    }
    return () => {
      mountedRef.current = false;
      if (timer) clearInterval(timer);
    };
  }, [load, pollIntervalMs]);

  const refresh = useCallback(async () => {
    // A manual refresh always bypasses the "already loaded" short-circuit.
    try {
      const next = await loadPendingApprovalsOnce(loadQueue);
      if (mountedRef.current) {
        setItems(next);
        setError(null);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : "Failed to load approvals");
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  const setSigning = useCallback((orderId: string, isPending: boolean) => {
    setSigningIds((prev) => {
      const next = new Set(prev);
      if (isPending) next.add(orderId);
      else next.delete(orderId);
      return next;
    });
  }, []);

  const sign = useCallback(
    async (orderId: string): Promise<boolean> => {
      if (!address) {
        setError("Connect your wallet to sign.");
        return false;
      }
      setSigning(orderId, true);
      setError(null);
      try {
        const res = await submitApproval(orderId, address);
        if (res.error) {
          setError(res.error.message);
          return false;
        }
        // Signed: the order leaves the queue for everyone, badge included.
        removePendingApproval(orderId);
        setItems((prev) => prev.filter((item) => item.orderId !== orderId));
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Signing failed. Please try again.");
        return false;
      } finally {
        setSigning(orderId, false);
      }
    },
    [address, setSigning]
  );

  return { items, loading, error, signingIds, sign, refresh };
}
