"use client";

import { useState } from "react";
import { Button, Tooltip } from "@delego/ui";
import type { ReleaseEligibility } from "@delego/types";
import { RELEASE_INELIGIBILITY_LABEL, formatDuration } from "./releaseEligibilityReasons";

export interface ReleaseCtaProps {
  eligibility: ReleaseEligibility | undefined;
  isLoading: boolean;
  onRelease: () => void | Promise<void>;
}

/**
 * Disables the release CTA unless the contract's release-eligibility getter says so, and
 * explains exactly which condition is unmet in a tooltip. The submit handler re-checks
 * eligibility itself as a hard guard — the `disabled` attribute is not trusted alone.
 */
export function ReleaseCta({ eligibility, isLoading, onRelease }: ReleaseCtaProps) {
  const [submitting, setSubmitting] = useState(false);

  async function handleClick() {
    if (!eligibility || !eligibility.eligible) {
      return;
    }
    setSubmitting(true);
    try {
      await onRelease();
    } finally {
      setSubmitting(false);
    }
  }

  const disabled = isLoading || !eligibility || !eligibility.eligible || submitting;

  const button = (
    <Button variant="primary" onClick={handleClick} disabled={disabled}>
      {submitting ? "Releasing..." : "Release funds"}
    </Button>
  );

  if (isLoading || !eligibility || eligibility.eligible) {
    return button;
  }

  const reasonLines = eligibility.reasons.map((reason) => RELEASE_INELIGIBILITY_LABEL[reason]);
  const refundNote =
    eligibility.buyerRefundSecondsRemaining > 0
      ? `For context: buyer refund unlocks in ${formatDuration(eligibility.buyerRefundSecondsRemaining)}.`
      : null;

  return <Tooltip content={[...reasonLines, refundNote].filter(Boolean).join("\n")}>{button}</Tooltip>;
}
