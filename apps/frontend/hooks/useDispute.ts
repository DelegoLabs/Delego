"use client";

import { useCallback, useEffect, useState } from "react";
import type { CreateDisputeInput, Dispute, Escrow } from "@delegolabs/types";
import { apiFetch } from "../lib/apiFetch";
import { canOpenDispute } from "../lib/disputes";

export interface UseDisputeResult {
  /** The escrow's dispute, if one has been opened (open or resolved). */
  dispute: Dispute | null;
  loading: boolean;
  submitting: boolean;
  error: string | null;
  /** True immediately after a successful submit, before `dispute` reflects it. */
  optimisticallyDisputed: boolean;
  /** Guard rail: false once an unresolved dispute already exists (or is in flight). */
  canOpen: (escrowStatus: Escrow["status"]) => boolean;
  openDispute: (input: CreateDisputeInput) => Promise<Dispute | null>;
  refresh: () => Promise<void>;
}

/**
 * Fetches (and submits) the dispute for a single escrow.
 *
 * "Submitter" here is the buyer opening the dispute from the escrow detail
 * page — cross-event/authorization checks happen server-side; this hook just
 * surfaces whatever the API returns (including a rejection message) and
 * tracks an optimistic "disputed" flag so the UI can update immediately.
 */
export function useDispute(escrowId: string | undefined): UseDisputeResult {
  const [dispute, setDispute] = useState<Dispute | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [optimisticallyDisputed, setOptimisticallyDisputed] = useState(false);

  const load = useCallback(async () => {
    if (!escrowId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch<Dispute | null>(`/escrows/${escrowId}/disputes/current`);
      if (res.error) {
        setError(res.error.message);
      } else {
        setDispute(res.data ?? null);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch dispute status");
    } finally {
      setLoading(false);
    }
  }, [escrowId]);

  useEffect(() => {
    load();
  }, [load]);

  const openDispute = useCallback(
    async (input: CreateDisputeInput): Promise<Dispute | null> => {
      if (!escrowId) return null;
      setSubmitting(true);
      setError(null);
      try {
        const res = await apiFetch<Dispute>(`/escrows/${escrowId}/disputes`, {
          method: "POST",
          body: JSON.stringify(input),
        });
        if (res.error) {
          setError(res.error.message);
          return null;
        }
        setOptimisticallyDisputed(true);
        if (res.data) setDispute(res.data);
        return res.data ?? null;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to open dispute");
        return null;
      } finally {
        setSubmitting(false);
      }
    },
    [escrowId]
  );

  const canOpen = useCallback(
    (escrowStatus: Escrow["status"]) =>
      canOpenDispute({ status: escrowStatus }, dispute, optimisticallyDisputed || submitting),
    [dispute, optimisticallyDisputed, submitting]
  );

  return {
    dispute,
    loading,
    submitting,
    error,
    optimisticallyDisputed,
    canOpen,
    openDispute,
    refresh: load,
  };
}
