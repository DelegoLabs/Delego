import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_MAX_FEE_CAP_STROOPS,
  MAX_FEE_CAP_STORAGE_KEY,
  clearMaxFeeCapStroops,
  isValidMaxFeeCapStroops,
  readMaxFeeCapStroops,
  writeMaxFeeCapStroops,
} from "./maxFeeCap";

describe("max fee cap preference", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("accepts a positive integer number of stroops", () => {
    expect(isValidMaxFeeCapStroops("1")).toBe(true);
    expect(isValidMaxFeeCapStroops("100000")).toBe(true);
    expect(isValidMaxFeeCapStroops(" 250 ")).toBe(true);
  });

  it("rejects zero, negatives and non-integers", () => {
    expect(isValidMaxFeeCapStroops("0")).toBe(false);
    expect(isValidMaxFeeCapStroops("-1")).toBe(false);
    expect(isValidMaxFeeCapStroops("1.5")).toBe(false);
    expect(isValidMaxFeeCapStroops("nope")).toBe(false);
    expect(isValidMaxFeeCapStroops("")).toBe(false);
  });

  it("falls back to the default when nothing is stored", () => {
    expect(readMaxFeeCapStroops()).toBe(DEFAULT_MAX_FEE_CAP_STROOPS);
  });

  it("persists a valid limit and reads it back", () => {
    expect(writeMaxFeeCapStroops("250000")).toBe(true);
    expect(window.localStorage.getItem(MAX_FEE_CAP_STORAGE_KEY)).toBe("250000");
    expect(readMaxFeeCapStroops()).toBe("250000");
  });

  it("ignores an invalid write and leaves the stored limit untouched", () => {
    writeMaxFeeCapStroops("250000");
    expect(writeMaxFeeCapStroops("0")).toBe(false);
    expect(writeMaxFeeCapStroops("nope")).toBe(false);
    expect(readMaxFeeCapStroops()).toBe("250000");
  });

  it("ignores a malformed stored value", () => {
    window.localStorage.setItem(MAX_FEE_CAP_STORAGE_KEY, "garbage");
    expect(readMaxFeeCapStroops()).toBe(DEFAULT_MAX_FEE_CAP_STROOPS);
  });

  it("resets back to the default", () => {
    writeMaxFeeCapStroops("250000");
    clearMaxFeeCapStroops();
    expect(readMaxFeeCapStroops()).toBe(DEFAULT_MAX_FEE_CAP_STROOPS);
  });
});
