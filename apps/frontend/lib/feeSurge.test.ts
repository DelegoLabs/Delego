import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import {
  DEFAULT_MAX_FEE_CAP_STROOPS,
  SURGE_FEE_THRESHOLD_STROOPS,
  baseFeeFromStats,
  buildGasFeeEstimate,
  detectFeeSurge,
  exceedsMaxFeeCap,
  feeSurgeRatio,
  fetchGasFeeEstimate,
  isFeeAboveUserLimit,
  isSurgeFee,
  normalizeStroops,
  parseStroops,
  recommendedFeeFromStats,
} from "./feeSurge";

const FEE_STATS_URL = "https://horizon.test/fee_stats";

describe("parseStroops", () => {
  it("accepts decimal strings, numbers and bigints", () => {
    expect(parseStroops("100")).toBe(100n);
    expect(parseStroops(" 250 ")).toBe(250n);
    expect(parseStroops(100)).toBe(100n);
    expect(parseStroops(0n)).toBe(0n);
  });

  it("rejects anything that is not a non-negative integer", () => {
    expect(parseStroops("-1")).toBeNull();
    expect(parseStroops("1.5")).toBeNull();
    expect(parseStroops("abc")).toBeNull();
    expect(parseStroops("")).toBeNull();
    expect(parseStroops(null)).toBeNull();
    expect(parseStroops(undefined)).toBeNull();
    expect(parseStroops(-5n)).toBeNull();
  });

  it("normalizes to a canonical decimal string", () => {
    expect(normalizeStroops("00100")).toBe("100");
    expect(normalizeStroops("nope")).toBeNull();
  });
});

describe("isSurgeFee", () => {
  it("is not active while fees stay near the protocol minimum", () => {
    expect(isSurgeFee("100")).toBe(false);
    expect(isSurgeFee("999")).toBe(false);
  });

  it("is active once the fee leaves the normal band", () => {
    expect(SURGE_FEE_THRESHOLD_STROOPS).toBe(1000);
    expect(isSurgeFee("1000")).toBe(true);
    expect(isSurgeFee("250000")).toBe(true);
  });

  it("is not active for an unreadable fee", () => {
    expect(isSurgeFee("nope")).toBe(false);
  });
});

describe("exceedsMaxFeeCap", () => {
  it("compares the fee against the cap", () => {
    expect(exceedsMaxFeeCap("100", "100")).toBe(false);
    expect(exceedsMaxFeeCap("101", "100")).toBe(true);
    expect(exceedsMaxFeeCap("100", "101")).toBe(false);
  });

  it("never breaches on an unreadable fee or cap", () => {
    expect(exceedsMaxFeeCap("nope", "100")).toBe(false);
    expect(exceedsMaxFeeCap("100", "nope")).toBe(false);
  });
});

describe("buildGasFeeEstimate", () => {
  it("normalizes the stroop strings and derives the surge flag", () => {
    const estimate = buildGasFeeEstimate({
      baseFeeStroops: "00100",
      recommendedFeeStroops: "250000",
      userConfiguredMaxFeeStroops: "100000",
    });
    expect(estimate).toEqual({
      baseFeeStroops: "100",
      recommendedFeeStroops: "250000",
      isSurgeActive: true,
      userConfiguredMaxFeeStroops: "100000",
    });
  });

  it("falls back to safe values for unreadable input", () => {
    const estimate = buildGasFeeEstimate({
      baseFeeStroops: "nope",
      recommendedFeeStroops: "nope",
      userConfiguredMaxFeeStroops: "nope",
    });
    expect(estimate.baseFeeStroops).toBe("100");
    expect(estimate.recommendedFeeStroops).toBe("100");
    expect(estimate.userConfiguredMaxFeeStroops).toBe(
      DEFAULT_MAX_FEE_CAP_STROOPS
    );
    expect(estimate.isSurgeActive).toBe(false);
  });
});

