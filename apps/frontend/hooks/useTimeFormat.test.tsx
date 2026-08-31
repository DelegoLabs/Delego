import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { TimeFormatProvider, useTimeFormat } from "./useTimeFormat";
import {
  TIME_FORMAT_STORAGE_KEY,
  type TimeFormatPreferences,
} from "../lib/timeFormat";

function wrapper({ children }: { children: ReactNode }) {
  return <TimeFormatProvider>{children}</TimeFormatProvider>;
}

describe("useTimeFormat", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("defaults to auto timezone, 24h, and Monday first — and hydrates", async () => {
    const { result } = renderHook(() => useTimeFormat(), { wrapper });

    expect(result.current.preferences).toEqual({
      timezone: "auto",
      clockFormat: "24h",
      firstDayOfWeek: 1,
    });

    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.preferences.timezone).toBe("auto");
  });

  it("resolves the auto timezone to a real IANA timezone string", async () => {
    const { result } = renderHook(() => useTimeFormat(), { wrapper });
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    expect(result.current.effectiveTimezone).not.toBe("auto");
    expect(result.current.effectiveTimezone.length).toBeGreaterThan(0);
  });

  it("hydrates a persisted preference set from localStorage", async () => {
    const stored: TimeFormatPreferences = {
      timezone: "Asia/Tokyo",
      clockFormat: "12h",
      firstDayOfWeek: 7,
    };
    window.localStorage.setItem(
      TIME_FORMAT_STORAGE_KEY,
      JSON.stringify(stored)
    );

    const { result } = renderHook(() => useTimeFormat(), { wrapper });
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    expect(result.current.preferences).toEqual(stored);
    expect(result.current.effectiveTimezone).toBe("Asia/Tokyo");
  });

  it("ignores malformed JSON in localStorage and keeps the default", async () => {
    window.localStorage.setItem(TIME_FORMAT_STORAGE_KEY, "{not json");

    const { result } = renderHook(() => useTimeFormat(), { wrapper });
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    expect(result.current.preferences.timezone).toBe("auto");
  });

  it("ignores a persisted value with an invalid clockFormat and keeps the default", async () => {
    window.localStorage.setItem(
      TIME_FORMAT_STORAGE_KEY,
      JSON.stringify({
        timezone: "UTC",
        clockFormat: "30h",
        firstDayOfWeek: 1,
      })
    );

    const { result } = renderHook(() => useTimeFormat(), { wrapper });
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    expect(result.current.preferences.clockFormat).toBe("24h");
  });

  it("ignores a persisted value with an invalid timezone and keeps the default", async () => {
    window.localStorage.setItem(
      TIME_FORMAT_STORAGE_KEY,
      JSON.stringify({
        timezone: "Not/A_Real_Zone",
        clockFormat: "24h",
        firstDayOfWeek: 1,
      })
    );

    const { result } = renderHook(() => useTimeFormat(), { wrapper });
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    expect(result.current.preferences.timezone).toBe("auto");
  });

  it("setPreferences switches the active preferences and persists them", async () => {
    const { result } = renderHook(() => useTimeFormat(), { wrapper });
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => {
      result.current.setPreferences({
        timezone: "Europe/London",
        clockFormat: "12h",
        firstDayOfWeek: 7,
      });
    });

    expect(result.current.preferences.timezone).toBe("Europe/London");
    expect(result.current.preferences.clockFormat).toBe("12h");
    expect(result.current.effectiveTimezone).toBe("Europe/London");
    expect(
      JSON.parse(window.localStorage.getItem(TIME_FORMAT_STORAGE_KEY) ?? "{}")
    ).toEqual({
      timezone: "Europe/London",
      clockFormat: "12h",
      firstDayOfWeek: 7,
    });
  });

  it("syncs the preference set across tabs via the storage event", async () => {
    const { result } = renderHook(() => useTimeFormat(), { wrapper });
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    const next: TimeFormatPreferences = {
      timezone: "America/Sao_Paulo",
      clockFormat: "12h",
      firstDayOfWeek: 1,
    };
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: TIME_FORMAT_STORAGE_KEY,
          newValue: JSON.stringify(next),
        })
      );
    });

    expect(result.current.preferences).toEqual(next);
  });

  it("ignores a storage event for a different key", async () => {
    const { result } = renderHook(() => useTimeFormat(), { wrapper });
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "some-other-key",
          newValue: JSON.stringify({
            timezone: "America/Sao_Paulo",
            clockFormat: "12h",
            firstDayOfWeek: 1,
          }),
        })
      );
    });

    expect(result.current.preferences.timezone).toBe("auto");
  });

  it("throws when used outside a TimeFormatProvider", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    expect(() => renderHook(() => useTimeFormat())).toThrow(
      "useTimeFormat must be used within a TimeFormatProvider"
    );
    consoleError.mockRestore();
  });
});
