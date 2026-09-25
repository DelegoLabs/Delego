"use client";

import { useCallback, useRef, useState } from "react";
import { apiFetch } from "../lib/apiFetch";
import type {
  IssueTicketRecord,
  ReportProblemPayload,
} from "../lib/issueTicket";

export interface UseReportProblemResult {
  submitting: boolean;
  error: string | null;
  submit: (payload: ReportProblemPayload) => Promise<IssueTicketRecord | null>;
}

/**
 * Submits a low-stakes "Report a problem" ticket to the coordinate endpoint.
 * Strictly separated from useDispute — never references dispute payloads
 * or dispute-adjacent API routes, so the two states never conflate.
 */
export function useReportProblem(): UseReportProblemResult {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Hard guard: prevents double-submit even if React batching misses it.
  const inFlightRef = useRef(false);

  const submit = useCallback(
    async (payload: ReportProblemPayload): Promise<IssueTicketRecord | null> => {
      if (inFlightRef.current) return null;
      inFlightRef.current = true;
      setSubmitting(true);
      setError(null);

      try {
        const res = await apiFetch<IssueTicketRecord>(
          `/orders/${payload.orderId}/issues`,
          {
            method: "POST",
            body: JSON.stringify(payload),
          }
        );

        if (res.error) {
          setError(res.error.message);
          return null;
        }
        return res.data ?? null;
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to submit issue report. Please try again."
        );
        return null;
      } finally {
        setSubmitting(false);
        inFlightRef.current = false;
      }
    },
    []
  );

  return { submitting, error, submit };
}
