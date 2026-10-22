import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PayoutHistoryTable } from "../PayoutHistoryTable";
import type { PayoutRecord } from "../../lib/merchantPayouts";
import { downloadCsv } from "../../lib/csv";

vi.mock("../../lib/csv", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/csv")>()),
  downloadCsv: vi.fn(),
}));

const HASH = "c".repeat(64);

function payout(i: number, overrides: Partial<PayoutRecord> = {}): PayoutRecord {
  return {
    id: `payout-${String(i).padStart(2, "0")}`,
    escrowId: `escrow-${i}`,
    orderId: `order-${i}`,
    amountStroops: "200000000", // 20
    feeStroops: "2000000", // 0.2
    currency: "USDC",
    transactionHash: HASH,
    ledgerClosedAt: `2026-02-${String(i).padStart(2, "0")}T10:00:00Z`,
    ...overrides,
  };
}

afterEach(() => {
  vi.mocked(downloadCsv).mockClear();
});

describe("PayoutHistoryTable", () => {
  it("shows gross, fee deduction and net payout per row and in the totals", () => {
    render(<PayoutHistoryTable payouts={[payout(1), payout(2)]} networkId="testnet" />);
    const row = screen.getByTestId("payout-row-payout-01");
    expect(within(row).getByText("20.0000000")).toBeInTheDocument();
    expect(within(row).getByText("−0.2000000")).toBeInTheDocument();
    expect(within(row).getByText("19.8000000")).toBeInTheDocument();

    const totals = screen.getByTestId("payout-totals-USDC");
    expect(within(totals).getByText("40.0000000")).toBeInTheDocument();
    expect(within(totals).getByText("39.6000000")).toBeInTheDocument();
  });

  it("deep-links transaction hashes to Stellar Expert and offers copy", () => {
    render(<PayoutHistoryTable payouts={[payout(1)]} networkId="mainnet" />);
    const link = screen.getByRole("link", { name: "Stellar Expert" });
    expect(link).toHaveAttribute("href", `https://stellar.expert/explorer/public/tx/${HASH}`);
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByRole("button", { name: "Copy transaction hash" })).toBeInTheDocument();
  });

  it("paginates newest first", () => {
    const payouts = Array.from({ length: 5 }, (_, i) => payout(i + 1));
    render(<PayoutHistoryTable payouts={payouts} networkId="testnet" pageSize={2} />);
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
    expect(screen.getByTestId("payout-row-payout-05")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByTestId("payout-row-payout-03")).toBeInTheDocument();
    expect(screen.queryByTestId("payout-row-payout-05")).toBeNull();
  });

  it("filters by date and exports only the filtered rows", () => {
    const download = vi.mocked(downloadCsv);
    render(
      <PayoutHistoryTable payouts={[payout(1), payout(2), payout(3)]} networkId="testnet" />
    );
    fireEvent.change(screen.getByLabelText("From (UTC)"), { target: { value: "2026-02-02" } });
    fireEvent.change(screen.getByLabelText("To (UTC)"), { target: { value: "2026-02-02" } });
    expect(screen.queryByTestId("payout-row-payout-01")).toBeNull();
    expect(screen.getByTestId("payout-row-payout-02")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    expect(download).toHaveBeenCalledTimes(1);
    const [filename, content] = download.mock.calls[0]!;
    expect(filename).toBe("delego-payouts-2026-02-02_to_2026-02-02.csv");
    const lines = (content as string).split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("payout-02,order-2,2026-02-02T10:00:00.000Z,USDC,20.0000000,0.2000000,19.8000000");
  });
});
