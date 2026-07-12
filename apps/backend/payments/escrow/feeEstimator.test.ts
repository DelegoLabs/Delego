import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the logger first
vi.mock("@delego/utils", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Import the functions and types
import {
  estimateTransactionFeeWithServer,
  clearFeeCache,
  getCachedFeeEstimate,
} from "./feeEstimator.js";

describe("feeEstimator", () => {
  let mockFeeStats: any;
  let mockHorizonServer: any;

  beforeEach(() => {
    clearFeeCache();

    // Default valid fee stats response
    mockFeeStats = {
      last_ledger: 28374129,
      last_ledger_base_fee: 100,
      ledger_capacity_usage: 0.78,
      fee_charged: {
        p10: 100,
        p20: 100,
        p30: 100,
        p40: 200,
        p50: 300,
        p60: 400,
        p70: 500,
        p80: 600,
        p90: 700,
        p95: 800,
        p99: 1000,
      },
      max_fee: {
        p10: 200,
        p20: 300,
        p30: 400,
        p40: 500,
        p50: 600,
        p60: 700,
        p70: 800,
        p80: 900,
        p90: 1100,
        p95: 1100,
        p99: 2000,
      },
    };

    mockHorizonServer = {
      feeStats: vi.fn().mockResolvedValue(mockFeeStats),
    };

  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("estimateTransactionFee", () => {
    it("should fetch fee estimate from Horizon with p95 percentile by default", async () => {
      const estimate = await estimateTransactionFeeWithServer(mockHorizonServer);

      expect(estimate).toMatchObject({
        source: "horizon",
        baseFeeStroops: 100,
        recommendedFeeStroops: 1100, // p95 from max_fee
        percentile: "p95",
      });
      expect(estimate.fetchedAt).toBeDefined();
      expect(new Date(estimate.fetchedAt).getTime()).toBeCloseTo(
        Date.now(),
        -2,
      );
    });

    it("should support p50 percentile for medium network fees", async () => {
      const estimate = await estimateTransactionFeeWithServer(
        mockHorizonServer,
        "p50",
      );

      expect(estimate).toMatchObject({
        source: "horizon",
        recommendedFeeStroops: 600, // p50 from max_fee
        percentile: "p50",
      });
    });

    it("should support p99 percentile for high network congestion", async () => {
      const estimate = await estimateTransactionFeeWithServer(
        mockHorizonServer,
        "p99",
      );

      expect(estimate).toMatchObject({
        source: "horizon",
        recommendedFeeStroops: 2000, // p99 from max_fee
        percentile: "p99",
      });
    });

    it("should ensure minimum fee never drops below fallback value", async () => {
      // Set max_fee p95 to 0 (edge case)
      mockFeeStats.max_fee = {
        p10: 0,
        p20: 0,
        p30: 0,
        p40: 0,
        p50: 0,
        p60: 0,
        p70: 0,
        p80: 0,
        p90: 0,
        p95: 0,
        p99: 0,
      };

      const estimate = await estimateTransactionFeeWithServer(mockHorizonServer);

      expect(estimate.recommendedFeeStroops).toBe(100); // Minimum fallback
      expect(estimate.source).toBe("horizon");
    });

    it("should return fallback estimate when Horizon is unreachable", async () => {
      mockHorizonServer.feeStats.mockRejectedValue(new Error("Network error"));

      const estimate = await estimateTransactionFeeWithServer(mockHorizonServer);

      expect(estimate).toMatchObject({
        source: "fallback",
        baseFeeStroops: 100,
        recommendedFeeStroops: 100,
        percentile: "p95",
      });
    });

    it("should return fallback estimate when Horizon returns malformed data", async () => {
      mockHorizonServer.feeStats.mockResolvedValue({
        last_ledger: 28374129,
        // Missing required fields
      });

      const estimate = await estimateTransactionFeeWithServer(mockHorizonServer);

      expect(estimate).toMatchObject({
        source: "fallback",
        recommendedFeeStroops: 100,
        percentile: "p95",
      });
    });

    it("should return fallback when max_fee is missing from response", async () => {
      mockHorizonServer.feeStats.mockResolvedValue({
        last_ledger: 28374129,
        last_ledger_base_fee: 100,
        ledger_capacity_usage: 0.5,
        // max_fee is missing
      });

      const estimate = await estimateTransactionFeeWithServer(mockHorizonServer);

      expect(estimate.source).toBe("fallback");
    });

    it("should return fallback when percentile key is missing from max_fee", async () => {
      mockFeeStats.max_fee = {
        p10: 100,
        p20: 200,
        // p50 and other keys missing
      };

      const estimate = await estimateTransactionFeeWithServer(mockHorizonServer, "p50");

      expect(estimate.source).toBe("fallback");
    });
  });

  describe("caching behavior", () => {
    it("should cache fee estimates for 30 seconds", async () => {
      await estimateTransactionFeeWithServer(mockHorizonServer);
      await estimateTransactionFeeWithServer(mockHorizonServer);

      // Should use cached estimate, not call Horizon again
      expect(mockHorizonServer.feeStats).toHaveBeenCalledTimes(1);
    });

    it("should refresh cache after TTL expires", async () => {
      await estimateTransactionFeeWithServer(mockHorizonServer);
      expect(mockHorizonServer.feeStats).toHaveBeenCalledTimes(1);

      // Fast-forward time by 31 seconds to expire cache
      vi.useFakeTimers();
      vi.advanceTimersByTime(31 * 1000);

      // Update mock response to verify we fetch new data
      mockFeeStats.max_fee = {
        p10: 500,
        p20: 600,
        p30: 700,
        p40: 800,
        p50: 900,
        p60: 1000,
        p70: 1100,
        p80: 1200,
        p90: 1300,
        p95: 1300,
        p99: 2500,
      };

      const estimate2 = await estimateTransactionFeeWithServer(mockHorizonServer);

      // Should fetch again due to cache expiration
      expect(mockHorizonServer.feeStats).toHaveBeenCalledTimes(2);
      expect(estimate2.recommendedFeeStroops).toBe(1300); // p95 from updated mock

      vi.useRealTimers();
    });

    it("should clear cache when clearFeeCache is called", async () => {
      await estimateTransactionFeeWithServer(mockHorizonServer);
      expect(mockHorizonServer.feeStats).toHaveBeenCalledTimes(1);

      clearFeeCache();

      await estimateTransactionFeeWithServer(mockHorizonServer);
      expect(mockHorizonServer.feeStats).toHaveBeenCalledTimes(2);
    });

    it("should return cached estimate via getCachedFeeEstimate", async () => {
      const estimate1 = await estimateTransactionFeeWithServer(mockHorizonServer);
      const cachedEstimate = getCachedFeeEstimate();

      expect(cachedEstimate).toEqual(estimate1);
    });

    it("should return null from getCachedFeeEstimate when cache is expired", async () => {
      await estimateTransactionFeeWithServer(mockHorizonServer);

      vi.useFakeTimers();
      vi.advanceTimersByTime(31 * 1000);

      const cachedEstimate = getCachedFeeEstimate();
      expect(cachedEstimate).toBeNull();

      vi.useRealTimers();
    });

    it("should return null from getCachedFeeEstimate when cache is empty", () => {
      clearFeeCache();
      const cachedEstimate = getCachedFeeEstimate();

      expect(cachedEstimate).toBeNull();
    });
  });

  describe("network spike scenarios", () => {
    it("should detect medium network fee spike with p50", async () => {
      // Simulate moderate congestion
      mockFeeStats.max_fee = {
        p10: 500,
        p20: 800,
        p30: 1000,
        p40: 1200,
        p50: 1500,
        p60: 1800,
        p70: 2000,
        p80: 2500,
        p90: 3000,
        p95: 3000,
        p99: 5000,
      };
      mockFeeStats.ledger_capacity_usage = 0.5;

      const estimate = await estimateTransactionFeeWithServer(mockHorizonServer, "p50");

      expect(estimate.recommendedFeeStroops).toBe(1500);
      expect(estimate.source).toBe("horizon");
    });

    it("should detect high network congestion with p99", async () => {
      // Simulate high congestion
      mockFeeStats.max_fee = {
        p10: 5000,
        p20: 8000,
        p30: 10000,
        p40: 12000,
        p50: 15000,
        p60: 18000,
        p70: 20000,
        p80: 25000,
        p90: 30000,
        p95: 30000,
        p99: 50000,
      };
      mockFeeStats.ledger_capacity_usage = 0.95;

      const estimate = await estimateTransactionFeeWithServer(mockHorizonServer, "p99");

      expect(estimate.recommendedFeeStroops).toBe(50000);
    });

    it("should provide appropriate fees for normal network conditions", async () => {
      // Normal conditions with low capacity usage
      mockFeeStats.max_fee = {
        p10: 100,
        p20: 100,
        p30: 100,
        p40: 100,
        p50: 100,
        p60: 100,
        p70: 100,
        p80: 100,
        p90: 100,
        p95: 100,
        p99: 100,
      };
      mockFeeStats.ledger_capacity_usage = 0.1;

      const estimate = await estimateTransactionFeeWithServer(mockHorizonServer, "p50");

      expect(estimate.recommendedFeeStroops).toBe(100);
    });
  });

  describe("error handling", () => {
    it("should gracefully handle Horizon timeout", async () => {
      const timeoutError = new Error("Request timeout");
      mockHorizonServer.feeStats.mockRejectedValue(timeoutError);

      const estimate = await estimateTransactionFeeWithServer(mockHorizonServer,
        "https://horizon-testnet.stellar.org",
      );

      expect(estimate.source).toBe("fallback");
      expect(estimate.recommendedFeeStroops).toBe(100);
    });

    it("should gracefully handle Horizon 503 Service Unavailable", async () => {
      const error = new Error("503 Service Unavailable");
      mockHorizonServer.feeStats.mockRejectedValue(error);

      const estimate = await estimateTransactionFeeWithServer(mockHorizonServer,
        "https://horizon-testnet.stellar.org",
      );

      expect(estimate.source).toBe("fallback");
    });

    it("should handle null response from feeStats", async () => {
      mockHorizonServer.feeStats.mockResolvedValue(null);

      const estimate = await estimateTransactionFeeWithServer(mockHorizonServer,
        "https://horizon-testnet.stellar.org",
      );

      expect(estimate.source).toBe("fallback");
    });

    it("should handle undefined response from feeStats", async () => {
      mockHorizonServer.feeStats.mockResolvedValue(undefined);

      const estimate = await estimateTransactionFeeWithServer(mockHorizonServer,
        "https://horizon-testnet.stellar.org",
      );

      expect(estimate.source).toBe("fallback");
    });

    it("should handle non-object response from feeStats", async () => {
      mockHorizonServer.feeStats.mockResolvedValue("not an object");

      const estimate = await estimateTransactionFeeWithServer(mockHorizonServer,
        "https://horizon-testnet.stellar.org",
      );

      expect(estimate.source).toBe("fallback");
    });
  });

  describe("type safety", () => {
    it("should return properly typed FeeEstimate", async () => {
      const estimate = await estimateTransactionFeeWithServer(mockHorizonServer,
        "https://horizon-testnet.stellar.org",
      );

      // TypeScript compilation will verify this, but we can also test runtime
      expect(estimate).toHaveProperty("source");
      expect(estimate).toHaveProperty("baseFeeStroops");
      expect(estimate).toHaveProperty("recommendedFeeStroops");
      expect(estimate).toHaveProperty("percentile");
      expect(estimate).toHaveProperty("fetchedAt");

      expect(typeof estimate.source).toBe("string");
      expect(typeof estimate.baseFeeStroops).toBe("number");
      expect(typeof estimate.recommendedFeeStroops).toBe("number");
      expect(typeof estimate.fetchedAt).toBe("string");
    });

    it("should have valid percentile values", async () => {
      const p50 = await estimateTransactionFeeWithServer(mockHorizonServer, "p50");
      const p95 = await estimateTransactionFeeWithServer(mockHorizonServer, "p95");
      const p99 = await estimateTransactionFeeWithServer(mockHorizonServer, "p99");

      expect(["p50", "p95", "p99"]).toContain(p50.percentile);
      expect(["p50", "p95", "p99"]).toContain(p95.percentile);
      expect(["p50", "p95", "p99"]).toContain(p99.percentile);
    });
  });
});
