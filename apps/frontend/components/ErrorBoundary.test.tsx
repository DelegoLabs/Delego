/**
 * ErrorBoundary unit tests
 *
 * Key assertions:
 *   1. A throw inside one widget renders the in-place fallback card.
 *   2. Sibling components outside the boundary remain fully interactive.
 *   3. The Retry button remounts only the failed subtree.
 *   4. The onError reporter receives the error, ErrorInfo, and context string.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { ErrorBoundary } from "./ErrorBoundary";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Suppress the noisy React error overlay in jsdom during intentional throws. */
beforeAll(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterAll(() => {
  vi.restoreAllMocks();
});

/** A component that throws unconditionally on render. */
function AlwaysThrows(): never {
  throw new Error("Intentional test error");
}

/** A component that can be toggled to throw. */
function TogglableThrow({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error("Toggled error");
  return <div>Widget content</div>;
}

/** A sibling that counts its own renders to prove it wasn't remounted. */
function StableSibling() {
  const [count, setCount] = useState(0);
  return (
    <button type="button" onClick={() => setCount((c) => c + 1)}>
      Sibling clicks: {count}
    </button>
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("ErrorBoundary", () => {
  it("renders children when no error occurs", () => {
    render(
      <ErrorBoundary context="TestWidget">
        <div>Normal content</div>
      </ErrorBoundary>
    );
    expect(screen.getByText("Normal content")).toBeInTheDocument();
  });

  it("renders the fallback card when a child throws", () => {
    render(
      <ErrorBoundary context="BrokenWidget">
        <AlwaysThrows />
      </ErrorBoundary>
    );
    // The fallback card title contains the context name.
    expect(
      screen.getByText(/BrokenWidget failed to load/i)
    ).toBeInTheDocument();
    // A Retry button is present.
    expect(
      screen.getByRole("button", { name: /retry/i })
    ).toBeInTheDocument();
  });

  it("sibling components outside the boundary remain interactive after a child throws", () => {
    render(
      <div>
        {/* This sibling is OUTSIDE the boundary and must stay alive. */}
        <StableSibling />

        <ErrorBoundary context="BrokenWidget">
          <AlwaysThrows />
        </ErrorBoundary>
      </div>
    );

    // Fallback is shown for the broken widget.
    expect(screen.getByText(/BrokenWidget failed to load/i)).toBeInTheDocument();

    // The sibling is still rendered and clickable.
    const siblingButton = screen.getByRole("button", {
      name: /Sibling clicks: 0/i,
    });
    expect(siblingButton).toBeInTheDocument();

    fireEvent.click(siblingButton);
    expect(
      screen.getByRole("button", { name: /Sibling clicks: 1/i })
    ).toBeInTheDocument();
  });

  it("retry remounts only the failed subtree, leaving siblings untouched", () => {
    const { rerender } = render(
      <div>
        <StableSibling />
        <ErrorBoundary context="RetryWidget">
          <AlwaysThrows />
        </ErrorBoundary>
      </div>
    );

    // Click sibling first to set its state to 1.
    const siblingButton = screen.getByRole("button", {
      name: /Sibling clicks: 0/i,
    });
    fireEvent.click(siblingButton);
    expect(
      screen.getByRole("button", { name: /Sibling clicks: 1/i })
    ).toBeInTheDocument();

    // Fallback is shown.
    expect(screen.getByText(/RetryWidget failed to load/i)).toBeInTheDocument();

    // Click Retry — the ErrorBoundary remounts its subtree.
    // AlwaysThrows will throw again immediately, so the fallback reappears.
    const retryButton = screen.getByRole("button", { name: /retry/i });
    fireEvent.click(retryButton);

    // Fallback still shown (component keeps throwing).
    expect(screen.getByText(/RetryWidget failed to load/i)).toBeInTheDocument();

    // Sibling state was NOT reset — it's still at 1 because retry only
    // remounted the ErrorBoundary's inner subtree.
    expect(
      screen.getByRole("button", { name: /Sibling clicks: 1/i })
    ).toBeInTheDocument();
  });

  it("calls the onError reporter with error, errorInfo, and context", () => {
    const reporter = vi.fn();

    render(
      <ErrorBoundary context="ReportedWidget" onError={reporter}>
        <AlwaysThrows />
      </ErrorBoundary>
    );

    expect(reporter).toHaveBeenCalledOnce();
    const [errorArg, infoArg, contextArg] = reporter.mock.calls[0];
    expect(errorArg).toBeInstanceOf(Error);
    expect(errorArg.message).toBe("Intentional test error");
    // ErrorInfo has a componentStack string.
    expect(typeof infoArg?.componentStack).toBe("string");
    expect(contextArg).toBe("ReportedWidget");
  });

  it("uses a custom fallback render prop when provided", () => {
    const customFallback = vi.fn((_err: Error, retry: () => void) => (
      <button type="button" onClick={retry}>
        Custom retry
      </button>
    ));

    render(
      <ErrorBoundary context="CustomWidget" fallback={customFallback}>
        <AlwaysThrows />
      </ErrorBoundary>
    );

    expect(customFallback).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("button", { name: /custom retry/i })
    ).toBeInTheDocument();
  });
});
