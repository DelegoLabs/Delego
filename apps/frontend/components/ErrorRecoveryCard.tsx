"use client";

import { useEffect } from "react";
import type { CSSProperties } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * Error shape Next.js hands to `error.tsx` / `global-error.tsx`. On a server
 * render Next strips the message and adds a `digest` hash that correlates the
 * client-side report with the server log.
 */
export type RecoverableError = Error & { digest?: string };

/** Serializable, stack-free view of a recoverable error. */
export interface ErrorSummary {
  name: string;
  message: string;
  digest?: string;
}

export interface ErrorRecoveryCardProps {
  error: RecoverableError;
  /** Next.js `reset()` — re-renders the failed segment. */
  reset: () => void;
  /** Destination for "Return to Dashboard"; defaults to the app root. */
  dashboardHref?: string;
  /** Boundary identity — used as the Sentry tag and console prefix. */
  boundary?: string;
}

/**
 * Reduce an error to the metadata that is safe to display and log. The stack is
 * deliberately dropped so internal server paths and frame details cannot leak
 * into the UI or the console (#747).
 */
export function summarizeError(error: RecoverableError): ErrorSummary {
  const summary: ErrorSummary = {
    name: error.name || "Error",
    message: error.message || "",
  };
  if (error.digest) summary.digest = error.digest;
  return summary;
}

/**
 * Report a boundary error to both console and Sentry. The console receives the
 * stack-free summary plus the digest; Sentry receives the full exception (its
 * diagnostic value) tagged with the digest shown to the user, and the client
 * config's `beforeSend` still scrubs PII before transmission (#747).
 */
export function reportClientError(
  error: RecoverableError,
  boundary: string
): void {
  const summary = summarizeError(error);
  console.error(`[${boundary}] uncaught error`, summary);

  Sentry.withScope((scope) => {
    scope.setTag("error.boundary", boundary);
    if (summary.digest) {
      scope.setTag("error.digest", summary.digest);
      scope.setExtra("digest", summary.digest);
    }
    Sentry.captureException(error);
  });
}

const cardStyle: CSSProperties = {
  boxSizing: "border-box",
  width: "100%",
  maxWidth: "32rem",
  padding: "2rem 1.5rem",
  borderRadius: "0.75rem",
  border: "1px solid #e5e7eb",
  background: "#ffffff",
  boxShadow: "0 1px 3px rgba(0, 0, 0, 0.08)",
  textAlign: "center",
};

const titleStyle: CSSProperties = {
  margin: "0 0 0.5rem",
  fontSize: "1.25rem",
  fontWeight: 600,
  color: "#111827",
};

const descriptionStyle: CSSProperties = {
  margin: "0 0 1rem",
  fontSize: "0.9375rem",
  lineHeight: 1.5,
  color: "#4b5563",
};

const referenceStyle: CSSProperties = {
  margin: "0 0 1.5rem",
  fontSize: "0.8125rem",
  color: "#6b7280",
};

const codeStyle: CSSProperties = {
  padding: "0.125rem 0.375rem",
  borderRadius: "0.25rem",
  background: "#f3f4f6",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: "0.8125rem",
  color: "#111827",
};

const actionsStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.75rem",
  justifyContent: "center",
};

const primaryActionStyle: CSSProperties = {
  padding: "0.625rem 1.25rem",
  borderRadius: "0.375rem",
  border: "none",
  background: "#2563eb",
  color: "#ffffff",
  fontWeight: 500,
  fontSize: "0.9375rem",
  cursor: "pointer",
};

const secondaryActionStyle: CSSProperties = {
  display: "inline-block",
  padding: "0.625rem 1.25rem",
  borderRadius: "0.375rem",
  border: "1px solid #d1d5db",
  background: "transparent",
  color: "#111827",
  fontWeight: 500,
  fontSize: "0.9375rem",
  textDecoration: "none",
};

/**
 * Resilient, dependency-free recovery card shared by the route and root error
 * boundaries (#747). Renders an `aria-live` alert with a working `Try Again`
 * action, a `Return to Dashboard` link, and the server error digest — but never
 * the raw message or stack trace.
 */
export function ErrorRecoveryCard({
  error,
  reset,
  dashboardHref = "/",
  boundary = "global-error",
}: ErrorRecoveryCardProps) {
  useEffect(() => {
    reportClientError(error, boundary);
  }, [error, boundary]);

  const digest = error.digest;

  return (
    <section
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      data-testid="error-recovery-card"
      style={cardStyle}
    >
      <h1 style={titleStyle}>Something went wrong</h1>
      <p style={descriptionStyle}>
        An unexpected error stopped this page from loading. Nothing was lost —
        try again, or head back to the dashboard.
      </p>
      {digest ? (
        <p style={referenceStyle}>
          Error reference: <code style={codeStyle}>{digest}</code>
        </p>
      ) : null}
      <div style={actionsStyle}>
        <button type="button" onClick={reset} style={primaryActionStyle}>
          Try Again
        </button>
        {/* A plain anchor forces a full document reload, which clears any
            corrupted client state — and works even when the router itself is
            the thing that failed, unlike `next/link`. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- error boundary must not depend on the client router */}
        <a href={dashboardHref} style={secondaryActionStyle}>
          Return to Dashboard
        </a>
      </div>
    </section>
  );
}
