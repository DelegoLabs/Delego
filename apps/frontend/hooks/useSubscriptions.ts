"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchSubscriptions,
  statusAfterAction,
  updateSubscriptionStatus,
  type SubscriptionAction,
  type SubscriptionPlan,
} from "../lib/subscriptions";

export interface UseSubscriptionsResult {
  subscriptions: SubscriptionPlan[];
  loading: boolean;
  error: string | null;
  /** Subscription IDs with an in-flight pause/resume/cancel request. */
  pendingIds: Set<string>;
  refresh: () => Promise<void>;
  /** Resolves true on success; on failure sets `error` and resolves false. */
  runAction: (subscriptionId: string, action: SubscriptionAction) => Promise<boolean>;
}

/** Fetch the user's recurring-order subscriptions and run pause/resume/cancel actions. */
export function useSubscriptions(): UseSubscriptionsResult {
  const [subscriptions, setSubscriptions] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSubscriptions(await fetchSubscriptions());
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

  const runAction = useCallback(
    async (subscriptionId: string, action: SubscriptionAction): Promise<boolean> => {
      setPendingIds((prev) => new Set(prev).add(subscriptionId));
      try {
        const updated = await updateSubscriptionStatus(subscriptionId, action);
        setSubscriptions((prev) =>
          prev.map((s) =>
            s.subscriptionId === subscriptionId
              ? { ...s, ...updated, status: updated?.status ?? statusAfterAction(action) }
              : s
          )
        );
        setError(null);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : `Failed to ${action} subscription`);
        return false;
      } finally {
        setPendingIds((prev) => {
          const next = new Set(prev);
          next.delete(subscriptionId);
          return next;
        });
      }
    },
    []
  );

  return { subscriptions, loading, error, pendingIds, refresh: load, runAction };
}
