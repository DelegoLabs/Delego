"use client";

import type { CSSProperties } from "react";
import {
  ErrorRecoveryCard,
  type RecoverableError,
} from "../components/ErrorRecoveryCard";

const bodyStyle: CSSProperties = {
  margin: 0,
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "3rem 1rem",
  boxSizing: "border-box",
  background: "#f9fafb",
  fontFamily:
    "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
};

/**
 * Root-layout error boundary — catches errors the layout itself throws and
 * therefore replaces the whole document, so it must render its own
 * <html>/<body> (#511, #747). The recovery controls live in the shared
 * `ErrorRecoveryCard` so route and root failures behave identically.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: RecoverableError;
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={bodyStyle}>
        <ErrorRecoveryCard error={error} reset={reset} boundary="global-error" />
      </body>
    </html>
  );
}
