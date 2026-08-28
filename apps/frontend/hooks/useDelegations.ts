"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ApiResponse,
  CreateDelegationInput,
  Delegation,
  UpdateDelegationInput,
} from "@delegolabs/types";
import { api } from "../lib/api";
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
 * Fetch the current user's delegations from the Delego API.
 */
function isDelegationArray(data: unknown): data is Delegation[] {
  if (!Array.isArray(data)) return false;
  return data.every(
    (item) =>
      typeof item === "object" &&
      item !== null &&
      "id" in item &&
      "userId" in item &&
      "agentId" in item &&
      "status" in item
  );
}

let tempIdSequence = 0;
function createTempId(): string {
  tempIdSequence += 1;
  return `temp-${Date.now()}-${tempIdSequence}`;
}

function toOptimisticDelegation(
  input: CreateDelegationInput,
  tempId: string
): Delegation {
  const now = new Date();
  return {
    id: tempId,
    userId: "",
    agentId: input.agentId,
    status: "pending",
    policy: {
      maxPerTransaction: BigInt(input.policy.maxPerTransaction),
      maxTotal: BigInt(input.policy.maxTotal),
      allowedMerchants: input.policy.allowedMerchants,
      expiresAt: input.policy.expiresAt ?? null,
    },
    createdAt: now,
    updatedAt: now,
  };
}

function applyOptimisticUpdate(
  delegation: Delegation,
  input: UpdateDelegationInput
): Delegation {
  return {
    ...delegation,
    status: input.status ?? delegation.status,
    policy: {
      ...delegation.policy,
      ...(input.policy?.maxPerTransaction !== undefined && {
        maxPerTransaction: BigInt(input.policy.maxPerTransaction),
      }),
      ...(input.policy?.maxTotal !== undefined && {
        maxTotal: BigInt(input.policy.maxTotal),
      }),
      ...(input.policy?.allowedMerchants !== undefined && {
        allowedMerchants: input.policy.allowedMerchants,
      }),
      ...(input.policy?.expiresAt !== undefined && {
        expiresAt: input.policy.expiresAt,
      }),
    },
    updatedAt: new Date(),
  };
}

export interface UseDelegationsResult {
  delegations: Delegation[];
  loading: boolean;
  error: string | null;
  /** Cached row is older than the delegations family TTL. */
  stale: boolean;
  cachedAt: number | null;
  ttlMs: number;
  /** Delegation IDs with an in-flight mutation — render as pending/disabled in the UI */
  pendingIds: Set<string>;
  /** Delegation IDs queued offline awaiting reconnect replay */
  pendingOfflineIds: Set<string>;
  /** Queued mutations in conflict state for delegations */
  conflictMutations: QueuedMutation[];
  refresh: () => Promise<void>;
  createDelegation: (
    input: CreateDelegationInput
  ) => Promise<Delegation | null>;
  updateDelegation: (
    id: string,
    input: UpdateDelegationInput
  ) => Promise<Delegation | null>;
  revokeDelegation: (id: string) => Promise<boolean>;
}

