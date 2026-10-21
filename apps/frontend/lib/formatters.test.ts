/**
 * Issue #1 — locale-aware formatting. Each assertion pins the wrapper to the
 * output the platform `Intl.*` produces for that locale, so a regression in
 * the fallback/option handling is caught.
 */

import { describe, it, expect } from "vitest";
import {
  createLocaleFormatters,
  formatCurrency,
  formatDate,
  formatNumber,
  formatRelativeTime,
  formatRelativeToNow,
} from "./formatters";

describe("formatNumber", () => {
  it("uses comma-grouping and dot decimals for en-US", () => {
    expect(formatNumber(1234567.89, "en-US")).toBe("1,234,567.89");
  });

  it("differs between en-US and es-ES (localized separators)", () => {
    const en = formatNumber(1234567.89, "en-US");
    const es = formatNumber(1234567.89, "es-ES");
    expect(es).not.toBe(en);
    // es-ES uses "." for thousands and "," for decimals.
    expect(es).toContain(".");
    expect(es).toContain(",");
  });

  it("formats fr-FR and ja-JP without throwing", () => {
    expect(formatNumber(1234567.89, "fr-FR")).toMatch(/1[\s\u202f]?234/);
    expect(formatNumber(1234567.89, "ja-JP")).toBe("1,234,567.89");
  });

  it("falls back to the raw value for non-finite input", () => {
    expect(formatNumber(Number.NaN, "en-US")).toBe("NaN");
  });
});

describe("formatCurrency", () => {
  it("places the symbol and two decimals for en-US USD", () => {
    expect(formatCurrency(1234.5, "USD", "en-US")).toBe("$1,234.50");
  });

  it("localizes EUR for fr-FR", () => {
    const fr = formatCurrency(1234.5, "EUR", "fr-FR");
    expect(fr).toContain("€");
    expect(fr).toContain("234");
  });

  it("omits minor units for JPY in ja-JP", () => {
    const ja = formatCurrency(1234.5, "JPY", "ja-JP");
    expect(ja).toContain("1,235");
    expect(ja).not.toContain(".");
  });
});

describe("formatRelativeTime", () => {
  it("uses the past-tense English phrase", () => {
    expect(formatRelativeTime(-2, "day", "en-US")).toBe("2 days ago");
  });

  it("localizes to Spanish, French and Japanese", () => {
    // -3 (not -2) avoids each locale's special word for "the day before
    // yesterday" under numeric:"auto" ("anteayer" / "avant-hier" / "一昨日").
    expect(formatRelativeTime(-3, "day", "es-ES")).toContain("días");
    expect(formatRelativeTime(-3, "day", "fr-FR")).toContain("jours");
    expect(formatRelativeTime(-3, "day", "ja-JP")).toContain("日前");
  });
});

describe("formatRelativeToNow", () => {
  it("picks the largest sensible unit", () => {
    const now = Date.UTC(2026, 0, 10, 12, 0, 0);
    expect(formatRelativeToNow(Date.UTC(2026, 0, 8, 12, 0, 0), "en-US", now)).toBe(
      "2 days ago"
    );
    expect(
      formatRelativeToNow(Date.UTC(2026, 0, 10, 11, 30, 0), "en-US", now)
    ).toBe("30 minutes ago");
  });

  it("returns an empty string for invalid dates", () => {
    expect(formatRelativeToNow("not-a-date", "en-US", Date.now())).toBe("");
  });
});

describe("formatDate / createLocaleFormatters", () => {
  it("localizes the date layout", () => {
    const date = Date.UTC(2026, 0, 2, 12, 0, 0);
    expect(formatDate(date, "en-US", { timeZone: "UTC" })).toBe("Jan 2, 2026");
    expect(formatDate(date, "ja-JP", { timeZone: "UTC" })).toContain("2026");
  });

  it("binds every formatter to a single locale", () => {
    const bound = createLocaleFormatters("en-US");
    expect(bound.formatNumber(1000)).toBe("1,000");
    expect(bound.formatCurrency(5, "USD")).toBe("$5.00");
  });
});
