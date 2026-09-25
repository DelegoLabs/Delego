import { describe, it, expect } from "vitest";
import { computeTimeoutRefundState, formatLedgerCountdown } from "./timeoutRefund";

describe("computeTimeoutRefundState", () => {
  it("blocks the refund before the timeout ledger", () => {
    const state = computeTimeoutRefundState(1_000, 1_120, "50000000");
    expect(state).toEqual({
      canRefund: false,
      currentLedger: 1_000,
      timeoutLedger: 1_120,
      remainingLedgers: 120,
      refundAmountStroops: "50000000",
    });
  });

  it("allows the refund once the timeout ledger is reached or passed", () => {
    expect(computeTimeoutRefundState(1_120, 1_120, "1").canRefund).toBe(true);
    const passed = computeTimeoutRefundState(1_500, 1_120, "1");
    expect(passed.canRefund).toBe(true);
    expect(passed.remainingLedgers).toBe(0);
  });
});

describe("formatLedgerCountdown", () => {
  it("formats ledgers as an approximate duration", () => {
    expect(formatLedgerCountdown(3)).toBe("~15s");
    expect(formatLedgerCountdown(120)).toBe("~10m");
    expect(formatLedgerCountdown(780)).toBe("~1h 5m");
    expect(formatLedgerCountdown(17_280 * 2 + 720)).toBe("~2d 1h");
    expect(formatLedgerCountdown(-5)).toBe("~0s");
  });
});
