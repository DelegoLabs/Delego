"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyOptimisticSubscriptionAction,
  fetchSubscriptions,
  rollbackSubscription,
  statusAfterAction,
  updateSubscriptionStatus,
  type SubscriptionAction,
  type SubscriptionPlan,
} from "../lib/subscriptions";

export interface SubscriptionActionErrorContext {
  subscriptionId: string;
  action: SubscriptionAction;
}

export interface UseSubscriptionsOptions {
  /** Optional callback invoked when a pause/resume/cancel request fails and rolls back. */
  onError?: (message: string, context: SubscriptionActionErrorContext) => void;
}

export interface UseSubscriptionsResult {
  subscriptions: SubscriptionPlan[];
  loading: boolean;
  error: string | null;
  /** Subscription IDs with an in-flight pause/resume/cancel request. */
  pendingIds: Set<string>;
  /** Returns true if the given subscription has an in-flight action request. */
  isPending: (subscriptionId: string) => boolean;
  /** Clears the current error message. */
  clearError: () => void;
  refresh: () => Promise<void>;
  /**
   * Optimistically transitions the subscription status and sends the API request.
   * Resolves true on success; on failure rolls back the item, sets `error`, notifies `onError`, and resolves false.
   */
  runAction: (subscriptionId: string, action: SubscriptionAction) => Promise<boolean>;
}

/** Fetch the user's recurring-order subscriptions and run pause/resume/cancel actions. */
export function useSubscriptions(options?: UseSubscriptionsOptions): UseSubscriptionsResult {
  const [subscriptions, setSubscriptions] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const subscriptionsRef = useRef<SubscriptionPlan[]>(subscriptions);
  subscriptionsRef.current = subscriptions;

  const inFlightRef = useRef<Set<string>>(new Set());

  const onErrorRef = useRef(options?.onError);
  onErrorRef.current = options?.onError;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchSubscriptions();
      subscriptionsRef.current = data;
      setSubscriptions(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load subscriptions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const isPending = useCallback(
    (subscriptionId: string) => pendingIds.has(subscriptionId),
    [pendingIds]
  );

  const runAction = useCallback(
    async (subscriptionId: string, action: SubscriptionAction): Promise<boolean> => {
      if (inFlightRef.current.has(subscriptionId)) {
        return false;
      }

      const previousPlan = subscriptionsRef.current.find(
        (s) => s.subscriptionId === subscriptionId
      );

      inFlightRef.current.add(subscriptionId);
      setPendingIds((prev) => new Set(prev).add(subscriptionId));
      setError(null);

      // Optimistically apply the status transition before the network request completes
      setSubscriptions((prev) => {
        const next = applyOptimisticSubscriptionAction(prev, subscriptionId, action);
        subscriptionsRef.current = next;
        return next;
      });

      try {
        const updated = await updateSubscriptionStatus(subscriptionId, action);
        setSubscriptions((prev) => {
          const next = prev.map((s) =>
            s.subscriptionId === subscriptionId
              ? { ...s, ...updated, status: updated?.status ?? statusAfterAction(action) }
              : s
          );
          subscriptionsRef.current = next;
          return next;
        });
        setError(null);
        return true;
      } catch (err) {
        if (previousPlan) {
          setSubscriptions((prev) => {
            const next = rollbackSubscription(prev, previousPlan);
            subscriptionsRef.current = next;
            return next;
          });
        }
        const message =
          err instanceof Error ? err.message : `Failed to ${action} subscription`;
        setError(message);
        onErrorRef.current?.(message, { subscriptionId, action });
        return false;
      } finally {
        inFlightRef.current.delete(subscriptionId);
        setPendingIds((prev) => {
          const next = new Set(prev);
          next.delete(subscriptionId);
          return next;
        });
      }
    },
    []
  );

  return {
    subscriptions,
    loading,
    error,
    pendingIds,
    isPending,
    clearError,
    refresh: load,
    runAction,
  };
}