describe("detectFeeSurge", () => {
  it("reads the base fee and the recommended p95 fee from Horizon stats", () => {
    const estimate = detectFeeSurge(
      {
        last_ledger_base_fee: "100",
        max_fee: { p50: "100", p95: "250000", p99: "900000" },
      },
      "100000"
    );
    expect(estimate.baseFeeStroops).toBe("100");
    expect(estimate.recommendedFeeStroops).toBe("250000");
    expect(estimate.isSurgeActive).toBe(true);
    expect(estimate.userConfiguredMaxFeeStroops).toBe("100000");
  });

  it("steps down to p90 and p50 when p95 is missing", () => {
    expect(
      recommendedFeeFromStats({ max_fee: { p50: "100", p90: "300" } })
    ).toBe("300");
    expect(recommendedFeeFromStats({ max_fee: { p50: "300" } })).toBe("300");
  });

  it("falls back to the fee_charged bucket", () => {
    expect(
      recommendedFeeFromStats({ fee_charged: { p95: "450" } })
    ).toBe("450");
  });

  it("never quotes a fee below the ledger base fee", () => {
    const estimate = detectFeeSurge(
      {
        last_ledger_base_fee: "250000",
        max_fee: { p50: "100", p95: "150" },
      },
      "100000"
    );
    expect(estimate.recommendedFeeStroops).toBe("250000");
    expect(estimate.isSurgeActive).toBe(true);
  });

  it("reports no surge when the stats carry no usable fee data", () => {
    const estimate = detectFeeSurge({}, "100000");
    expect(estimate.baseFeeStroops).toBe("100");
    expect(estimate.recommendedFeeStroops).toBe("100");
    expect(estimate.isSurgeActive).toBe(false);
  });

  it("falls back to the protocol minimum when the base fee is unreadable", () => {
    expect(baseFeeFromStats({ last_ledger_base_fee: "nope" })).toBe("100");
    expect(baseFeeFromStats({ last_ledger_base_fee: 250 })).toBe("250");
  });
});

describe("isFeeAboveUserLimit", () => {
  it("is true when the recommended fee is over the user's limit", () => {
    const estimate = detectFeeSurge(
      {
        last_ledger_base_fee: "250000",
        max_fee: { p95: "500000" },
      },
      "100000"
    );
    expect(isFeeAboveUserLimit(estimate)).toBe(true);
  });

  it("is false while the recommended fee stays under the limit", () => {
    const estimate = detectFeeSurge(
      {
        last_ledger_base_fee: "100",
        max_fee: { p95: "200" },
      },
      "100000"
    );
    expect(isFeeAboveUserLimit(estimate)).toBe(false);
  });

  it("treats a zero limit as breached by any fee", () => {
    const estimate = detectFeeSurge({ max_fee: { p95: "200" } }, "0");
    expect(isFeeAboveUserLimit(estimate)).toBe(true);
  });
});

describe("feeSurgeRatio", () => {
  it("reports how many times the recommended fee costs over the base fee", () => {
    expect(
      feeSurgeRatio({
        baseFeeStroops: "100",
        recommendedFeeStroops: "500",
        isSurgeActive: true,
        userConfiguredMaxFeeStroops: "100000",
      })
    ).toBe(5);
  });

  it("is null when there is no base fee to compare against", () => {
    expect(
      feeSurgeRatio({
        baseFeeStroops: "0",
        recommendedFeeStroops: "500",
        isSurgeActive: true,
        userConfiguredMaxFeeStroops: "100000",
      })
    ).toBeNull();
  });
});

describe("fetchGasFeeEstimate", () => {
  it("returns a live estimate from Horizon fee stats", async () => {
    server.use(
      http.get(FEE_STATS_URL, () =>
        HttpResponse.json({
          last_ledger_base_fee: "250000",
          max_fee: { p50: "250000", p95: "500000" },
        })
      )
    );
    const { estimate, source } = await fetchGasFeeEstimate(
      "https://horizon.test/",
      "100000"
    );
    expect(source).toBe("horizon");
    expect(estimate.baseFeeStroops).toBe("250000");
    expect(estimate.recommendedFeeStroops).toBe("500000");
    expect(estimate.isSurgeActive).toBe(true);
    expect(estimate.userConfiguredMaxFeeStroops).toBe("100000");
  });

  it("falls back to the minimum fee when the response is not ok", async () => {
    server.use(
      http.get(FEE_STATS_URL, () => new HttpResponse(null, { status: 503 }))
    );
    const { estimate, source } = await fetchGasFeeEstimate(
      "https://horizon.test",
      "100000"
    );
    expect(source).toBe("fallback");
    expect(estimate.recommendedFeeStroops).toBe("100");
    expect(estimate.isSurgeActive).toBe(false);
  });

  it("falls back when the network request fails", async () => {
    server.use(http.get(FEE_STATS_URL, () => HttpResponse.error()));
    const { estimate, source } = await fetchGasFeeEstimate(
      "https://horizon.test",
      "100000"
    );
    expect(source).toBe("fallback");
    expect(estimate.recommendedFeeStroops).toBe("100");
  });
});
