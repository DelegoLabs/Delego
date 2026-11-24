import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

const { downloadCsvMock } = vi.hoisted(() => ({
  downloadCsvMock: vi.fn(),
}));

vi.mock("../../../lib/csv", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/csv")>();
  return { ...actual, downloadCsv: downloadCsvMock };
});

describe("WeeklyReportPage", () => {
  beforeEach(() => {
    downloadCsvMock.mockClear();
  });

  it("renders KPI cards, a daily spend sparkline, and the top delegations table", () => {
    render(<WeeklyReportPage />);
    expect(screen.getByText("Weekly report")).toBeDefined();
    expect(screen.getByText("Total spend")).toBeDefined();
    expect(screen.getAllByText("1.00 XLM").length).toBeGreaterThan(0);
    expect(screen.getByText("del-1")).toBeDefined();
    expect(
      screen.getByRole("img", { name: /daily spend over 7 days/i })
    ).toBeDefined();
  });

  it("downloads the report as CSV", async () => {
    const user = userEvent.setup();
    render(<WeeklyReportPage />);

    await user.click(screen.getByRole("button", { name: /download csv/i }));

    expect(downloadCsvMock).toHaveBeenCalledTimes(1);
    const [filename, content] = downloadCsvMock.mock.calls[0];
    expect(filename).toMatch(/^delego-weekly-report-.*\.csv$/);
    expect(content).toContain("Section,Label,Value,Detail");
    expect(content).toContain("del-1");
  });
});
