/**
 * Issue #3 — global keyboard shortcuts. Exercises the window-level listener in
 * GlobalShortcutsProvider: the `?` cheat sheet, `g`‑prefixed navigation
 * sequences, the typing-target guard and the browser-shortcut passthrough.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { GlobalShortcutsProvider } from "./useGlobalShortcuts";
import { SEQUENCE_TIMEOUT_MS } from "../lib/shortcuts";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

function fireKey(
  key: string,
  opts: KeyboardEventInit = {},
  target: Element | Node | Window | Document = window
) {
  fireEvent.keyDown(target, { key, bubbles: true, cancelable: true, ...opts });
}

function renderProvider() {
  return render(
    <GlobalShortcutsProvider>
      <button type="button">Focusable</button>
      <input aria-label="Search" />
    </GlobalShortcutsProvider>
  );
}

describe("GlobalShortcutsProvider", () => {
  beforeEach(() => {
    push.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens the cheat sheet with ? and closes it with Escape", () => {
    renderProvider();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireKey("?");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Keyboard shortcuts")).toBeInTheDocument();

    fireKey("Escape");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("navigates via a 'g o' sequence", () => {
    renderProvider();
    fireKey("g");
    fireKey("o");
    expect(push).toHaveBeenCalledWith("/orders");
  });

  it("expires a pending sequence prefix after the timeout", () => {
    vi.useFakeTimers();
    renderProvider();

    fireKey("g");
    act(() => {
      vi.advanceTimersByTime(SEQUENCE_TIMEOUT_MS + 1);
    });
    fireKey("o");

    expect(push).not.toHaveBeenCalled();
  });

  it("ignores shortcuts while typing in a form field", () => {
    renderProvider();
    const input = screen.getByLabelText("Search");

    fireKey("g", {}, input);
    fireKey("o", {}, input);

    expect(push).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not shadow browser shortcuts (Cmd/Ctrl/Alt)", () => {
    renderProvider();

    fireKey("?", { metaKey: true });
    fireKey("?", { ctrlKey: true });
    fireKey("?", { altKey: true });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
