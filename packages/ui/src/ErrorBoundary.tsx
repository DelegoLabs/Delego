import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Shape handed to an error reporter. Kept separate from the raw
 * `Error`/`ErrorInfo` pair so a future Sentry-backed reporter can add
 * fields (e.g. `extra`, `tags`) without changing the boundary's API.
 */
export interface ErrorReport {
  error: Error;
  errorInfo: ErrorInfo;
  /** Name of the widget/subtree that threw, for grouping in logs. */
  componentName?: string;
}

/**
 * Typed hook point for error ingestion. Sentry wiring lands in a
 * separate PR — until then the default reporter just logs to console.
 * A future reporter (e.g. `(report) => Sentry.captureException(report.error,
 * { extra: { componentName: report.componentName, ...report.errorInfo } })`)
 * can be passed in via the `onError` prop without touching this file.
 */
export type ErrorReporter = (report: ErrorReport) => void;

const defaultReporter: ErrorReporter = ({ error, errorInfo, componentName }) => {
  console.error(
    `[ErrorBoundary${componentName ? `: ${componentName}` : ""}]`,
    error,
    errorInfo.componentStack,
  );
};

export interface ErrorBoundaryProps {
  children: ReactNode;
  /** Title shown on the fallback card. Defaults to a generic message. */
  title?: string;
  /** Name of the wrapped widget/subtree, used in logs and fallback copy. */
  componentName?: string;
  /** Override the default console reporter (e.g. to wire Sentry later). */
  onError?: ErrorReporter;
}

interface ErrorBoundaryState {
  error: Error | null;
  /** Bumped on retry so the subtree remounts fresh instead of reusing state that may have caused the throw. */
  resetKey: number;
}

/**
 * Catches render errors in its subtree and renders a compact fallback
 * card in place, instead of letting the error unmount ancestors and
 * blank the rest of the page. Intended to wrap one widget/panel at a
 * time (e.g. one dashboard card) so a single broken widget can't take
 * down its siblings.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, resetKey: 0 };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const report: ErrorReporter = this.props.onError ?? defaultReporter;
    report({ error, errorInfo, componentName: this.props.componentName });
  }

  handleRetry = () => {
    this.setState((prev) => ({ error: null, resetKey: prev.resetKey + 1 }));
  };

  render() {
    if (this.state.error) {
      const { title, componentName } = this.props;
      return (
        <div
          role="alert"
          style={{
            border: "1px solid var(--color-error-border, #fecaca)",
            borderRadius: "0.5rem",
            padding: "1rem",
            background: "var(--color-error-bg, #fee2e2)",
            color: "var(--color-error-text, #dc2626)",
          }}
        >
          <p style={{ margin: "0 0 0.5rem", fontWeight: 500 }}>
            {title ?? `Unable to load${componentName ? ` ${componentName}` : " this widget"}`}
          </p>
          <button
            type="button"
            onClick={this.handleRetry}
            style={{
              padding: "0.375rem 0.75rem",
              borderRadius: "0.375rem",
              border: "1px solid var(--color-error-text, #dc2626)",
              background: "transparent",
              color: "var(--color-error-text, #dc2626)",
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            Retry
          </button>
        </div>
      );
    }

    return <div key={this.state.resetKey}>{this.props.children}</div>;
  }
}
