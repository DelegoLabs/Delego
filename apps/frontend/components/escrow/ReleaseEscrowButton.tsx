"use client";

import { useState } from "react";
import type { ReleaseEligibilityCondition } from "@delego/types";
import { Button, Tooltip } from "@delego/ui";
import {
  invalidateReleaseEligibilityCache,
  useReleaseEligibility,
} from "../../hooks/useReleaseEligibility";
import { api } from "../../lib/api";

export interface ReleaseEscrowButtonProps {
  escrowId: string;
  callerAddress: string;
  onReleased?: (txHash: string, ledger: number) => void;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
}

function conditionsToTooltipContent(
  conditions: ReleaseEligibilityCondition[]
): React.ReactNode {
  if (conditions.length === 0) return "Ready to release";
  return (
    <ul
      role="list"
      style={{
        margin: 0,
        padding: 0,
        listStyle: "none",
        display: "flex",
        flexDirection: "column",
        gap: "0.375rem",
      }}
    >
      {conditions.map((c, i) => (
        <li
          key={`${c.key.toString()}-${i}`}
          style={{
            display: "flex",
            gap: "0.5rem",
            alignItems: "flex-start",
            lineHeight: "1.3",
          }}
        >
          <span aria-hidden style={{ color: c.met ? "#10b981" : "#fca5a5", flexShrink: 0 }}>
            {c.met ? "✓" : "✕"}
          </span>
          <span>{c.message}</span>
        </li>
      ))}
    </ul>
  );
}

export function ReleaseEscrowButton({
  escrowId,
  callerAddress,
  onReleased,
  variant = "primary",
}: ReleaseEscrowButtonProps) {
  const { eligibility, loading, error, refetch, unmetConditions } =
    useReleaseEligibility({
      escrowId,
      callerAddress,
    });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const disabled =
    loading ||
    submitting ||
    !!error ||
    !eligibility ||
    !eligibility.eligible ||
    unmetConditions.length > 0;

  async function handleRelease() {
    setSubmitError(null);

    if (!eligibility || !eligibility.eligible || unmetConditions.length > 0) {
      setSubmitError(
        "Cannot release this escrow — unmet conditions remain. Please refresh and try again."
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.releaseEscrow(escrowId, callerAddress);
      if (res.error) {
        throw new Error(res.error.message);
      }
      if (!res.data || !res.data.success) {
        throw new Error("Release transaction was not successful");
      }
      invalidateReleaseEligibilityCache(escrowId);
      void refetch();
      onReleased?.(res.data.txHash, res.data.ledger);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Failed to release escrow"
      );
    } finally {
      setSubmitting(false);
    }
  }

  const tooltipContent = loading
    ? "Checking release eligibility…"
    : error
    ? `Eligibility check failed: ${error}`
    : eligibility
    ? conditionsToTooltipContent(eligibility.conditions)
    : "Loading eligibility…";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem", alignItems: "flex-start" }}>
      <Tooltip
        content={tooltipContent}
        placement="top"
        disabled={loading && !eligibility}
      >
        <span aria-disabled={disabled}>
          <Button
            type="button"
            variant={variant}
            onClick={handleRelease}
            disabled={disabled}
            aria-disabled={disabled}
            aria-busy={loading || submitting}
            aria-label={
              disabled && unmetConditions.length > 0
                ? `Release escrow — ${unmetConditions.length} unmet condition${unmetConditions.length === 1 ? "" : "s"}`
                : "Release escrow funds to seller"
            }
          >
            {submitting
              ? "Releasing…"
              : loading
              ? "Checking…"
              : "Release funds to seller"}
          </Button>
        </span>
      </Tooltip>

      {!submitting && !loading && unmetConditions.length > 0 && (
        <div
          role="note"
          style={{
            fontSize: "0.75rem",
            color: "#92400e",
            display: "flex",
            alignItems: "center",
            gap: "0.25rem",
          }}
        >
          <span aria-hidden>ℹ</span>
          {unmetConditions.length === 1
            ? unmetConditions[0].message
            : `${unmetConditions.length} conditions must be met before release`}
        </div>
      )}

      {(submitError || error) && (
        <div
          role="alert"
          style={{
            padding: "0.375rem 0.625rem",
            borderRadius: "0.375rem",
            background: "#fef2f2",
            color: "#991b1b",
            fontSize: "0.8125rem",
          }}
        >
          {submitError ?? error}
        </div>
      )}
    </div>
  );
}
