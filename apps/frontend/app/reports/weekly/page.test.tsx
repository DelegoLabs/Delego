import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WeeklyReportPage from "./page";

const { reportNow } = vi.hoisted(() => ({
  reportNow: new Date("2026-06-22T12:00:00Z"),
}));

vi.mock("next-intl", () => ({ useLocale: () => "en-GB" }));

vi.mock("../../../hooks/useNow", () => ({
  useNow: () => reportNow,
}));

vi.mock("../../../hooks/useOrders", () => ({
  useOrders: () => ({
    orders: [
      {
        id: "o1",
        delegationId: "del-1",
        status: "settled",
        lineItems: [],
        totalStroops: 10_000_000n,
        createdAt: new Date("2026-06-21T12:00:00Z"),
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

  it("formats the report period using the active locale", () => {
    render(<WeeklyReportPage />);

    expect(screen.getByText("15 Jun 2026 – 22 Jun 2026")).toBeDefined();
  });
});
