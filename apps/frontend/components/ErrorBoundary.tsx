"use client";

import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

// ─── Error-logging hook point ─────────────────────────────────────────────────

/**
 * Typed hook point for error reporting. Drop in a Sentry call here when ready:
 *
 * ```ts
 * import * as Sentry from "@sentry/nextjs";
 *
 * export const reportError: ErrorReporter = (error, info, context) => {
 *   Sentry.withScope((scope) => {
 *     scope.setTag("component_context", context ?? "unknown");
 *     scope.setExtra("componentStack", info?.componentStack);
 *     Sentry.captureException(error);
 *   });
 * };
 * ```
 */
export type ErrorReporter = (
  error: Error,
  info: ErrorInfo | null,
  /** Display name / label of the subtree, for breadcrumb context. */
  context?: string
) => void;

/** Default reporter: structured console output only. */
export const defaultErrorReporter: ErrorReporter = (error, info, context) => {
  console.error(
    `[ErrorBoundary]${context ? ` (${context})` : ""} caught render error:`,
    error,
    info?.componentStack ?? ""
  );
};

// ─── Props & state ────────────────────────────────────────────────────────────

export interface ErrorBoundaryProps {
  children: ReactNode;
  /**
   * Short label shown in the fallback card title and passed to the reporter
   * for breadcrumb context (e.g. "SpendSimulatorPanel").
   */
  context?: string;
  /**
   * Override the default error reporter. Receives the raw Error, React's
   * ErrorInfo, and the context string.
   */
  onError?: ErrorReporter;
  /**
   * Optional custom fallback. When provided it replaces the default card.
   * Receives the caught error and a `retry` callback.
   */
  fallback?: (error: Error, retry: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

// ─── ErrorBoundary class component ───────────────────────────────────────────

/**
 * Granular error boundary — wraps an individual widget subtree so a render
 * error degrades that widget in-place without blanking sibling components.
 *
 * Usage:
 * ```tsx
 * <ErrorBoundary context="SpendSimulatorPanel">
 *   <SpendSimulatorPanel delegationId={id} />
 * </ErrorBoundary>
 * ```
 *
 * Retry remounts only the wrapped subtree by incrementing a key on the inner
 * wrapper, leaving all siblings completely unaffected.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, State> {
  /** Incremented on retry to remount the subtree. */
  private retryKey = 0;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    const reporter = this.props.onError ?? defaultErrorReporter;
    reporter(error, info, this.props.context);
  }

  private handleRetry = (): void => {
    this.retryKey += 1;
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;

    if (error) {
      if (this.props.fallback) {
        return this.props.fallback(error, this.handleRetry);
      }
      return (
        <ErrorFallbackCard
          context={this.props.context}
          error={error}
          onRetry={this.handleRetry}
        />
      );
    }

    // Wrap children in a keyed fragment so retry causes a full remount of
    // only this subtree without affecting anything outside the boundary.
    return (
      <ErrorSubtree key={this.retryKey}>
        {this.props.children}
      </ErrorSubtree>
    );
  }
}

// Simple wrapper component whose only job is to carry the retry key.
function ErrorSubtree({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

// ─── Default fallback card ────────────────────────────────────────────────────

interface ErrorFallbackCardProps {
  context?: string;
  error: Error;
  onRetry: () => void;
}

/**
 * Compact in-place fallback card.
 *
 * Styled entirely with Tailwind utility classes (including dark-mode variants)
 * so it works in any layout without CSS module coupling.
 */
function ErrorFallbackCard({ context, error, onRetry }: ErrorFallbackCardProps) {
  const title = context ? `${context} failed to load` : "Something went wrong";

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={[
        // Light mode
        "rounded-lg border border-red-200 bg-red-50 p-4",
        // Dark mode
        "dark:border-red-800 dark:bg-red-950",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <span
          className="mt-0.5 shrink-0 text-red-500 dark:text-red-400"
          aria-hidden="true"
        >
          ⚠
        </span>

        {/* Body */}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-red-800 dark:text-red-200">
            {title}
          </p>
          {process.env.NODE_ENV !== "production" && (
            <p className="mt-1 truncate text-xs text-red-600 dark:text-red-400">
              {error.message}
            </p>
          )}
        </div>

        {/* Retry button */}
        <button
          type="button"
          onClick={onRetry}
          className={[
            "shrink-0 rounded-md px-3 py-1.5 text-xs font-medium",
            "bg-red-100 text-red-800 hover:bg-red-200",
            "dark:bg-red-900 dark:text-red-200 dark:hover:bg-red-800",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500",
            "transition-colors duration-150",
          ].join(" ")}
        >
          Retry
        </button>
      </div>
    </div>
  );
}
