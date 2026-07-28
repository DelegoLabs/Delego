"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  ApiResponse,
  CreateDelegationInput,
  Delegation,
  UpdateDelegationInput,
} from "@delego/types";
import { api } from "../lib/api";

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

function toOptimisticDelegation(input: CreateDelegationInput, tempId: string): Delegation {
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
  /** Delegation IDs with an in-flight mutation — render as pending/disabled in the UI */
  pendingIds: Set<string>;
  refresh: () => Promise<void>;
  createDelegation: (input: CreateDelegationInput) => Promise<Delegation | null>;
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
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

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
      setLoading(true);
      setError(null);
      try {
        const res: ApiResponse<Delegation[]> = await api.getDelegations(
          signal ? { signal } : undefined
        );
        if (signal?.aborted) return;
        if (res.error) {
          setError(res.error.message);
        } else if (!isDelegationArray(res.data)) {
          setError("Invalid response format");
        } else {
          setDelegations(res.data);
        }
      } catch (err) {
        if (signal?.aborted) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError("Failed to fetch delegations");
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
        setError(err instanceof Error ? err.message : "Failed to create delegation");
        setPending(tempId, false);
        return null;
      }
    },
    []
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
      setPending(id, true);
      setDelegations((prev) =>
        prev.map((d) => (d.id === id ? applyOptimisticUpdate(original, input) : d))
      );
      try {
        const res: ApiResponse<Delegation> = await api.updateDelegation(id, input);
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
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update delegation");
        setDelegations((prev) =>
          prev.map((d) => (d.id === id ? original : d))
        );
        setPending(id, false);
        return null;
      }
    },
    [delegations]
  );

  const revokeDelegation = useCallback(
    async (id: string): Promise<boolean> => {
      const original = delegations;
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
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to revoke delegation");
        setDelegations(original);
        setPending(id, false);
        return false;
      }
    },
    [delegations]
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
    pendingIds,
    refresh,
    createDelegation,
    updateDelegation,
    revokeDelegation,
  };
}
