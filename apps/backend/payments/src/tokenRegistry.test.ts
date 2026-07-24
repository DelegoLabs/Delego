import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  TokenRegistry,
  getTokenRegistry,
  resetTokenRegistryForTesting,
  type TokenMetadata,
  type TokenPrice,
} from "./tokenRegistry.js";

describe("TokenRegistry", () => {
  let registry: TokenRegistry;

  beforeEach(() => {
    resetTokenRegistryForTesting();
    registry = new TokenRegistry();
  });

  describe("getTokenMetadata", () => {
    it("returns metadata for known token", async () => {
      const metadata = await registry.getTokenMetadata("XLM");
      expect(metadata).not.toBeNull();
      expect(metadata?.symbol).toBe("XLM");
      expect(metadata?.name).toBe("Stellar Lumens");
      expect(metadata?.decimals).toBe(7);
    });

    it("returns null for unknown token", async () => {
      const metadata = await registry.getTokenMetadata("UNKNOWN");
      expect(metadata).toBeNull();
    });

    it("handles case-insensitive lookup", async () => {
      const metadata = await registry.getTokenMetadata("xlm");
      expect(metadata).not.toBeNull();
      expect(metadata?.symbol).toBe("XLM");
    });
  });

  describe("getTokenPrice", () => {
    it("returns null when no price is set", async () => {
      const price = await registry.getTokenPrice("XLM");
      expect(price).toBeNull();
    });

    it("returns price after update", async () => {
      const tokenPrice: TokenPrice = {
        tokenSymbol: "USDC",
        priceInUsd: 1.0,
        priceInXlm: 0.12,
        lastUpdated: Date.now(),
        source: "test",
      };

      await registry.updateTokenPrice("USDC", tokenPrice);
      const price = await registry.getTokenPrice("USDC");
      expect(price).not.toBeNull();
      expect(price?.priceInUsd).toBe(1.0);
    });
  });

  describe("updateTokenPrice", () => {
    it("updates price for existing token", async () => {
      const tokenPrice: TokenPrice = {
        tokenSymbol: "USDC",
        priceInUsd: 1.0,
        priceInXlm: 0.12,
        lastUpdated: Date.now(),
        source: "test",
      };

      await registry.updateTokenPrice("USDC", tokenPrice);
      const price = await registry.getTokenPrice("USDC");
      expect(price?.priceInUsd).toBe(1.0);
    });

    it("ignores update for unknown token", async () => {
      const tokenPrice: TokenPrice = {
        tokenSymbol: "UNKNOWN",
        priceInUsd: 1.0,
        priceInXlm: 0.12,
        lastUpdated: Date.now(),
        source: "test",
      };

      // Should not throw
      await registry.updateTokenPrice("UNKNOWN", tokenPrice);
    });
  });

  describe("getAllTokens", () => {
    it("returns all supported tokens", async () => {
      const tokens = await registry.getAllTokens();
      expect(tokens.length).toBeGreaterThan(0);
      expect(tokens.some((t) => t.symbol === "XLM")).toBe(true);
      expect(tokens.some((t) => t.symbol === "USDC")).toBe(true);
    });
  });

  describe("getSupportedSymbols", () => {
    it("returns all supported symbols", async () => {
      const symbols = await registry.getSupportedSymbols();
      expect(symbols.length).toBeGreaterThan(0);
      expect(symbols).toContain("XLM");
      expect(symbols).toContain("USDC");
    });
  });

  describe("isTokenSupported", () => {
    it("returns true for supported token", async () => {
      const supported = await registry.isTokenSupported("XLM");
      expect(supported).toBe(true);
    });

    it("returns false for unsupported token", async () => {
      const supported = await registry.isTokenSupported("UNKNOWN");
      expect(supported).toBe(false);
    });
  });

  describe("getTokenDecimals", () => {
    it("returns decimals for known token", async () => {
      const decimals = await registry.getTokenDecimals("XLM");
      expect(decimals).toBe(7);
    });

    it("returns null for unknown token", async () => {
      const decimals = await registry.getTokenDecimals("UNKNOWN");
      expect(decimals).toBeNull();
    });
  });

  describe("convertAmount", () => {
    it("converts amount between tokens", async () => {
      // Set up prices
      await registry.updateTokenPrice("USDC", {
        tokenSymbol: "USDC",
        priceInUsd: 1.0,
        priceInXlm: 0.12,
        lastUpdated: Date.now(),
        source: "test",
      });

      await registry.updateTokenPrice("BTC", {
        tokenSymbol: "BTC",
        priceInUsd: 45000.0,
        priceInXlm: 5400.0,
        lastUpdated: Date.now(),
        source: "test",
      });

      const result = await registry.convertAmount("100", "USDC", "BTC");
      expect(result).not.toBeNull();
      expect(result?.amount).toBeDefined();
      expect(result?.rate).toBeDefined();
    });

    it("returns null when price is missing", async () => {
      const result = await registry.convertAmount("100", "XLM", "UNKNOWN");
      expect(result).toBeNull();
    });
  });
});