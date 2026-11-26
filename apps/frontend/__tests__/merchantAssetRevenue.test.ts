import { describe, it, expect } from "vitest";
import { computeAssetRevenueBreakdowns, normalizeAssetCode } from "../lib/merchantPayouts";
import { PayoutRecord } from "../lib/merchantPayouts";
import { Escrow } from "@delegolabs/types";

describe("Merchant Asset Revenue Breakdown", () => {
  it("normalizes asset codes correctly", () => {
    expect(normalizeAssetCode("USDC")).toBe("USDC");
    expect(normalizeAssetCode("EURC")).toBe("EURC");
    expect(normalizeAssetCode("XLM")).toBe("XLM");
    expect(normalizeAssetCode("native")).toBe("XLM");
    expect(normalizeAssetCode(undefined)).toBe("XLM");
  });

  it("accurately aggregates settled earnings and pending escrows per asset", () => {
    const mockPayouts: PayoutRecord[] = [
      {
        id: "p1",
        escrowId: "e1",
        amountStroops: "100000000", // 10 USDC
        feeStroops: "1000000",      // 0.1 USDC fee
        currency: "USDC",
        transactionHash: "tx1",
        ledgerClosedAt: "2025-01-01T00:00:00Z",
        assetCode: "USDC",
      },
      {
        id: "p2",
        escrowId: "e2",
        amountStroops: "500000000", // 50 EURC
        feeStroops: "5000000",      // 0.5 EURC fee
        currency: "EURC",
        transactionHash: "tx2",
        ledgerClosedAt: "2025-01-02T00:00:00Z",
        assetCode: "EURC",
      },
    ];

    const mockEscrows: Escrow[] = [
      {
        escrowId: "e3",
        orderId: "o3",
        buyer: "G1",
        seller: "G2",
        amount: "200000000", // 20 USDC pending
        status: "funded",
        token: "USDC",
        createdAt: "2025-01-03T00:00:00Z",
      },
      {
        escrowId: "e4",
        orderId: "o4",
        buyer: "G1",
        seller: "G2",
        amount: "300000000", // 30 XLM refunded
        status: "refunded",
        token: "XLM",
        createdAt: "2025-01-03T00:00:00Z",
      },
    ];

    const breakdowns = computeAssetRevenueBreakdowns(mockPayouts, mockEscrows);

    const usdc = breakdowns.find((b) => b.assetCode === "USDC");
    const eurc = breakdowns.find((b) => b.assetCode === "EURC");
    const xlm = breakdowns.find((b) => b.assetCode === "XLM");

    expect(usdc).toBeDefined();
    expect(usdc?.settledVolumeStroops).toBe("99000000"); // 100M - 1M
    expect(usdc?.pendingEscrowVolumeStroops).toBe("200000000");
    expect(usdc?.fiatEquivalentUsd).toBe(9.9);

    expect(eurc).toBeDefined();
    expect(eurc?.settledVolumeStroops).toBe("495000000"); // 500M - 5M
    expect(eurc?.pendingEscrowVolumeStroops).toBe("0");
    expect(eurc?.fiatEquivalentUsd).toBeGreaterThan(0);

    expect(xlm).toBeDefined();
    expect(xlm?.settledVolumeStroops).toBe("0");
    expect(xlm?.refundedVolumeStroops).toBe("300000000");
  });
});
