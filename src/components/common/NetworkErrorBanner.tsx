"use client";

import React, { useEffect, useState } from "react";

export interface NetworkErrorBannerProps {
  /** Error message returned from the failed submission or upload */
  error: string | null;
  /** Whether a retry attempt is currently in progress */
  isRetrying?: boolean;
  /** Callback triggered when the user clicks the Retry button */
  onRetry: () => void;
  /** Optional dismissal handler */
  onDismiss?: () => void;
  /** Contextual label for the action (e.g., "onboarding step" or "escrow evidence") */
  contextLabel?: string;
}

export function NetworkErrorBanner({
  error,
  isRetrying = false,
  onRetry,
  onDismiss,
  contextLabel = "submission",
}: NetworkErrorBannerProps) {
  const [isOffline, setIsOffline] = useState<boolean>(
    typeof navigator !== "undefined" ? !navigator.onLine : false
  );

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (!isOffline && !error) {
    return null;
  }

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="my-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950 shadow-sm"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span
              className={`inline-block h-2.5 w-2.5 rounded-full ${
                isOffline ? "bg-red-600 animate-pulse" : "bg-amber-600"
              }`}
              aria-hidden="true"
            />
            <h4 className="text-sm font-semibold">
              {isOffline
                ? "You are currently offline"
                : `Network error during ${contextLabel}`}
            </h4>
          </div>

          <p className="text-xs text-amber-900">
            {isOffline
              ? "Your entered form inputs and selected files have been preserved. Reconnect to the internet and retry when ready."
              : error ||
                "A connection issue interrupted your request. Your form inputs are safely preserved."}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onRetry}
            disabled={isOffline || isRetrying}
            className="rounded-md bg-amber-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isRetrying ? "Retrying..." : "Retry"}
          </button>

          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              disabled={isRetrying}
              className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 transition hover:bg-amber-100 disabled:opacity-50"
            >
              Dismiss
            </button>
          )}
        </div>
      </div>
    </div>
  );
}