import { describe, it, expect } from "vitest";
import { getPaymentsHealth } from "./health.js";

describe("getPaymentsHealth", () => {
  it("returns a recent, valid checkedAt timestamp", async () => {
    const health = await getPaymentsHealth({
      checkDatabase: async () => "ok",
      checkWallet: async () => "ok",
      checkSorobanRpc: async () => "ok",
    });

    const checkedAt = new Date(health.checkedAt).getTime();

    expect(Number.isNaN(checkedAt)).toBe(false);
    expect(checkedAt).toBeGreaterThan(0);
    expect(checkedAt).toBeCloseTo(Date.now(), -3);
  });

  it("reports dependency statuses from the injected checks", async () => {
    const health = await getPaymentsHealth({
      checkDatabase: async () => "degraded",
      checkWallet: async () => "ok",
      checkSorobanRpc: async () => "degraded",
    });

    expect(health.database).toBe("degraded");
    expect(health.walletService).toBe("ok");
    expect(health.sorobanRpc).toBe("degraded");
  });
});
