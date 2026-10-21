import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { NetworkProvider } from "./useNetwork";
import { useFeeSurgeGuard } from "./useFeeSurgeGuard";
import { server } from "../mocks/server";
import {
  DEFAULT_MAX_FEE_CAP_STROOPS,
  MAX_FEE_CAP_STORAGE_KEY,
} from "../lib/maxFeeCap";

const TESTNET_FEE_STATS_URL = "https://horizon-testnet.stellar.org/fee_stats";

function wrapper({ children }: { children: React.ReactNode }) {
  return <NetworkProvider>{children}</NetworkProvider>;
}

function renderGuard() {
  return renderHook(() => useFeeSurgeGuard(), { wrapper });
}

describe("useFeeSurgeGuard", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("falls back to the default comfort limit", async () => {
    const { result } = renderGuard();

    await waitFor(() => {
      expect(result.current.maxFeeStroops).toBe(DEFAULT_MAX_FEE_CAP_STROOPS);
    });
  });

  it("reads the persisted comfort limit", async () => {
    window.localStorage.setItem(MAX_FEE_CAP_STORAGE_KEY, "250000");
    const { result } = renderGuard();

    await waitFor(() => {
      expect(result.current.maxFeeStroops).toBe("250000");
    });
  });

  it("reports a live estimate from Horizon", async () => {
    server.use(
      http.get(TESTNET_FEE_STATS_URL, () =>
        HttpResponse.json({
          last_ledger_base_fee: "100",
          max_fee: { p50: "100", p95: "200" },
        })
      )
    );
    const { result } = renderGuard();

    await waitFor(() => {
      expect(result.current.source).toBe("horizon");
    });
    expect(result.current.estimate?.recommendedFeeStroops).toBe("200");
    expect(result.current.estimate?.isSurgeActive).toBe(false);
    expect(result.current.isAboveLimit).toBe(false);
  });

  it("flags a congested network that is above the user's limit", async () => {
    server.use(
      http.get(TESTNET_FEE_STATS_URL, () =>
        HttpResponse.json({
          last_ledger_base_fee: "250000",
          max_fee: { p50: "250000", p95: "500000" },
        })
      )
    );
    const { result } = renderGuard();

    await waitFor(() => {
      expect(result.current.isAboveLimit).toBe(true);
    });
    expect(result.current.estimate?.isSurgeActive).toBe(true);
  });

  it("persists a new comfort limit", async () => {
    const { result } = renderGuard();

    await waitFor(() => {
      expect(result.current.maxFeeStroops).toBe(DEFAULT_MAX_FEE_CAP_STROOPS);
    });

    act(() => {
      expect(result.current.setMaxFeeStroops("250000")).toBe(true);
    });

    await waitFor(() => {
      expect(result.current.maxFeeStroops).toBe("250000");
    });
    expect(window.localStorage.getItem(MAX_FEE_CAP_STORAGE_KEY)).toBe("250000");
  });

  it("rejects an invalid comfort limit without changing the stored one", async () => {
    const { result } = renderGuard();

    await waitFor(() => {
      expect(result.current.maxFeeStroops).toBe(DEFAULT_MAX_FEE_CAP_STROOPS);
    });

    act(() => {
      expect(result.current.setMaxFeeStroops("0")).toBe(false);
    });

    expect(result.current.maxFeeStroops).toBe(DEFAULT_MAX_FEE_CAP_STROOPS);
    expect(window.localStorage.getItem(MAX_FEE_CAP_STORAGE_KEY)).toBeNull();
  });

  it("resolves whenReady with the current estimate", async () => {
    server.use(
      http.get(TESTNET_FEE_STATS_URL, () =>
        HttpResponse.json({
          last_ledger_base_fee: "250000",
          max_fee: { p50: "250000", p95: "500000" },
        })
      )
    );
    const { result } = renderGuard();

    let estimate = null;
    await act(async () => {
      estimate = (await result.current.whenReady()) as any;
    });

    expect((estimate as any)?.recommendedFeeStroops).toBe("500000");
    expect((estimate as any)?.userConfiguredMaxFeeStroops).toBe(
      DEFAULT_MAX_FEE_CAP_STROOPS
    );
  });

  it("falls back to the minimum fee when Horizon is unavailable", async () => {
    server.use(
      http.get(TESTNET_FEE_STATS_URL, () => new HttpResponse(null, { status: 503 }))
    );
    const { result } = renderGuard();

    await waitFor(() => {
      expect(result.current.source).toBe("fallback");
    });
    expect(result.current.estimate?.recommendedFeeStroops).toBe("100");
    expect(result.current.isAboveLimit).toBe(false);
  });
});
