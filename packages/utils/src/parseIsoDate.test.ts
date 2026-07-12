import { describe, it, expect } from "vitest";
import { parseIsoDate } from "./parseIsoDate.js";

describe("parseIsoDate", () => {
  it("parses a valid ISO-8601 UTC date string", () => {
    const result = parseIsoDate("2026-06-30T12:00:00Z");
    expect(result.valid).toBe(true);
    expect(result.date).toBeInstanceOf(Date);
    expect(result.date!.toISOString()).toBe("2026-06-30T12:00:00.000Z");
  });

  it("parses with numeric timezone offset", () => {
    const result = parseIsoDate("2026-06-30T12:00:00+02:00");
    expect(result.valid).toBe(true);
  });

  it("rejects null/undefined", () => {
    expect(parseIsoDate(null)).toMatchObject({ valid: false, error: "missing" });
    expect(parseIsoDate(undefined)).toMatchObject({ valid: false, error: "missing" });
  });

  it("rejects non-string input", () => {
    expect(parseIsoDate(123)).toMatchObject({ valid: false, error: "invalid_type" });
  });

  it("rejects empty string", () => {
    expect(parseIsoDate("")).toMatchObject({ valid: false, error: "missing" });
  });

  it("rejects date-only strings", () => {
    expect(parseIsoDate("2026-06-30")).toMatchObject({ valid: false, error: "invalid_format" });
  });

  it("rejects invalid date strings", () => {
    expect(parseIsoDate("not-a-date")).toMatchObject({ valid: false, error: "invalid_format" });
  });

  it("rejects future dates when rejectFuture is set", () => {
    const farFuture = "3000-01-01T00:00:00Z";
    expect(parseIsoDate(farFuture, { rejectFuture: true })).toMatchObject({ valid: false, error: "future_not_allowed" });
  });

  it("accepts past dates when rejectFuture is set", () => {
    expect(parseIsoDate("2020-01-01T00:00:00Z", { rejectFuture: true })).toMatchObject({ valid: true });
  });
});