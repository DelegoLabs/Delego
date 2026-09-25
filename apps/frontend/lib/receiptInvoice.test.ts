import { describe, it, expect } from "vitest";
import {
  CODE39_PATTERN_TABLE,
  encodeCode39,
  receiptStroops,
  sanitizeCode39,
} from "./receiptInvoice";

describe("receiptStroops", () => {
  it("parses stroops strings and falls back to 0", () => {
    expect(receiptStroops("12500000")).toBe(12500000n);
    expect(receiptStroops(" 7 ")).toBe(7n);
    expect(receiptStroops("abc")).toBe(0n);
  });
});

describe("Code 39", () => {
  it("every symbol has 9 elements with exactly 3 wide", () => {
    for (const pattern of Object.values(CODE39_PATTERN_TABLE)) {
      expect(pattern).toHaveLength(9);
      expect(pattern.split("").filter((c) => c === "w")).toHaveLength(3);
    }
  });

  it("sanitizes unsupported characters", () => {
    expect(sanitizeCode39("ord_ab*1")).toBe("ORD-AB-1");
  });

  it("encodes start/stop plus payload as 5 bars per symbol", () => {
    const { bars, width } = encodeCode39("A1");
    // "*A1*" → 4 symbols × 5 bars
    expect(bars).toHaveLength(20);
    // each symbol is 6 narrow + 3 wide (×3) = 15 modules, plus 3 gaps
    expect(width).toBe(4 * 15 + 3);
  });
});
