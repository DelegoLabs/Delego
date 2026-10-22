import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  validateAnchorUrl,
  initiateSep24Transfer,
  verifySep24Transaction,
  SUPPORTED_ANCHORS,
} from "./sep24";

describe("SEP-0024 Anchor Integration", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("validateAnchorUrl", () => {
    it("accepts valid HTTPS URLs matching allowed anchor domain", () => {
      const url = validateAnchorUrl("https://anchor.usd.example.com/sep24/flow", "anchor.usd.example.com");
      expect(url.hostname).toBe("anchor.usd.example.com");
    });

    it("accepts valid HTTPS subdomains matching allowed anchor domain", () => {
      const url = validateAnchorUrl("https://sub.anchor.usd.example.com/sep24/flow", "anchor.usd.example.com");
      expect(url.hostname).toBe("sub.anchor.usd.example.com");
    });

    it("rejects non-HTTPS URLs", () => {
      expect(() =>
        validateAnchorUrl("http://anchor.usd.example.com/sep24", "anchor.usd.example.com")
      ).toThrow(/Insecure anchor protocol/);
    });

    it("rejects untrusted domains", () => {
      expect(() =>
        validateAnchorUrl("https://malicious.com/sep24", "anchor.usd.example.com")
      ).toThrow(/Disallowed anchor origin domain/);
    });
  });

  describe("initiateSep24Transfer", () => {
    it("successfully initiates an interactive deposit for USD", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          url: "https://anchor.usd.example.com/sep24/interactive?id=tx123",
          id: "tx123",
        }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const session = await initiateSep24Transfer({
        assetCode: "USD",
        action: "deposit",
        account: "GABC1234567890",
        amount: "100.00",
      });

      expect(session).toEqual({
        anchorDomain: "anchor.usd.example.com",
        assetCode: "USD",
        action: "deposit",
        interactiveUrl: "https://anchor.usd.example.com/sep24/interactive?id=tx123",
        transactionId: "tx123",
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "https://anchor.usd.example.com/sep24/transactions/deposit/interactive",
        expect.objectContaining({
          method: "POST",
        })
      );
    });

    it("throws an error for unsupported asset codes", async () => {
      await expect(
        initiateSep24Transfer({
          assetCode: "XYZ" as any,
          action: "deposit",
          account: "GABC1234567890",
        })
      ).rejects.toThrow(/Unsupported currency/);
    });
  });

  describe("verifySep24Transaction", () => {
    it("verifies completed transaction status", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          transaction: {
            id: "tx123",
            status: "completed",
            amount_in: "100.00",
            amount_out: "99.50",
          },
        }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await verifySep24Transaction("tx123", SUPPORTED_ANCHORS.USD.domain);

      expect(result).toEqual({
        id: "tx123",
        status: "completed",
        amountIn: "100.00",
        amountOut: "99.50",
        message: undefined,
      });
    });
  });
});
