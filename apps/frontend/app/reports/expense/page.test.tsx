import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ExpenseReportPage from "./page";

const { downloadCsvMock, downloadBlobMock, generateExpenseReportPdfMock } =
  vi.hoisted(() => ({
    downloadCsvMock: vi.fn(),
    downloadBlobMock: vi.fn(),
    generateExpenseReportPdfMock: vi.fn(),
  }));

vi.mock("../../../hooks/useOrders", () => ({
  useOrders: () => ({
    orders: [
      {
        id: "order-1",
        merchantId: "merchant-a",
        category: "Travel",
        status: "settled",
        totalStroops: 10_000_000n,
        lineItems: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "order-2",
        merchantId: "merchant-b",
        category: "Electronics",
        status: "approved",
        totalStroops: 5_000_000n,
        lineItems: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    loading: false,
  }),
}));

vi.mock("../../../lib/download", () => ({ downloadBlob: downloadBlobMock }));
vi.mock("../../../lib/expenseReportPdf", () => ({
  generateExpenseReportPdf: generateExpenseReportPdfMock,
}));
vi.mock("../../../lib/csv", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../lib/csv")>();
  return { ...actual, downloadCsv: downloadCsvMock };
});

describe("ExpenseReportPage", () => {
  it("renders filter controls and a preview of matching orders", () => {
    render(<ExpenseReportPage />);

    expect(screen.getByText("Expense report")).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Quick date ranges" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Download PDF" })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("From")).toBeInTheDocument();
    expect(screen.getByLabelText("To")).toBeInTheDocument();
    expect(screen.getByLabelText("Format")).toHaveValue("csv");
    expect(screen.getByText("Preview (2 orders)")).toBeInTheDocument();
    expect(screen.getByText("order-1")).toBeInTheDocument();
    expect(screen.getAllByText("Travel").length).toBeGreaterThan(0);
  });

  it("lists categories and merchants derived from the orders", () => {
    render(<ExpenseReportPage />);
    expect(screen.getByRole("checkbox", { name: "Travel" })).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Electronics" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "merchant-a" })
    ).toBeInTheDocument();
  });

  it("narrows the preview when a category is selected", async () => {
    const user = userEvent.setup();
    render(<ExpenseReportPage />);

    await user.click(screen.getByRole("checkbox", { name: "Travel" }));

    expect(screen.getByText("Preview (1 orders)")).toBeInTheDocument();
    expect(screen.getByText("order-1")).toBeInTheDocument();
    expect(screen.queryByText("order-2")).not.toBeInTheDocument();
  });

  it("downloads a CSV by default and a JSON when selected", async () => {
    const user = userEvent.setup();
    render(<ExpenseReportPage />);

    await user.click(screen.getByRole("button", { name: /download csv/i }));

    expect(downloadCsvMock).toHaveBeenCalledTimes(1);
    const [filename, content] = downloadCsvMock.mock.calls[0];
    expect(filename).toMatch(/^delego-expense-report-.*\.csv$/);
    expect(content).toContain("order-1");

    await user.selectOptions(screen.getByLabelText("Format"), "json");
    await user.click(screen.getByRole("button", { name: /download json/i }));

    expect(downloadBlobMock).toHaveBeenCalledTimes(1);
  });

  it("applies inclusive local-calendar date presets", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2026, 4, 17, 12));
      render(<ExpenseReportPage />);

      fireEvent.click(screen.getByRole("button", { name: "Last 7 days" }));
      expect(screen.getByLabelText("From")).toHaveValue("2026-05-11");
      expect(screen.getByLabelText("To")).toHaveValue("2026-05-17");

      fireEvent.click(screen.getByRole("button", { name: "Last 30 days" }));
      expect(screen.getByLabelText("From")).toHaveValue("2026-04-18");
      expect(screen.getByLabelText("To")).toHaveValue("2026-05-17");

      fireEvent.click(screen.getByRole("button", { name: "This Month" }));
      expect(screen.getByLabelText("From")).toHaveValue("2026-05-01");
      expect(screen.getByLabelText("To")).toHaveValue("2026-05-17");

      fireEvent.click(screen.getByRole("button", { name: "Quarter-to-Date" }));
      expect(screen.getByLabelText("From")).toHaveValue("2026-04-01");
      expect(screen.getByLabelText("To")).toHaveValue("2026-05-17");
    } finally {
      vi.useRealTimers();
    }
  });

  it("exports the current report as PDF", async () => {
    const user = userEvent.setup();
    render(<ExpenseReportPage />);

    await user.click(screen.getByRole("button", { name: "Download PDF" }));

    expect(generateExpenseReportPdfMock).toHaveBeenCalledOnce();
    expect(generateExpenseReportPdfMock.mock.calls[0][0].orderCount).toBe(2);
  });
});
