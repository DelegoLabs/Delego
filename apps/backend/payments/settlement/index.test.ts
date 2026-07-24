import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@delego/utils", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("../escrow/index.js", () => ({
  escrowService: {
    release: vi.fn(),
    initialize: vi.fn(),
    deposit: vi.fn(),
    refund: vi.fn(),
  },
}));

vi.mock("../events/index.js", () => ({
  publishPaymentEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../escrow/wallet-client.js", () => ({
  getTransactionFeeEstimate: vi.fn().mockResolvedValue({
    source: "horizon",
    baseFeeStroops: 100,
    recommendedFeeStroops: 150,
    percentile: "p95",
    fetchedAt: "2026-07-24T05:00:00.000Z",
  }),
}));

import { dryRunSettlement, type SettlementCommand } from "./index.js";
import { escrowService } from "../escrow/index.js";
import { publishPaymentEvent } from "../events/index.js";
import { getTransactionFeeEstimate } from "../escrow/wallet-client.js";

describe("settlement dry-run path", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, SETTLEMENT_SOURCE_ADDRESS: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFXYSFTXF4WZN2HNCTGI3" };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("successfully validates and simulates settlement without submission side effects", async () => {
    const result = await dryRunSettlement("order-8899");

    expect(result).toEqual({
      orderId: "order-8899",
      canSettle: true,
      simulationFee: "150",
    });

    // Ensure dry-run never submits to the transaction queue or emits events
    expect(escrowService.release).not.toHaveBeenCalled();
    expect(publishPaymentEvent).not.toHaveBeenCalled();
  });

  it("handles SettlementCommand object input correctly without side effects", async () => {
    const command: SettlementCommand = {
      orderId: "order-9900",
      escrowId: "12345",
      releaseTo: "GXXXXXX",
      amountStroops: "50000",
      deliveryProofId: "proof-1",
    };

    const result = await dryRunSettlement(command);

    expect(result).toEqual({
      orderId: "order-9900",
      canSettle: true,
      simulationFee: "150",
    });

    expect(escrowService.release).not.toHaveBeenCalled();
    expect(publishPaymentEvent).not.toHaveBeenCalled();
  });

  it("returns failure when orderId is empty or missing", async () => {
    const result = await dryRunSettlement("");

    expect(result).toEqual({
      orderId: "",
      canSettle: false,
      reason: "Invalid or missing order ID",
    });

    expect(escrowService.release).not.toHaveBeenCalled();
    expect(publishPaymentEvent).not.toHaveBeenCalled();
  });

  it("returns failure when SETTLEMENT_SOURCE_ADDRESS is not configured", async () => {
    delete process.env.SETTLEMENT_SOURCE_ADDRESS;

    const result = await dryRunSettlement("order-8899");

    expect(result).toEqual({
      orderId: "order-8899",
      canSettle: false,
      reason: "SETTLEMENT_SOURCE_ADDRESS environment variable is not configured",
    });

    expect(escrowService.release).not.toHaveBeenCalled();
    expect(publishPaymentEvent).not.toHaveBeenCalled();
  });

  it("returns failure when transaction simulation/fee estimation fails", async () => {
    vi.mocked(getTransactionFeeEstimate).mockRejectedValueOnce(
      new Error("Horizon node unreachable")
    );

    const result = await dryRunSettlement("order-8899");

    expect(result).toEqual({
      orderId: "order-8899",
      canSettle: false,
      reason: "Horizon node unreachable",
    });

    expect(escrowService.release).not.toHaveBeenCalled();
    expect(publishPaymentEvent).not.toHaveBeenCalled();
  });
});
