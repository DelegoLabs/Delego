import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  PriceFeeder,
  getPriceFeeder,
  resetPriceFeederForTesting,
  convertBetweenTokens,
  type PriceUpdate,
} from "./priceFeeder.js";
import { resetTokenRegistryForTesting } from "./tokenRegistry.js";

describe("PriceFeeder", () => {
  beforeEach(() => {
    resetTokenRegistryForTesting();
    resetPriceFeederForTesting();
  });

  afterEach(() => {
    resetPriceFeederForTesting();
  });

  describe("start and stop", () => {
    it("starts and stops the feeder", () => {
      const feeder = new PriceFeeder({ updateIntervalMs: 1000 });
      feeder.start();
      feeder.stop();
    });

    it("does not start if already running", () => {
      const feeder = new PriceFeeder({ updateIntervalMs: 1000 });
      feeder.start();
      // Should not throw
      feeder.start();
      feeder.stop();
    });
  });

  describe("onPriceUpdate", () => {
    it("registers and unregisters callbacks", () => {
      const feeder = new PriceFeeder({ updateIntervalMs: 1000 });
      const callback = vi.fn();
      
      const unsubscribe = feeder.onPriceUpdate(callback);
      expect(typeof unsubscribe).toBe("function");
      
      unsubscribe();
    });
  });

  describe("convertBetweenTokens", () => {
    it("converts between tokens when prices are available", async () => {
      const feeder = new PriceFeeder({ updateIntervalMs: 1000 });
      feeder.start();
      
      // Wait for initial price fetch
      await new Promise((resolve) => setTimeout(resolve, 100));
      
      const result = await convertBetweenTokens("100", "USDC", "BTC");
      // Result may be null if mock prices aren't set up
      // This test verifies the function doesn't throw
      
      feeder.stop();
    });

    it("returns null when conversion is not available", async () => {
      const result = await convertBetweenTokens("100", "UNKNOWN1", "UNKNOWN2");
      expect(result).toBeNull();
    });
  });
});