import { describe, expect, it } from "vitest";
import {
  CODE128_PATTERNS,
  CODE128_QUIET_ZONE,
  Code128Error,
  code128Bars,
  encodeCode128,
  encodeCode128Values,
  isCode128Encodable,
} from "./code128";

const sum = (pattern: string) => [...pattern].reduce((s, d) => s + Number(d), 0);

describe("CODE128_PATTERNS", () => {
  it("has 107 unique symbols of 11 modules (stop: 13)", () => {
    expect(CODE128_PATTERNS).toHaveLength(107);
    expect(new Set(CODE128_PATTERNS).size).toBe(107);
    CODE128_PATTERNS.slice(0, 106).forEach((p) => {
      expect(p).toHaveLength(6);
      expect(sum(p)).toBe(11);
    });
    expect(sum(CODE128_PATTERNS[106]!)).toBe(13);
  });
});

describe("encodeCode128Values", () => {
  it("encodes text in Code Set B with the mod-103 checksum", () => {
    // Start B, W i k i p e d i a, checksum, stop.
    expect(encodeCode128Values("Wikipedia")).toEqual([
      104, 55, 73, 75, 73, 80, 69, 68, 73, 65, 88, 106,
    ]);
  });

  it("packs an all-digit tracking number into Code Set C", () => {
    // 105 + 12*1 + 34*2 = 185 → 185 % 103 = 82
    expect(encodeCode128Values("1234")).toEqual([105, 12, 34, 82, 106]);
  });

  it("switches from B to C for a long trailing digit run", () => {
    const values = encodeCode128Values("AB123456");
    expect(values.slice(0, 6)).toEqual([104, 33, 34, 99, 12, 34]);
    expect(values.at(-1)).toBe(106);
  });

  it("switches back to B after a digit run", () => {
    const values = encodeCode128Values("123456US");
    expect(values.slice(0, 6)).toEqual([105, 12, 34, 56, 100, 53]);
  });

  it("rejects empty or non-printable input", () => {
    expect(() => encodeCode128Values("")).toThrow(Code128Error);
    expect(() => encodeCode128Values("ABC\n")).toThrow(Code128Error);
    expect(isCode128Encodable("9400 1000")).toBe(true);
    expect(isCode128Encodable("é")).toBe(false);
  });
});

describe("encodeCode128 / code128Bars", () => {
  it("produces alternating bars that start and end with a bar", () => {
    const encoding = encodeCode128("420940109400111899223");
    // Every symbol is 11 modules, plus the 13-module stop.
    expect(encoding.totalModules).toBe((encoding.values.length - 1) * 11 + 13);
    expect(encoding.widths.length % 2).toBe(1);

    const bars = code128Bars(encoding);
    expect(bars).toHaveLength((encoding.values.length - 1) * 3 + 4);
    expect(bars[0]!.x).toBe(CODE128_QUIET_ZONE);
    const last = bars.at(-1)!;
    expect(last.x + last.width).toBe(CODE128_QUIET_ZONE + encoding.totalModules);
  });
});
