import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExpenseReportExportModal } from "./ExpenseReportExportModal";
import type { ExportableOrder } from "../../lib/expenseReport";

const ORDERS: ExportableOrder[] = [
  {
    id: "order-1",
    escrowId: "escrow-1",
    merchantId: "Acme",
    category: "electronics",
    totalStroops: 25_000_000n,
    txHash: "hash-1",
    createdAt: new Date("2026-02-10T12:00:00.000Z"),
  },
  {
    id: "order-2",
    escrowId: null,
    merchantId: "Pixel Store",
    category: "digital",
    totalStroops: 5_000_000n,
    txHash: null,
    createdAt: new Date("2026-01-05T12:00:00.000Z"),
  },
];

function renderModal(overrides: Partial<React.ComponentProps<typeof ExpenseReportExportModal>> = {}) {
  const onClose = vi.fn();
  render(
    <ExpenseReportExportModal
      isOpen
      orders={ORDERS}
      categories={["digital", "electronics"]}
      onClose={onClose}
      {...overrides}
    />
  );
  return { onClose };
}

let anchorClicks: string[] = [];

beforeEach(() => {
  anchorClicks = [];
  window.localStorage.clear();
  // jsdom ships neither of these, and `lib/download.ts` calls both directly.
  Object.defineProperty(URL, "createObjectURL", {
    value: vi.fn(() => "blob:report"),
    configurable: true,
    writable: true,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    value: vi.fn(),
    configurable: true,
    writable: true,
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement
  ) {
    anchorClicks.push(this.download);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(URL, "createObjectURL");
  Reflect.deleteProperty(URL, "revokeObjectURL");
});

describe("ExpenseReportExportModal", () => {
  it("renders nothing while closed", () => {
    renderModal({ isOpen: false });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("is announced as a labelled dialog", () => {
    renderModal();
    expect(
      screen.getByRole("dialog", { name: "Export expense report" })
    ).toBeInTheDocument();
  });

  it("offers a checkbox for every exportable column", () => {
    renderModal();
    for (const label of [
      "Order ID",
      "Escrow ID",
      "Date",
      "Merchant",
      "Category",
      "Amount (XLM)",
      "Transaction hash",
    ]) {
      expect(screen.getByRole("checkbox", { name: label })).toBeInTheDocument();
    }
  });

  it("starts with every column selected and CSV as the format", () => {
    renderModal();
    expect(screen.getByRole("checkbox", { name: "Order ID" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "CSV" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "JSON" })).not.toBeChecked();
  });

  it("provides start and end date pickers", () => {
    renderModal();
    expect(screen.getByLabelText("Start date")).toBeInTheDocument();
    expect(screen.getByLabelText("End date")).toBeInTheDocument();
    expect(screen.getByLabelText<HTMLInputElement>("Start date").type).toBe("date");
    expect(screen.getByLabelText<HTMLInputElement>("End date").type).toBe("date");
  });

  it("shows a category filter built from the supplied categories", async () => {
    const user = userEvent.setup();
    renderModal();

    const select = screen.getByLabelText("Category filter");
    await user.selectOptions(select, "digital");
    expect(screen.getByLabelText<HTMLSelectElement>("Category filter").value).toBe(
      "digital"
    );
  });

  it("omits the category filter when there are no categories", () => {
    renderModal({ categories: [] });
    expect(screen.queryByLabelText("Category filter")).not.toBeInTheDocument();
    // The "Category" *column* checkbox is still offered.
    expect(screen.getByRole("checkbox", { name: "Category" })).toBeInTheDocument();
  });

  // ─── Column selection ─────────────────────────────────────────────────────

  it("disables Download once no columns are selected", async () => {
    const user = userEvent.setup();
    renderModal();

    for (const label of [
      "Order ID",
      "Escrow ID",
      "Date",
      "Merchant",
      "Category",
      "Amount (XLM)",
      "Transaction hash",
    ]) {
      await user.click(screen.getByRole("checkbox", { name: label }));
    }

    expect(screen.getByRole("button", { name: "Download" })).toBeDisabled();
  });

  it("counts the selected columns", async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole("checkbox", { name: "Escrow ID" }));
    expect(screen.getByText("Columns (6 selected)")).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Escrow ID" }));
    expect(screen.getByText("Columns (7 selected)")).toBeInTheDocument();
  });

  // ─── Download ─────────────────────────────────────────────────────────────

  it("downloads a CSV and confirms how many rows were written", async () => {
    const user = userEvent.setup();
    renderModal();

    // The default range is "one year ago → today", so derive the expected
    // filename from what the pickers actually show rather than hardcoding it.
    const start = screen.getByLabelText<HTMLInputElement>("Start date").value;
    const end = screen.getByLabelText<HTMLInputElement>("End date").value;

    await user.click(screen.getByRole("button", { name: "Download" }));

    expect(anchorClicks).toEqual([`delego-expenses-${start}-to-${end}.csv`]);
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/Exported \d+ rows?\./)
    );
  });

  it("switches the downloaded extension when JSON is chosen", async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole("radio", { name: "JSON" }));
    await user.click(screen.getByRole("button", { name: "Download" }));

    expect(anchorClicks[0]).toMatch(/\.json$/);
  });

  it("narrows the exported range with the date pickers", async () => {
    const user = userEvent.setup();
    renderModal();

    // `fireEvent.change` is used for <input type="date"> because jsdom has no
    // date-entry keyboard model — userEvent's segment typing is unreliable here.
    fireEvent.change(screen.getByLabelText("Start date"), {
      target: { value: "2026-02-01" },
    });
    fireEvent.change(screen.getByLabelText("End date"), {
      target: { value: "2026-02-28" },
    });
    await user.click(screen.getByRole("button", { name: "Download" }));

    expect(anchorClicks[0]).toBe("delego-expenses-2026-02-01-to-2026-02-28.csv");
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Exported 1 row.")
    );
  });

  it("closes on Cancel", async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
