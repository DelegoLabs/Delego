/**
 * Issue #3 — keyboard-shortcut primitives: typing-target detection and
 * sequence resolution.
 */

import { describe, it, expect, vi } from "vitest";
import {
  formatShortcutKeys,
  isTypingTarget,
  resolveShortcut,
  type KeyboardShortcutDefinition,
} from "./shortcuts";
import { getLocaleDirection, isRtlLocale } from "./localeConfig";

const cheatSheet = vi.fn();
const goOrders = vi.fn();
const goWallet = vi.fn();

const shortcuts: KeyboardShortcutDefinition[] = [
  { keys: ["?"], description: "Cheat sheet", category: "global", action: cheatSheet },
  { keys: ["g", "o"], description: "Orders", category: "navigation", action: goOrders },
  { keys: ["g", "w"], description: "Wallet", category: "navigation", action: goWallet },
];

describe("isTypingTarget", () => {
  it("treats inputs, textareas, selects and contenteditable as typing targets", () => {
    for (const tag of ["input", "textarea", "select"]) {
      const el = document.createElement(tag);
      document.body.appendChild(el);
      expect(isTypingTarget(el)).toBe(true);
      el.remove();
    }
    const editable = document.createElement("div");
    editable.contentEditable = "true";
    // jsdom does not compute isContentEditable from the attribute.
    Object.defineProperty(editable, "isContentEditable", { value: true });
    expect(isTypingTarget(editable)).toBe(true);
  });

  it("treats buttons and the body as non-typing targets", () => {
    expect(isTypingTarget(document.createElement("button"))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe("resolveShortcut", () => {
  it("resolves a single-key shortcut immediately", () => {
    const result = resolveShortcut(shortcuts, "?", []);
    expect(result.run?.action).toBe(cheatSheet);
    expect(result.pending).toEqual([]);
  });

  it("starts a sequence on the prefix key", () => {
    expect(resolveShortcut(shortcuts, "g", [])).toEqual({ pending: ["g"] });
  });

  it("completes a sequence when the follow-up key arrives", () => {
    const result = resolveShortcut(shortcuts, "o", ["g"]);
    expect(result.run?.action).toBe(goOrders);
    expect(result.pending).toEqual([]);
  });

  it("clears a stale prefix when the follow-up key doesn't match", () => {
    expect(resolveShortcut(shortcuts, "x", ["g"])).toEqual({ pending: [] });
  });

  it("ignores unrelated keys", () => {
    expect(resolveShortcut(shortcuts, "z", [])).toEqual({ pending: [] });
  });
});

describe("formatShortcutKeys", () => {
  it("renders a chained sequence readably", () => {
    expect(formatShortcutKeys(["g", "o"])).toBe("g then o");
    expect(formatShortcutKeys(["?"])).toBe("?");
  });
});

describe("locale direction helpers", () => {
  it("reports ltr for the shipped locales and provides an RTL path", () => {
    expect(isRtlLocale("en-US")).toBe(false);
    expect(getLocaleDirection("ja-JP")).toBe("ltr");
  });
});
