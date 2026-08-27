import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Escrow } from "@delegolabs/types";
import { StickyActionBar } from "./StickyActionBar";

const mockRequestExtension = vi.fn();
vi.mock("../../services/payments", () => ({
  requestExtension: (...args: unknown[]) => mockRequestExtension(...args),
}));

const mockDownloadCsv = vi.fn();
vi.mock("../../lib/csv", () => ({
  toCsv: (header: string[], rows: string[][]) => JSON.stringify({ header, rows }),
  downloadCsv: (...args: unknown[]) => mockDownloadCsv(...args),
}));

function makeEscrow(overrides: Partial<Escrow> = {}): Escrow {
  return {
    id: "escrow-1",
    escrowId: "escrow-1",
    orderId: "order-1",
    buyer: "buyer-1",
    seller: "seller-1",
    amount: 100n,
    status: "funded",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("StickyActionBar", () => {
  beforeEach(() => {
    mockRequestExtension.mockReset();
    mockDownloadCsv.mockReset();
  });

  it("renders nothing when nothing is selected", () => {
    const { container } = render(<StickyActionBar selected={[]} onClearSelection={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the selected count and release-eligible count", () => {
    const selected = [
      makeEscrow({ id: "a", status: "funded" }),
      makeEscrow({ id: "b", status: "released" }),
      makeEscrow({ id: "c", status: "funded" }),
    ];
    render(<StickyActionBar selected={selected} onClearSelection={vi.fn()} />);
    expect(screen.getByTestId("sticky-action-bar")).toHaveTextContent("3 selected");
    expect(screen.getByTestId("sticky-action-bar")).toHaveTextContent("2 release-eligible");
    expect(screen.getByRole("button", { name: "Release eligible (2)" })).toBeInTheDocument();
  });

  it("release only runs against eligible items, isolating an ineligible selection with a reason", async () => {
    const selected = [
      makeEscrow({ id: "a", status: "funded" }),
      makeEscrow({ id: "b", status: "disputed" }),
    ];
    const onReleaseOne = vi.fn(async () => "released");
    const user = userEvent.setup();

    render(<StickyActionBar selected={selected} onClearSelection={vi.fn()} onReleaseOne={onReleaseOne} />);
    await user.click(screen.getByRole("button", { name: "Release eligible (1)" }));

    await waitFor(() => expect(screen.getByTestId("batch-results-summary")).toBeInTheDocument());
    expect(onReleaseOne).toHaveBeenCalledTimes(1);
    expect(onReleaseOne).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }));
    expect(screen.getByTestId("batch-results-summary")).toHaveTextContent("1 succeeded, 0 failed, 1 skipped");
    expect(screen.getByTestId("batch-results-summary")).toHaveTextContent("Not release-eligible");
  });

  it("request extension reports per-item results, including a failed request", async () => {
    mockRequestExtension.mockImplementation(async (id: string) => {
      if (id === "b") return { data: null, error: { code: "chain_error", message: "Transaction rejected" } };
      return { data: { escrow: makeEscrow({ id }), timelineEvent: { id: "e", label: "x", timestamp: "2026-01-01T00:00:00.000Z" } }, error: null };
    });
    const selected = [makeEscrow({ id: "a" }), makeEscrow({ id: "b" })];
    const user = userEvent.setup();

    render(<StickyActionBar selected={selected} onClearSelection={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Request extension" }));

    await waitFor(() => expect(screen.getByTestId("batch-results-summary")).toBeInTheDocument());
    expect(screen.getByTestId("batch-results-summary")).toHaveTextContent("1 succeeded, 1 failed, 0 skipped");
    expect(screen.getByTestId("batch-results-summary")).toHaveTextContent("Transaction rejected");
  });

  it("export downloads a CSV of the selected escrows", async () => {
    const selected = [makeEscrow({ id: "a" })];
    const user = userEvent.setup();
    render(<StickyActionBar selected={selected} onClearSelection={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Export" }));
    expect(mockDownloadCsv).toHaveBeenCalledTimes(1);
  });

  it("clear invokes onClearSelection", async () => {
    const onClear = vi.fn();
    const user = userEvent.setup();
    render(<StickyActionBar selected={[makeEscrow()]} onClearSelection={onClear} />);
    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(onClear).toHaveBeenCalled();
  });
});
