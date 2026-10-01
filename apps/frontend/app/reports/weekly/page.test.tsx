import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import WeeklyReportPage from "./page";

vi.mock("../../../hooks/useOrders", () => ({
  useOrders: () => ({
    orders: [
      {
        id: "o1",
        delegationId: "del-1",
        status: "settled",
        lineItems: [],
        totalStroops: 10_000_000n,
        // The report window is `[now - 7d, now)` with an exclusive upper
        // bound, so an order created at exactly `now` drops out whenever the
        // page's clock and this factory land in the same millisecond. An hour
        // old keeps the order firmly inside the window.
        createdAt: new Date(Date.now() - 60 * 60 * 1000),
      },
    ],
    loading: false,
  }),
}));

vi.mock("../../../hooks/useQueryParamState", () => ({
  useQueryParamState: () => [1, vi.fn(), { hydrated: true }],
}));

describe("WeeklyReportPage", () => {
  it("renders KPI cards and the top delegations table", () => {
    render(<WeeklyReportPage />);
    expect(screen.getByText("Weekly report")).toBeDefined();
    expect(screen.getByText("Total spend")).toBeDefined();
    expect(screen.getAllByText("1.00 XLM").length).toBeGreaterThan(0);
    expect(screen.getByText("del-1")).toBeDefined();
  });
});
