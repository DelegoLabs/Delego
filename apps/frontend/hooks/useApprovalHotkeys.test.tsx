import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useState } from "react";
import { useApprovalHotkeys } from "./useApprovalHotkeys";

function setup(itemCount: number) {
  const onToggleFocused = vi.fn();
  const { result } = renderHook(() => {
    const [focusedIndex, setFocusedIndex] = useState(0);
    useApprovalHotkeys({ itemCount, setFocusedIndex, onToggleFocused });
    return focusedIndex;
  });
  return { result, onToggleFocused };
}

function pressKey(key: string) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key }));
  });
}

describe("useApprovalHotkeys", () => {
  it("j moves focus forward on the logical list, clamped at the end", () => {
    const { result } = setup(3);
    pressKey("j");
    expect(result.current).toBe(1);
    pressKey("j");
    pressKey("j");
    pressKey("j"); // past the end
    expect(result.current).toBe(2);
  });

  it("k moves focus backward, clamped at zero", () => {
    const { result } = setup(3);
    pressKey("k");
    expect(result.current).toBe(0);
  });

  it("x toggles the focused row via the callback", () => {
    const { onToggleFocused } = setup(3);
    pressKey("x");
    expect(onToggleFocused).toHaveBeenCalledTimes(1);
  });

  it("operates on the full logical list, far larger than any virtualized DOM window (e.g. 1000 rows)", () => {
    const { result } = setup(1000);
    for (let i = 0; i < 500; i++) pressKey("j");
    expect(result.current).toBe(500);
  });
});
