"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Order, RejectionReasonCode } from "@delegolabs/types";
import { api } from "../lib/api";
import {
  adaptOrders,
  adaptOrder,
  type ListOrdersResponse,
  type ApproveOrderResponse,
  type RejectOrderResponse,
} from "@delegolabs/api-generated";
import {
  enqueueMutation,
  subscribeToQueue,
  type QueuedMutation,
} from "../lib/offlineQueue";
import {
  FAMILY_CONFIG,
  isRecordStale,
  peekReadModel,
  writeReadModel,
} from "../lib/readModelCache";

/**
 * Fetch (and optionally poll) the current user's orders from the Delego API,
 * with optimistic approve/reject mutations for the approval workflow.
 *
 * The approvals module is fully typed end-to-end from the OpenAPI spec via
 * @delegolabs/api-generated (#633). Raw API responses are adapted to the
 * application domain model (Date, bigint) by adaptOrder(s) before being
 * stored in state — no hand-written interfaces remain in this module.
 */

export interface UseOrdersOptions {
  /**
   * When set to a positive number, re-fetch orders on this interval (ms) so the
   * tracking dashboard reflects near-real-time status changes. Omit to fetch once.
   */
  pollIntervalMs?: number;
}

export interface UseOrdersResult {
  orders: Order[];
  loading: boolean;
  error: string | null;
  stale: boolean;
  cachedAt: number | null;
  ttlMs: number;
  /** Timestamp of the last successful fetch, or null before the first load. */
  lastUpdated: Date | null;
  /** Order IDs with an in-flight approve/reject mutation. */
  pendingIds: Set<string>;
  /** Order IDs queued offline awaiting reconnect replay. */
  pendingOfflineIds: Set<string>;
  /** Queued mutations in conflict state for approval orders */
  conflictMutations: QueuedMutation[];
  refresh: () => Promise<void>;
  approveOrder: (id: string) => Promise<Order | null>;
  rejectOrder: (
    id: string,
    reason?: string,
    reasonCode?: RejectionReasonCode
  ) => Promise<Order | null>;
}

