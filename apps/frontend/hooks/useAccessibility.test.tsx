import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useAccessibility } from "./useAccessibility";

describe("useAccessibility system font preference", () => {
  afterEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove("font-sans-system");
  });

  it("persists the preference and toggles the system font class", () => {
    const { result } = renderHook(() => useAccessibility());

    act(() => result.current.setUseSystemFonts(true));

    expect(result.current.preferences.useSystemFonts).toBe(true);
    expect(document.documentElement).toHaveClass("font-sans-system");
    expect(
      JSON.parse(window.localStorage.getItem("delego-a11y-prefs") ?? "{}")
    ).toMatchObject({ useSystemFonts: true, fontDisplaySwap: true });

    act(() => result.current.setUseSystemFonts(false));
    expect(document.documentElement).not.toHaveClass("font-sans-system");
  });
});
