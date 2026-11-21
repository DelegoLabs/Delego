import { afterEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { mockMatchMedia } from "../tests/fakeAudioContext";
import {
  getPrefersReducedMotion,
  scrollBehaviorFor,
  useReducedMotion,
} from "./useReducedMotion";

describe("useReducedMotion", () => {
  let restore: (() => void) | undefined;

  afterEach(() => {
    restore?.();
    restore = undefined;
    delete document.documentElement.dataset.reduceMotion;
  });

  it("follows the OS prefers-reduced-motion query", () => {
    restore = mockMatchMedia(true);
    expect(getPrefersReducedMotion()).toBe(true);
    expect(renderHook(() => useReducedMotion()).result.current).toBe(true);
  });

  it("is false when the OS does not request reduced motion", () => {
    restore = mockMatchMedia(false);
    expect(renderHook(() => useReducedMotion()).result.current).toBe(false);
  });

  it("lets the in-app override win over the OS setting", () => {
    restore = mockMatchMedia(true);
    document.documentElement.dataset.reduceMotion = "off";
    expect(getPrefersReducedMotion()).toBe(false);

    restore();
    restore = mockMatchMedia(false);
    document.documentElement.dataset.reduceMotion = "on";
    expect(getPrefersReducedMotion()).toBe(true);
  });

  it("updates when the in-app override changes", async () => {
    restore = mockMatchMedia(false);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);

    await act(async () => {
      document.documentElement.dataset.reduceMotion = "on";
      // MutationObserver callbacks run as microtasks.
      await Promise.resolve();
    });
    expect(result.current).toBe(true);
  });

  it("maps the preference to a scroll behavior", () => {
    expect(scrollBehaviorFor(true)).toBe("auto");
    expect(scrollBehaviorFor(false)).toBe("smooth");
  });
});
