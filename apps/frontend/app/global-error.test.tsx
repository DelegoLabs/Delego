// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import GlobalError from "./global-error";
import {
  ErrorRecoveryCard,
  type RecoverableError,
} from "../components/ErrorRecoveryCard";

// Vitest hoists `vi.mock` above the imports, so the spies must be created with
// `vi.hoisted` to be reachable from the factory.
const sentry = vi.hoisted(() => ({
  captureException: vi.fn(),
  setTag: vi.fn(),
  setExtra: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: sentry.captureException,
  withScope: (callback: (scope: unknown) => void) =>
    callback({ setTag: sentry.setTag, setExtra: sentry.setExtra }),
}));

const INTERNAL_PATH = "webpack-internal:///./app/internal-orders.ts:42";

function makeError(digest?: string): RecoverableError {
  const error = new Error(
    "database connection refused for internal table orders"
  ) as RecoverableError;
  error.stack = `Error: boom\n    at loadOrders (${INTERNAL_PATH})`;
  if (digest) error.digest = digest;
  return error;
}

describe("GlobalError recovery screen (#747)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders its own document containing the recovery controls", () => {
    const html = renderToStaticMarkup(
      <GlobalError error={makeError("digest-abc123")} reset={() => {}} />
    );

    expect(html).toContain("<html");
    expect(html).toContain("<body");
    expect(html).toContain("Something went wrong");
    expect(html).toContain("Try Again");
    expect(html).toContain("Return to Dashboard");
    expect(html).toContain("digest-abc123");
  });

  it("never renders the raw error message or stack trace", () => {
    const html = renderToStaticMarkup(
      <GlobalError error={makeError("digest-abc123")} reset={() => {}} />
    );

    expect(html).not.toContain("internal table orders");
    expect(html).not.toContain(INTERNAL_PATH);
  });

  it("announces the failure through an aria-live alert region", () => {
    render(<ErrorRecoveryCard error={makeError("digest-1")} reset={() => {}} />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveAttribute("aria-live", "assertive");
    expect(alert).toHaveAttribute("aria-atomic", "true");
  });

  it("invokes reset when Try Again is pressed", () => {
    const reset = vi.fn();
    render(<ErrorRecoveryCard error={makeError("digest-1")} reset={reset} />);

    fireEvent.click(screen.getByRole("button", { name: "Try Again" }));

    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("offers a Return to Dashboard link back to the app root", () => {
    render(<ErrorRecoveryCard error={makeError("digest-1")} reset={() => {}} />);

    expect(
      screen.getByRole("link", { name: "Return to Dashboard" })
    ).toHaveAttribute("href", "/");
  });

  it("honours a custom dashboard destination", () => {
    render(
      <ErrorRecoveryCard
        error={makeError("digest-1")}
        reset={() => {}}
        dashboardHref="/analytics"
      />
    );

    expect(
      screen.getByRole("link", { name: "Return to Dashboard" })
    ).toHaveAttribute("href", "/analytics");
  });

  it("reports the digest to Sentry and logs only stack-free metadata", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorRecoveryCard
        error={makeError("digest-xyz")}
        reset={() => {}}
        boundary="global-error"
      />
    );

    expect(sentry.captureException).toHaveBeenCalledTimes(1);
    expect(sentry.captureException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "database connection refused for internal table orders",
      })
    );
    expect(sentry.setTag).toHaveBeenCalledWith("error.boundary", "global-error");
    expect(sentry.setTag).toHaveBeenCalledWith("error.digest", "digest-xyz");

    const logged = consoleError.mock.calls
      .map((call) => call.map(String).join(" "))
      .join("\n");
    expect(logged).toContain("[global-error] uncaught error");
    expect(logged).toContain("digest-xyz");
    expect(logged).not.toContain(INTERNAL_PATH);
  });

  it("omits the error reference when no digest is provided", () => {
    render(<ErrorRecoveryCard error={makeError()} reset={() => {}} />);

    expect(screen.queryByText(/error reference/i)).not.toBeInTheDocument();
  });
});
