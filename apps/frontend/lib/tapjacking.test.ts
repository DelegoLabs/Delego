import { afterEach, describe, expect, it, vi } from "vitest";
import { inspectTapTarget } from "./tapjacking";

const originalElementFromPoint = document.elementFromPoint;

describe("inspectTapTarget", () => {
  afterEach(() => {
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: originalElementFromPoint,
    });
  });

  it("identifies a transparent overlay covering a protected button", () => {
    const button = document.createElement("button");
    const overlay = document.createElement("div");
    overlay.style.opacity = "0.01";
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => overlay),
    });

    expect(inspectTapTarget(button, 20, 30)).toEqual({
      isObscured: true,
      coveringElementTag: "DIV",
      opacity: 0.01,
    });
  });

  it("accepts the intended button and its descendants", () => {
    const button = document.createElement("button");
    const label = document.createElement("span");
    button.append(label);
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => label),
    });

    expect(inspectTapTarget(button, 20, 30)).toEqual({
      isObscured: false,
      coveringElementTag: undefined,
      opacity: 1,
    });
  });
});
