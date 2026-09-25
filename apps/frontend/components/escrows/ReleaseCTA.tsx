"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "@delegolabs/ui";
import type { Escrow } from "@delegolabs/types";
import { useReleaseEligibility } from "../../hooks/useReleaseEligibility";
import { useNetwork } from "../../hooks/useNetwork";
import { getConfiguredContracts } from "../../lib/contracts";
import { escrowKey } from "../../lib/escrows";
import {
  formatIneligibilityTooltip,
} from "../../services/releaseEligibility";

export interface ReleaseCTAProps {
  escrow: Escrow;
  /** Called when the user confirms a release. Must only be called when eligible. */
  onRelease: (escrow: Escrow) => Promise<unknown>;
}

/**
 * Release CTA for the escrow detail page (Issue 3).
 *
 * - Queries the contract's `get_release_eligibility` getter before enabling
 *   the button — never relies on client-side heuristics.
 * - When ineligible, the button is disabled and a tooltip/popover shows the
 *   exact human-readable reason sourced from getter data (including countdown
 *   for timeout cases).
 * - The release handler is hard-guarded: it will not fire when `eligible` is
 *   false, even if the button were somehow clicked.
 * - Calls `refresh()` after a successful release and on mount so the state
 *   reflects the latest on-chain reality.
 */
export function ReleaseCTA({ escrow, onRelease }: ReleaseCTAProps) {
  const { networkId } = useNetwork();
  const contractAddress =
    getConfiguredContracts(networkId).find((c) => c.name === "escrow")
      ?.address ?? null;

  const { eligibility, loading, error, refresh } = useReleaseEligibility(
    escrowKey(escrow),
    contractAddress
  );

  const [releasing, setReleasing] = useState(false);
  const [releaseError, setReleaseError] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  // Tooltip popover state
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );

  const tooltipId = `release-ineligibility-${escrowKey(escrow)}`;
  const isEligible = eligibility?.eligible ?? false;
  const tooltipText = eligibility
    ? formatIneligibilityTooltip(eligibility)
    : loading
      ? "Checking release eligibility…"
      : error
        ? `Could not check eligibility: ${error}`
        : "";

  const handleRelease = useCallback(async () => {
    // Hard guard — the handler must never fire when ineligible.
    if (!isEligible || inFlightRef.current) return;

    inFlightRef.current = true;
    setReleasing(true);
    setReleaseError(null);

    try {
      await onRelease(escrow);
      // Invalidate cached eligibility after a successful release.
      refresh();
    } catch (err) {
      setReleaseError(
        err instanceof Error ? err.message : "Release failed. Please try again."
      );
    } finally {
      setReleasing(false);
      inFlightRef.current = false;
    }
  }, [isEligible, escrow, onRelease, refresh]);

  function openTooltip() {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    setTooltipOpen(true);
  }
  function closeTooltip() {
    hideTimerRef.current = setTimeout(() => setTooltipOpen(false), 150);
  }

  const isDisabled = !isEligible || releasing || loading;

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: "0.375rem" }}>
      <div style={{ position: "relative", display: "inline-block" }}>
        {/* Wrap in a span so pointer events reach the tooltip trigger even when
            the button is disabled (disabled elements don't receive mouseenter). */}
        <span
          style={{ display: "inline-block" }}
          onMouseEnter={() => { if (isDisabled && tooltipText) openTooltip(); }}
          onMouseLeave={closeTooltip}
          onFocus={() => { if (isDisabled && tooltipText) openTooltip(); }}
          onBlur={closeTooltip}
          aria-describedby={isDisabled && tooltipText ? tooltipId : undefined}
        >
          <Button
            variant="primary"
            onClick={() => void handleRelease()}
            disabled={isDisabled}
            loading={releasing}
            aria-disabled={isDisabled}
            aria-describedby={isDisabled && tooltipText ? tooltipId : undefined}
          >
            {loading ? "Checking eligibility…" : "Release funds"}
          </Button>
        </span>

        {/* Ineligibility tooltip / popover */}
        {isDisabled && tooltipText && tooltipOpen && (
          <div
            id={tooltipId}
            role="tooltip"
            data-testid="release-ineligibility-tooltip"
            onMouseEnter={() => {
              if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
            }}
            onMouseLeave={closeTooltip}
            style={{
              position: "absolute",
              bottom: "calc(100% + 8px)",
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 200,
              minWidth: "16rem",
              maxWidth: "20rem",
              padding: "0.625rem 0.75rem",
              borderRadius: "0.5rem",
              background: "var(--color-bg-elevated, #1f2937)",
              color: "var(--color-text-inverse, #f9fafb)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
              fontSize: "0.8125rem",
              lineHeight: 1.5,
            }}
          >
            {/* Arrow */}
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                bottom: -6,
                left: "50%",
                transform: "translateX(-50%)",
                width: 0,
                height: 0,
                borderLeft: "6px solid transparent",
                borderRight: "6px solid transparent",
                borderTop: "6px solid var(--color-bg-elevated, #1f2937)",
              }}
            />
            {tooltipText}
          </div>
        )}
      </div>

      {releaseError && (
        <span
          role="alert"
          style={{ fontSize: "0.8125rem", color: "var(--color-error, #dc2626)" }}
        >
          {releaseError}
        </span>
      )}
    </div>
  );
}
