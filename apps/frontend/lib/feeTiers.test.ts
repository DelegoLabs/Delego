import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import {
  fallbackFeeTierOptions,
  feeTierOptionsFromStats,
  fetchFeeTierQuote,
} from "./feeTiers";

const FEE_STATS_URL = "https://horizon.test/fee_stats";

describe("feeTierOptionsFromStats", () => {
  it("reads string percentiles from max_fee and floors at the base fee", () => {
    const options = feeTierOptionsFromStats({
      last_ledger_base_fee: "150",
      max_fee: { p50: "100", p95: "240", p99: "800" },
    });
    expect(options?.map((option) => option.feeStroops)).toEqual(["150", "240", "800"]);
    expect(options?.find((option) => option.tier === "fast")?.estimatedSeconds).toBe(5);
  });

  it("accepts numeric percentiles and falls back from max_fee to fee_charged", () => {
    const options = feeTierOptionsFromStats({
      last_ledger_base_fee: 100,
      max_fee: { p50: 100 },
      fee_charged: { p50: 100, p95: "320", p99: 900 },
    });
    expect(options?.map((option) => [option.tier, option.feeStroops])).toEqual([
      ["standard", "100"],
      ["fast", "320"],
      ["urgent", "900"],
    ]);
  });

  it("uses p90 when p95 is absent", () => {
    const options = feeTierOptionsFromStats({
      max_fee: { p50: 100, p90: 180, p99: 400 },
    });
    expect(options?.find((option) => option.tier === "fast")?.feeStroops).toBe("180");
  });

  it("returns null when a tier cannot be priced", () => {
    expect(feeTierOptionsFromStats({ max_fee: { p50: "0", p95: "10", p99: "10" } })).toBeNull();
    expect(feeTierOptionsFromStats({})).toBeNull();
    expect(feeTierOptionsFromStats({ max_fee: { p50: "nope", p95: 10, p99: 10 } })).toBeNull();
  });
});

describe("fetchFeeTierQuote", () => {
  it("returns live tiers from Horizon fee stats", async () => {
    server.use(
      http.get(FEE_STATS_URL, () =>
        HttpResponse.json({
          last_ledger_base_fee: "100",
          max_fee: { p50: "100", p95: "200", p99: "500" },
        })
      )
    );
    const quote = await fetchFeeTierQuote("https://horizon.test/");
    expect(quote.source).toBe("horizon");
    expect(quote.options.map((option) => option.tier)).toEqual(["standard", "fast", "urgent"]);
  });

  it("falls back when the response is not ok or malformed", async () => {
    server.use(http.get(FEE_STATS_URL, () => new HttpResponse(null, { status: 503 })));
    expect((await fetchFeeTierQuote("https://horizon.test")).source).toBe("fallback");

    server.use(http.get(FEE_STATS_URL, () => HttpResponse.json({ max_fee: {} })));
    expect((await fetchFeeTierQuote("https://horizon.test")).source).toBe("fallback");
  });

  it("falls back when the network request fails", async () => {
    server.use(http.get(FEE_STATS_URL, () => HttpResponse.error()));
    const quote = await fetchFeeTierQuote("https://horizon.test");
    expect(quote.source).toBe("fallback");
    expect(quote.options).toEqual(fallbackFeeTierOptions());
  });
});
