import { describe, it, expect, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { SpendChart } from "./SpendChart";
import type { SpendBucket } from "../../lib/analytics";

const buckets: SpendBucket[] = [
  { bucketStart: "2026-01-01", label: "Jan 1", totalStroops: 10_000_000n },
  { bucketStart: "2026-01-02", label: "Jan 2", totalStroops: 30_000_000n },
];

function setConnection(overrides: { saveData?: boolean; effectiveType?: string } | undefined) {
  Object.defineProperty(navigator, "connection", {
    value: overrides,
    configurable: true,
  });
}

describe("SpendChart", () => {
  afterEach(() => setConnection(undefined));

  it("shows the empty state when there is no spend", () => {
    setConnection(undefined);
    render(<SpendChart buckets={[]} />);
    expect(screen.getByText("No spending in the selected range.")).toBeDefined();
  });

  it("renders the recharts-backed chart by default", () => {
    setConnection(undefined);
    const { container } = render(<SpendChart buckets={buckets} />);
    expect(screen.queryByTestId("spend-chart-summary")).toBeNull();
    // The recharts chunk is dynamically imported with ssr:false, so in a
    // synchronous jsdom render only its loading skeleton is guaranteed to
    // be present — confirm we did NOT take the reduced-mode summary path.
    expect(container.querySelector(".spend-chart-skeleton")).not.toBeNull();
  });

  it("shows summary numbers instead of the chart in reduced (data saver) mode (#623)", async () => {
    setConnection({ saveData: true });
    render(<SpendChart buckets={buckets} />);

    const summary = await screen.findByTestId("spend-chart-summary");
    expect(summary).toBeDefined();
    expect(screen.getByText("Total spend")).toBeDefined();
    expect(screen.getByText("4.00 XLM")).toBeDefined();
    expect(screen.getByText("Highest (Jan 2)")).toBeDefined();
    expect(screen.getByText("3.00 XLM")).toBeDefined();
  });
});
