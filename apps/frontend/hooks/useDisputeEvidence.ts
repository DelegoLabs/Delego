"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../lib/apiFetch";
import type { DisputeEvidenceBundle } from "../types/dispute-evidence";

export interface EvidenceRequestFeedback {
  type: "success" | "error";
  message: string;
}

export interface UseDisputeEvidenceResult {
  evidence: DisputeEvidenceBundle | null;
  loading: boolean;
  error: string | null;
  notFound: boolean;
  requesting: boolean;
  feedback: EvidenceRequestFeedback | null;
  dismissFeedback: () => void;
  requestMoreEvidence: () => Promise<boolean>;
  refresh: () => Promise<void>;
}

/**
 * Fetches the dispute evidence bundle for an escrow and provides a mutation
 * to request additional evidence from the merchant.
 */
export function useDisputeEvidence(escrowId: string | undefined): UseDisputeEvidenceResult {
  const [evidence, setEvidence] = useState<DisputeEvidenceBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [feedback, setFeedback] = useState<EvidenceRequestFeedback | null>(null);

  const load = useCallback(async () => {
    if (!escrowId) {
      setLoading(false);
      setNotFound(true);
      return;
    }

    setLoading(true);
    setError(null);
    setNotFound(false);

    try {
      const res = await apiFetch<DisputeEvidenceBundle | null>(
        `/escrows/${encodeURIComponent(escrowId)}/evidence`
      );

      if (res.error) {
        if (res.error.code === "404" || res.error.code === "not_found") {
          setEvidence(null);
          setNotFound(true);
        } else {
          setEvidence(null);
          setError(res.error.message || "Failed to load dispute evidence");
        }
      } else if (!res.data) {
        setEvidence(null);
        setNotFound(true);
      } else {
        setEvidence(res.data);
      }
    } catch (err) {
      setEvidence(null);
      setError(err instanceof Error ? err.message : "Failed to load dispute evidence");
    } finally {
      setLoading(false);
    }
  }, [escrowId]);

  useEffect(() => {
    load();
  }, [load]);

  const requestMoreEvidence = useCallback(async (): Promise<boolean> => {
    if (!escrowId || requesting) return false;

    setRequesting(true);
    setFeedback(null);

    try {
      const res = await apiFetch<{ requestedAt?: string; message?: string }>(
        `/escrows/${encodeURIComponent(escrowId)}/evidence/request`,
        {
          method: "POST",
          body: JSON.stringify({ disputeId: evidence?.disputeId ?? escrowId }),
        }
      );

      if (res.error) {
        setFeedback({
          type: "error",
          message: res.error.message || "Failed to request additional evidence",
        });
        return false;
      }

      setFeedback({
        type: "success",
        message:
          res.data?.message || "Request sent. The merchant has been notified to provide additional evidence.",
      });
      return true;
    } catch (err) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to request additional evidence",
      });
      return false;
    } finally {
      setRequesting(false);
    }
  }, [escrowId, evidence?.disputeId, requesting]);

  const dismissFeedback = useCallback(() => {
    setFeedback(null);
  }, []);

  return {
    evidence,
    loading,
    error,
    notFound,
    requesting,
    feedback,
    dismissFeedback,
    requestMoreEvidence,
    refresh: load,
  };
}