export function useOrders(options: UseOrdersOptions = {}): UseOrdersResult {
  const { pollIntervalMs } = options;
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [queuedMutations, setQueuedMutations] = useState<QueuedMutation[]>([]);

  // Subscribe to offline queue changes (#618)
  useEffect(() => {
    return subscribeToQueue(setQueuedMutations);
  }, []);

  const pendingOfflineIds = useMemo(() => {
    const ids = new Set<string>();
    for (const m of queuedMutations) {
      if (
        (m.mutationClass === "approve_order" ||
          m.mutationClass === "reject_order") &&
        (m.status === "pending" || m.status === "replaying")
      ) {
        ids.add(m.resourceId);
      }
    }
    return ids;
  }, [queuedMutations]);

  const conflictMutations = useMemo(() => {
    return queuedMutations.filter(
      (m) =>
        (m.mutationClass === "approve_order" ||
          m.mutationClass === "reject_order") &&
        m.status === "conflict"
    );
  }, [queuedMutations]);

  // Guards against setting state after unmount during polling / async work.
  const mountedRef = useRef(true);

  const setPending = useCallback((id: string, isPending: boolean) => {
    setPendingIds((prev) => {
      const next = new Set(prev);
      if (isPending) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }, []);

  const load = useCallback(async (signal?: AbortSignal) => {
    const cached = await peekReadModel<Order[]>("orders", "list");
    if (signal?.aborted || !mountedRef.current) return;
    if (cached && Array.isArray(cached.payload)) {
      setOrders(cached.payload);
      setCachedAt(cached.cachedAt);
      setStale(isRecordStale(cached, Date.now()));
      setLoading(false);
    }
    try {
      // Typed against the generated ListOrdersResponse from the OpenAPI spec.
      const res = (await api.getOrders({ signal })) as ListOrdersResponse;
      if (signal?.aborted || !mountedRef.current) return;
      if (res.error) {
        setError(res.error.message);
        setStale(true);
      } else if (!Array.isArray(res.data)) {
        setError("Invalid response format");
      } else {
        // Adapt generated API order shape → domain order shape (Date, bigint).
        const adapted = adaptOrders(res.data);
        setOrders(adapted);
        setLastUpdated(new Date());
        setError(null);
        setStale(false);
        const record = await writeReadModel("orders", "list", adapted);
        setCachedAt(record.cachedAt);
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (mountedRef.current) {
        setError("Failed to fetch orders");
        setStale(true);
      }
    } finally {
      if (!signal?.aborted && mountedRef.current) setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    await load();
  }, [load]);

  useEffect(() => {
    mountedRef.current = true;
    const controller = new AbortController();
    load(controller.signal);

    let timer: ReturnType<typeof setInterval> | undefined;
    if (pollIntervalMs && pollIntervalMs > 0) {
      timer = setInterval(() => {
        load(controller.signal);
      }, pollIntervalMs);
    }

    return () => {
      mountedRef.current = false;
      controller.abort();
      if (timer) clearInterval(timer);
    };
  }, [load, pollIntervalMs]);

  const approveOrder = useCallback(
    async (id: string): Promise<Order | null> => {
      // Offline queue check (#618)
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        await enqueueMutation("approve_order", id);
        // Optimistically set order status to approved offline
        setOrders((prev) =>
          prev.map((o) => (o.id === id ? { ...o, status: "approved" } : o))
        );
        return orders.find((o) => o.id === id) ?? null;
      }

      setPending(id, true);
      setError(null);
      try {
        const res = (await api.approveOrder(id)) as ApproveOrderResponse;
        if (res.error) {
          setError(res.error.message);
          return null;
        }
        if (res.data) {
          const updated = adaptOrder(res.data);
          setOrders((prev) =>
            prev.map((order) => (order.id === id ? updated : order))
          );
          return updated;
        }
        return null;
      } catch {
        // Fallback offline queue on network exception
        await enqueueMutation("approve_order", id);
        setOrders((prev) =>
          prev.map((o) => (o.id === id ? { ...o, status: "approved" } : o))
        );
        return null;
      } finally {
        setPending(id, false);
      }
    },
    [orders, setPending]
  );

  const rejectOrder = useCallback(
    async (
      id: string,
      reason?: string,
      reasonCode?: RejectionReasonCode
    ): Promise<Order | null> => {
      // Offline queue check (#618)
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        await enqueueMutation("reject_order", id, { reason, reasonCode });
        setOrders((prev) =>
          prev.map((o) => (o.id === id ? { ...o, status: "rejected" } : o))
        );
        return orders.find((o) => o.id === id) ?? null;
      }

      setPending(id, true);
      setError(null);
      try {
        const res = (await api.rejectOrder(id, reason, reasonCode)) as RejectOrderResponse;
        if (res.error) {
          setError(res.error.message);
          return null;
        }
        if (res.data) {
          const updated = adaptOrder(res.data);
          setOrders((prev) =>
            prev.map((order) => (order.id === id ? updated : order))
          );
          return updated;
        }
        return null;
      } catch {
        // Fallback offline queue on network exception
        await enqueueMutation("reject_order", id, { reason, reasonCode });
        setOrders((prev) =>
          prev.map((o) => (o.id === id ? { ...o, status: "rejected" } : o))
        );
        return null;
      } finally {
        setPending(id, false);
      }
    },
    [orders, setPending]
  );

  return {
    orders,
    loading,
    error,
    stale,
    cachedAt,
    ttlMs: FAMILY_CONFIG.orders.ttlMs,
    lastUpdated,
    pendingIds,
    pendingOfflineIds,
    conflictMutations,
    refresh,
    approveOrder,
    rejectOrder,
  };
}
