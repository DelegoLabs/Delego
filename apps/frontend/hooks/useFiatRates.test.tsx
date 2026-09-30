import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useFiatRates } from "./useFiatRates";

describe("useFiatRates", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("starts loading and resolves to a rate snapshot", async () => {
    const { result } = renderHook(() => useFiatRates());

    expect(result.current.loading).toBe(true);
    expect(result.current.rates).toBeNull();

    await waitFor(() => expect(result.current.rates).not.toBeNull());
    expect(result.current.loading).toBe(false);
    expect(result.current.rates?.rates.USD).toBeGreaterThan(0);
    expect(result.current.stale).toBe(true);
  });
});