/** Fetch and mutate user delegations, applying optimistic UI updates with rollback on failure. */
export function useDelegations(): UseDelegationsResult {
  const [delegations, setDelegations] = useState<Delegation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [cachedAt, setCachedAt] = useState<number | null>(null);
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
        (m.mutationClass === "update_delegation" ||
          m.mutationClass === "revoke_delegation") &&
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
        (m.mutationClass === "update_delegation" ||
          m.mutationClass === "revoke_delegation") &&
        m.status === "conflict"
    );
  }, [queuedMutations]);

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

  const loadDelegations = useCallback(
    async (signal?: AbortSignal): Promise<void> => {
      setError(null);
      const cached = await peekReadModel<Delegation[]>("delegations", "list");
      if (signal?.aborted) return;
      if (cached && isDelegationArray(cached.payload)) {
        setDelegations(cached.payload);
        setCachedAt(cached.cachedAt);
        setStale(isRecordStale(cached, Date.now()));
        setLoading(false);
      } else {
        setLoading(true);
      }
      try {
        const res: ApiResponse<Delegation[]> = await api.getDelegations(
          signal ? { signal } : undefined
        );
        if (signal?.aborted) return;
        if (res.error) {
          setError(res.error.message);
          if (!cached) setStale(true);
        } else if (!isDelegationArray(res.data)) {
          setError("Invalid response format");
        } else {
          setDelegations(res.data);
          setStale(false);
          const record = await writeReadModel("delegations", "list", res.data);
          setCachedAt(record.cachedAt);
        }
      } catch (err) {
        if (signal?.aborted) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError("Failed to fetch delegations");
        setStale(true);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    []
  );

  const refresh = useCallback(() => loadDelegations(), [loadDelegations]);

  const createDelegation = useCallback(
    async (input: CreateDelegationInput): Promise<Delegation | null> => {
      const tempId = createTempId();
      const optimistic = toOptimisticDelegation(input, tempId);
      setPending(tempId, true);
      setDelegations((prev) => [...prev, optimistic]);
      try {
        const res: ApiResponse<Delegation> = await api.createDelegation(input);
        if (res.error || !res.data) {
          setDelegations((prev) => prev.filter((d) => d.id !== tempId));
          setError(res.error?.message ?? "Failed to create delegation");
          setPending(tempId, false);
          return null;
        }
        const created = res.data;
        setDelegations((prev) =>
          prev.map((d) => (d.id === tempId ? created : d))
        );
        setPending(tempId, false);
        return created;
      } catch (err) {
        setDelegations((prev) => prev.filter((d) => d.id !== tempId));
        setError(
          err instanceof Error ? err.message : "Failed to create delegation"
        );
        setPending(tempId, false);
        return null;
      }
    },
    [setPending]
  );

  const updateDelegation = useCallback(
    async (
      id: string,
      input: UpdateDelegationInput
    ): Promise<Delegation | null> => {
      const original = delegations.find((d) => d.id === id);
      if (!original) {
        setError("Delegation not found");
        return null;
      }

      const optimistic = applyOptimisticUpdate(original, input);

      // Offline check (#618)
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        await enqueueMutation(
          "update_delegation",
          id,
          input as Record<string, unknown>
        );
        setDelegations((prev) =>
          prev.map((d) => (d.id === id ? optimistic : d))
        );
        return optimistic;
      }

      setPending(id, true);
      setDelegations((prev) => prev.map((d) => (d.id === id ? optimistic : d)));
      try {
        const res: ApiResponse<Delegation> = await api.updateDelegation(
          id,
          input
        );
        if (res.error || !res.data) {
          setError(res.error?.message ?? "Failed to update delegation");
          setDelegations((prev) =>
            prev.map((d) => (d.id === id ? original : d))
          );
          setPending(id, false);
          return null;
        }
        const updated = res.data;
        setDelegations((prev) => prev.map((d) => (d.id === id ? updated : d)));
        setPending(id, false);
        return updated;
      } catch {
        // Fallback offline queue on network exception
        await enqueueMutation(
          "update_delegation",
          id,
          input as Record<string, unknown>
        );
        setPending(id, false);
        return optimistic;
      }
    },
    [delegations, setPending]
  );

  const revokeDelegation = useCallback(
    async (id: string): Promise<boolean> => {
      const original = delegations;

      // Offline check (#618)
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        await enqueueMutation("revoke_delegation", id);
        setDelegations((prev) => prev.filter((d) => d.id !== id));
        return true;
      }

      setPending(id, true);
      setDelegations((prev) => prev.filter((d) => d.id !== id));
      try {
        const res: ApiResponse<{ id: string; status: string }> =
          await api.revokeDelegation(id);
        if (res.error || !res.data) {
          setError(res.error?.message ?? "Failed to revoke delegation");
          setDelegations(original);
          setPending(id, false);
          return false;
        }
        setPending(id, false);
        return true;
      } catch {
        // Fallback offline queue on network exception
        await enqueueMutation("revoke_delegation", id);
        setPending(id, false);
        return true;
      }
    },
    [delegations, setPending]
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadDelegations(controller.signal);
    return () => controller.abort();
  }, [loadDelegations]);

  return {
    delegations,
    loading,
    error,
    stale,
    cachedAt,
    ttlMs: FAMILY_CONFIG.delegations.ttlMs,
    pendingIds,
    pendingOfflineIds,
    conflictMutations,
    refresh,
    createDelegation,
    updateDelegation,
    revokeDelegation,
  };
}
