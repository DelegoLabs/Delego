import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { formatShortcut, isApplePlatform, useShortcutHint } from "./useShortcutHint";

describe("useShortcutHint", () => {
  it("formats ⌘ on Apple platforms and Ctrl+ elsewhere", () => {
    expect(formatShortcut("k", true)).toBe("⌘K");
    expect(formatShortcut("k", false)).toBe("Ctrl+K");
  });

  it("detects Apple platforms", () => {
    expect(isApplePlatform("MacIntel")).toBe(true);
    expect(isApplePlatform("iPhone")).toBe(true);
    expect(isApplePlatform("Win32")).toBe(false);
    expect(isApplePlatform("Linux x86_64")).toBe(false);
  });

  it("exposes aria-keyshortcuts covering both modifiers", () => {
    const { result } = renderHook(() => useShortcutHint("j"));
    expect(result.current.ariaKeyShortcuts).toBe("Meta+J Control+J");
  });
});
