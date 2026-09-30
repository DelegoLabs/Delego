"use client";

import { useCallback, useState } from "react";
import { Button } from "@delegolabs/ui";
import { useNow } from "../../hooks/useNow";
import {
  formatGraceCountdown,
  getAutoReleaseGraceRemainingMs,
  isAutoReleaseGraceExpired,
} from "../../lib/autoReleaseGrace";

export interface AutoReleaseGraceBannerProps {
  /** Server-issued deadline for the grace window (ISO-8601). */
  graceExpiresAt: string;
  /** Halts the pending escrow payout. Resolving dismisses the banner. */
  onPauseRelease: () => Promise<void>;
  orderId: string;
}

/**
 * Fixed top alert banner shown between an auto-release being scheduled and the
 * payout actually firing (#715).
 *
 * - Counts down in whole seconds against `graceExpiresAt` (server time, not
 *   client-relative) via the shared `useNow` tick.
 * - "Pause & Dispute" halts the payout; the banner clears on success, and a
 *   failure keeps it visible with the error so the buyer can retry.
 * - Auto-dismisses the moment the window closes, without a round-trip.
 */
export function AutoReleaseGraceBanner({
  graceExpiresAt,
  onPauseRelease,
  orderId,
}: AutoReleaseGraceBannerProps) {
  const now = useNow(1_000);
  const [pausing, setPausing] = useState(false);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remainingMs = getAutoReleaseGraceRemainingMs(graceExpiresAt, now);
  const expired = isAutoReleaseGraceExpired(graceExpiresAt, now);

  const handlePause = useCallback(async () => {
    if (pausing) return;
    setPausing(true);
    setError(null);
    try {
      await onPauseRelease();
      setPaused(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not pause this release. Please try again."
      );
    } finally {
      setPausing(false);
    }
  }, [pausing, onPauseRelease]);

  // Auto-dismiss once the grace window lapses (or the payout has been paused).
  if (paused || expired) return null;

  return (
    <div
      role="alert"
      data-testid="auto-release-grace-banner"
      className="auto-release-grace-banner"
    >
      <div className="auto-release-grace-banner__inner">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
          style={{ flexShrink: 0 }}
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>

        <p className="auto-release-grace-banner__copy">
          Order <strong>{orderId}</strong> will auto-release escrow in{" "}
          <strong data-testid="auto-release-grace-countdown">
            {formatGraceCountdown(remainingMs)}
          </strong>
          . Pause it if your package has not arrived.
        </p>

        <Button
          variant="primary"
          size="sm"
          onClick={() => void handlePause()}
          disabled={pausing}
          loading={pausing}
        >
          {pausing ? "Pausing…" : "Pause & Dispute"}
        </Button>
      </div>

      {error && (
        <p role="alert" className="auto-release-grace-banner__error">
          {error}
        </p>
      )}
    </div>
  );
}
