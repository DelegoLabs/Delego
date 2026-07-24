import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@delego/utils", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import {
  checkWalletServiceReadiness,
  getPaymentsHealth,
} from "./health.js";

describe("escrow health probe", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("getPaymentsHealth", () => {
    it("returns ok for all dependencies on the success path", async () => {
      const health = await getPaymentsHealth({
        checkDatabase: async () => "ok",
        checkWallet: async () => "ok",
        checkSorobanRpc: async () => "ok",
      });

      expect(health).toMatchObject({
        database: "ok",
        walletService: "ok",
        sorobanRpc: "ok",
      });
      expect(new Date(health.checkedAt).getTime()).toBeCloseTo(Date.now(), -3);
    });

    it("returns degraded sorobanRpc when Soroban RPC is unavailable", async () => {
      const health = await getPaymentsHealth({
        checkDatabase: async () => "ok",
        checkWallet: async () => "ok",
        checkSorobanRpc: async () => "degraded",
      });

      expect(health.database).toBe("ok");
      expect(health.walletService).toBe("ok");
      expect(health.sorobanRpc).toBe("degraded");
    });
  });

  describe("checkWalletServiceReadiness", () => {
    it("returns degraded when the wallet service is unreachable", async () => {
      const fetchFn = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

      const status = await checkWalletServiceReadiness(
        "http://localhost:3012",
        2000,
        fetchFn,
      );

      expect(status).toBe("degraded");
    });
  });
});
