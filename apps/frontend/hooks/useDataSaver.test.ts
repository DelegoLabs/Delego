import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useDataSaver } from "./useDataSaver";

const STORAGE_KEY = "delego-data-saver-mode";

function setConnection(overrides: Partial<{ saveData: boolean; effectiveType: string }> | undefined) {
  Object.defineProperty(navigator, "connection", {
    value: overrides
      ? {
          saveData: false,
          effectiveType: "4g",
          addEventListener: () => {},
          removeEventListener: () => {},
          ...overrides,
        }
      : undefined,
    configurable: true,
  });
}

describe("useDataSaver", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    setConnection(undefined);
  });

  it("defaults to auto mode with reduced mode inactive when there's no connection API", async () => {
    setConnection(undefined);
    const { result } = renderHook(() => useDataSaver());

    await waitFor(() => expect(result.current.mode).toBe("auto"));
    expect(result.current.reducedModeActive).toBe(false);
  });

  it("auto-activates reduced mode when saveData is true", async () => {
    setConnection({ saveData: true });
    const { result } = renderHook(() => useDataSaver());

    await waitFor(() => expect(result.current.reducedModeActive).toBe(true));
    expect(result.current.mode).toBe("auto");
  });

  it("auto-activates reduced mode on a slow effectiveType", async () => {
    setConnection({ saveData: false, effectiveType: "2g" });
    const { result } = renderHook(() => useDataSaver());

    await waitFor(() => expect(result.current.reducedModeActive).toBe(true));
  });

  it("does not activate reduced mode on a fast connection", async () => {
    setConnection({ saveData: false, effectiveType: "4g" });
    const { result } = renderHook(() => useDataSaver());

    await waitFor(() => expect(result.current.mode).toBe("auto"));
    expect(result.current.reducedModeActive).toBe(false);
  });

  it("a manual 'on' override activates reduced mode regardless of connection", async () => {
    setConnection({ saveData: false, effectiveType: "4g" });
    const { result } = renderHook(() => useDataSaver());
    await waitFor(() => expect(result.current.mode).toBe("auto"));

    act(() => result.current.setMode("on"));

    expect(result.current.mode).toBe("on");
    expect(result.current.reducedModeActive).toBe(true);
  });

  it("a manual 'off' override disables reduced mode even on a slow connection", async () => {
    setConnection({ saveData: true });
    const { result } = renderHook(() => useDataSaver());
    await waitFor(() => expect(result.current.reducedModeActive).toBe(true));

    act(() => result.current.setMode("off"));

    expect(result.current.mode).toBe("off");
    expect(result.current.reducedModeActive).toBe(false);
  });

  it("persists the manual override across remounts (survives reload)", async () => {
    setConnection(undefined);
    const { result, unmount } = renderHook(() => useDataSaver());
    await waitFor(() => expect(result.current.mode).toBe("auto"));

    act(() => result.current.setMode("on"));
    expect(localStorage.getItem(STORAGE_KEY)).toBe("on");
    unmount();

    const { result: result2 } = renderHook(() => useDataSaver());
    await waitFor(() => expect(result2.current.mode).toBe("on"));
    expect(result2.current.reducedModeActive).toBe(true);
  });

  it("ignores a corrupted stored value and falls back to auto", async () => {
    localStorage.setItem(STORAGE_KEY, "not-a-real-mode");
    setConnection(undefined);
    const { result } = renderHook(() => useDataSaver());

    await waitFor(() => expect(result.current.mode).toBe("auto"));
  });
});
