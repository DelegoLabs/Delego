import { computeAssetRevenueBreakdowns, PayoutRecord, EscrowOrderRecord } from "../merchantPayouts";

describe("computeAssetRevenueBreakdowns", () => {
  it("correctly aggregates settled volumes, pending escrows, and USD benchmarks across USDC, EURC, and XLM", () => {
    const mockPayouts: PayoutRecord[] = [
      {
        id: "p1",
        escrowId: "e1",
        amountStroops: "100000000", // 10 USDC
        feeStroops: "1000000",      // 0.1 USDC fee
        currency: "USDC",
        transactionHash: "tx1",
        ledgerClosedAt: "2023-01-01",
      },
      {
        id: "p2",
        escrowId: "e2",
        amountStroops: "500000000", // 50 XLM
        feeStroops: "5000000",      // 0.5 XLM fee
        currency: "XLM",
        transactionHash: "tx2",
        ledgerClosedAt: "2023-01-02",
      },
    ];

    const mockEscrows: EscrowOrderRecord[] = [
      {
        id: "o1",
        totalStroops: "200000000", // 20 EURC pending
        token: "EURC",
        status: "funded",
      },
      {
        id: "o2",
        totalStroops: "50000000",  // 5 USDC refunded
        token: "USDC",
        status: "refunded",
      },
    ];

    const breakdowns = computeAssetRevenueBreakdowns(mockPayouts, mockEscrows);

    const usdc = breakdowns.find(b => b.assetCode === "USDC");
    const eurc = breakdowns.find(b => b.assetCode === "EURC");
    const xlm = breakdowns.find(b => b.assetCode === "XLM");

    expect(usdc).toBeDefined();
    expect(usdc?.settledVolumeStroops).toBe("99000000"); // 99000000 stroops (9.9 USDC)
    expect(usdc?.refundedVolumeStroops).toBe("50000000");
    expect(usdc?.fiatEquivalentUsd).toBe(9.9);

    expect(eurc).toBeDefined();
    expect(eurc?.pendingEscrowVolumeStroops).toBe("200000000");
    expect(eurc?.settledVolumeStroops).toBe("0");
    expect(eurc?.fiatEquivalentUsd).toBe(0);

    expect(xlm).toBeDefined();
    expect(xlm?.settledVolumeStroops).toBe("495000000"); // 49.5 XLM net
    expect(xlm?.fiatEquivalentUsd).toBe(5.94); // 49.5 * 0.12
  });
});
