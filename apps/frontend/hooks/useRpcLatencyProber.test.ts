import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  classifyLatency,
  probeEndpoint,
  selectBestEndpoint,
  useRpcLatencyProber,
  type RpcEndpointHealth,
} from "./useRpcLatencyProber";

describe("classifyLatency", () => {
  it("classifies latency correctly according to thresholds", () => {
    expect(classifyLatency(150, true)).toBe("green");
    expect(classifyLatency(200, true)).toBe("yellow");
    expect(classifyLatency(500, true)).toBe("yellow");
    expect(classifyLatency(800, true)).toBe("yellow");
    expect(classifyLatency(801, true)).toBe("red");
    expect(classifyLatency(100, false)).toBe("red");
  });
});

describe("selectBestEndpoint", () => {
  it("selects the healthiest endpoint with lowest latency", () => {
    const endpoints: RpcEndpointHealth[] = [
      { url: "https://slow.rpc", latencyMs: 500, isAvailable: true, latestLedgerSequence: 100 },
      { url: "https://fast.rpc", latencyMs: 120, isAvailable: true, latestLedgerSequence: 101 },
      { url: "https://dead.rpc", latencyMs: 30, isAvailable: false, latestLedgerSequence: 0 },
    ];
    const best = selectBestEndpoint(endpoints);
    expect(best?.url).toBe("https://fast.rpc");
  });

  it("returns null when no endpoints are available", () => {
    const endpoints: RpcEndpointHealth[] = [
      { url: "https://dead1.rpc", latencyMs: 50, isAvailable: false, latestLedgerSequence: 0 },
      { url: "https://dead2.rpc", latencyMs: 100, isAvailable: false, latestLedgerSequence: 0 },
    ];
    expect(selectBestEndpoint(endpoints)).toBeNull();
  });
});

describe("probeEndpoint", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("probes successfully and returns ledger sequence and latency", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: { sequence: 123456 } }),
    } as Response);

    const result = await probeEndpoint("https://test.rpc");
    expect(result.isAvailable).toBe(true);
    expect(result.latestLedgerSequence).toBe(123456);
    expect(result.url).toBe("https://test.rpc");
  });

  it("handles HTTP errors safely", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      json: async () => ({}),
    } as Response);

    const result = await probeEndpoint("https://test.rpc");
    expect(result.isAvailable).toBe(false);
    expect(result.latestLedgerSequence).toBe(0);
  });

  it("handles JSON-RPC errors or invalid sequence safely", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ error: { code: -32600, message: "Invalid request" } }),
    } as Response);

    const result = await probeEndpoint("https://test.rpc");
    expect(result.isAvailable).toBe(false);
  });

  it("handles network failures and timeouts", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("Network error"));

    const result = await probeEndpoint("https://test.rpc");
    expect(result.isAvailable).toBe(false);
  });
});

describe("useRpcLatencyProber", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("probes custom endpoints and automatically selects the fastest healthy endpoint", async () => {
    vi.mocked(fetch).mockImplementation((url) => {
      const targetUrl = typeof url === "string" ? url : (url as Request).url;
      if (targetUrl.includes("fast")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ result: { sequence: 5000 } }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ result: { sequence: 4990 } }),
      } as Response);
    });

    const customEndpoints = ["https://slow.rpc", "https://fast.rpc"];

    const { result } = renderHook(() => useRpcLatencyProber("testnet", customEndpoints));

    await act(async () => {
      await result.current.probeAll();
    });

    expect(result.current.endpointsHealth.length).toBe(2);
    expect(result.current.activeEndpoint?.url).toBeDefined();
  });
});
