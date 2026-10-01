"use client";

import type { CSSProperties } from "react";
import {
  ErrorRecoveryCard,
  type RecoverableError,
} from "../components/ErrorRecoveryCard";

const wrapperStyle: CSSProperties = {
  minHeight: "60vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "3rem 1rem",
};

/**
 * Route-segment error boundary — renders inside the app shell and reuses the
 * shared recovery card so a segment failure offers the same `Try Again` and
 * `Return to Dashboard` actions as the root boundary (#511, #747).
 */
export default function Error({
  error,
  reset,
}: {
  error: RecoverableError;
  reset: () => void;
}) {
  return (
    <div style={wrapperStyle}>
      <ErrorRecoveryCard error={error} reset={reset} boundary="route-error" />
    </div>
  );
}
