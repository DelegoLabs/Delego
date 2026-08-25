import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { useState } from "react";
import { ErrorBoundary } from "./ErrorBoundary.js";

function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error("boom");
  }
  return <div>widget ok</div>;
}

function Counter() {
  const [count, setCount] = useState(0);
  return (
    <button onClick={() => setCount((c) => c + 1)}>clicked {count}</button>
  );
}

describe("ErrorBoundary", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // React logs the caught error to console in addition to componentDidCatch;
    // silence it so the expected-failure test doesn't look like a real one.
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    cleanup();
  });

  it("renders children when nothing throws", () => {
    render(
      <ErrorBoundary componentName="Widget">
        <div>widget ok</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText("widget ok")).toBeDefined();
  });

  it("renders a fallback card in place of a throwing subtree", () => {
    render(
      <ErrorBoundary componentName="Analytics chart">
        <Bomb shouldThrow />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toBeDefined();
    expect(screen.getByText("Unable to load Analytics chart")).toBeDefined();
    expect(screen.getByRole("button", { name: "Retry" })).toBeDefined();
  });

  it("leaves sibling subtrees interactive when one boundary catches an error", () => {
    render(
      <div>
        <ErrorBoundary componentName="Broken widget">
          <Bomb shouldThrow />
        </ErrorBoundary>
        <ErrorBoundary componentName="Healthy widget">
          <Counter />
        </ErrorBoundary>
      </div>,
    );

    expect(screen.getByRole("alert")).toBeDefined();

    const button = screen.getByRole("button", { name: /clicked 0/ });
    fireEvent.click(button);
    expect(screen.getByRole("button", { name: /clicked 1/ })).toBeDefined();
  });

  it("calls the onError hook with the error and component name", () => {
    const onError = vi.fn();
    render(
      <ErrorBoundary componentName="Wallet panel" onError={onError}>
        <Bomb shouldThrow />
      </ErrorBoundary>,
    );

    expect(onError).toHaveBeenCalledTimes(1);
    const report = onError.mock.calls[0][0];
    expect(report.componentName).toBe("Wallet panel");
    expect(report.error.message).toBe("boom");
  });

  it("remounts only the failed subtree on retry", () => {
    let shouldThrow = true;
    function Toggle() {
      return <Bomb shouldThrow={shouldThrow} />;
    }

    render(
      <ErrorBoundary componentName="Widget">
        <Toggle />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toBeDefined();

    shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(screen.getByText("widget ok")).toBeDefined();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
