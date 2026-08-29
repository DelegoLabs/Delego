import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useConsent } from "./useConsent";
import { resetConsentForTesting } from "../lib/consent";

describe("useConsent (#612)", () => {
  beforeEach(() => {
    resetConsentForTesting();
  });

  it("starts from essential-only defaults with no log entries", () => {
    const { result } = renderHook(() => useConsent());
    expect(result.current.preferences).toEqual({
      essential: true,
      productAnalytics: false,
      marketing: false,
    });
    expect(result.current.log).toEqual([]);
  });

  it("setCategory updates preferences and appends a log entry", () => {
    const { result } = renderHook(() => useConsent());

    act(() => {
      result.current.setCategory("productAnalytics", true);
    });

    expect(result.current.preferences.productAnalytics).toBe(true);
    expect(result.current.log).toHaveLength(1);
    expect(result.current.log[0]).toMatchObject({
      category: "productAnalytics",
      granted: true,
      source: "settings",
    });
  });

  it("setCategory for one category leaves the other untouched", () => {
    const { result } = renderHook(() => useConsent());

    act(() => {
      result.current.setCategory("productAnalytics", true);
    });
    act(() => {
      result.current.setCategory("marketing", true);
    });

    expect(result.current.preferences).toEqual({
      essential: true,
      productAnalytics: true,
      marketing: true,
    });
  });
});
