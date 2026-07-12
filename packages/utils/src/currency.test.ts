import { describe, it, expect } from "vitest";
import { stroopsToDisplay, displayToStroops } from "./currency.js";

describe("stroopsToDisplay", () => {
  it("converts 1 XLM correctly", () => {
    expect(stroopsToDisplay(10_000_000n)).toBe("1.0000000");
  });

  it("converts fractional XLM", () => {
    expect(stroopsToDisplay(1_500_000n)).toBe("0.1500000");
  });

  it("respects decimal places", () => {
    expect(stroopsToDisplay(10_000_000n, 2)).toBe("1.00");
  });

  it("handles zero", () => {
    expect(stroopsToDisplay(0n)).toBe("0.0000000");
  });
});

describe("displayToStroops", () => {
  it("converts whole XLM to stroops", () => {
    expect(displayToStroops("1")).toBe(10_000_000n);
  });

  it("converts decimal XLM to stroops", () => {
    expect(displayToStroops("0.15")).toBe(1_500_000n);
  });

  it("handles zero", () => {
    expect(displayToStroops("0")).toBe(0n);
  });

  it("round-trips display/parse", () => {
    const original = 123456789n;
    expect(displayToStroops(stroopsToDisplay(original))).toBe(original);
  });
});