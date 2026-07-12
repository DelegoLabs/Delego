import { describe, it, expect } from "vitest";
import { parseBigIntString } from "./parseBigIntString.js";

describe("parseBigIntString", () => {
  it("parses a valid non-negative integer string", () => {
    expect(parseBigIntString("42")).toEqual({ valid: true, value: 42n });
  });

  it("rejects null/undefined", () => {
    expect(parseBigIntString(null)).toMatchObject({ valid: false, error: "missing" });
    expect(parseBigIntString(undefined)).toMatchObject({ valid: false, error: "missing" });
  });

  it("rejects non-string input", () => {
    expect(parseBigIntString(123)).toMatchObject({ valid: false, error: "invalid_type" });
  });

  it("rejects empty string", () => {
    expect(parseBigIntString("")).toMatchObject({ valid: false, error: "missing" });
  });

  it("rejects negative when not allowed (default)", () => {
    expect(parseBigIntString("-5")).toMatchObject({ valid: false, error: "invalid_format" });
  });

  it("allows negative when configured", () => {
    expect(parseBigIntString("-5", { allowNegative: true })).toEqual({ valid: true, value: -5n });
  });

  it("requires positive", () => {
    expect(parseBigIntString("0", { requirePositive: true })).toMatchObject({ valid: false, error: "must_be_positive" });
    expect(parseBigIntString("1", { requirePositive: true })).toEqual({ valid: true, value: 1n });
  });

  it("rejects exceeding max", () => {
    expect(parseBigIntString("100", { max: 50n })).toMatchObject({ valid: false, error: "exceeds_max" });
  });

  it("rejects decimal strings", () => {
    expect(parseBigIntString("1.5")).toMatchObject({ valid: false, error: "invalid_format" });
  });

  it("trims whitespace", () => {
    expect(parseBigIntString("  42  ")).toEqual({ valid: true, value: 42n });
  });
});