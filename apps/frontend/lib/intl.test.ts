import { describe, it, expect } from "vitest";
import {
  formatDate,
  formatDateTime,
  formatDateTimeWithPreferences,
  formatFullDateTimeWithPreferences,
  formatNumber,
  formatRelativeTime,
  formatTimeWithPreferences,
} from "./intl";
import type { TimeFormatPreferences } from "./timeFormat";

describe("formatDate", () => {
  it("formats using the given locale", () => {
    const date = new Date(Date.UTC(2026, 0, 15));
    expect(formatDate(date, "en-US")).toContain("2026");
    expect(formatDate(date, "de-DE")).toContain("2026");
  });

  it("respects custom formatting options", () => {
    const date = new Date(Date.UTC(2026, 0, 15));
    const result = formatDate(date, "en-US", { year: "numeric" });
    expect(result).toBe("2026");
  });
});

describe("formatDateTime", () => {
  it("includes both date and time by default", () => {
    const date = new Date(Date.UTC(2026, 0, 15, 12, 30));
    const result = formatDateTime(date, "en-US");
    expect(result).toContain("2026");
  });
});

describe("formatNumber", () => {
  it("formats numbers per the given locale", () => {
    expect(formatNumber(1234.5, "en-US")).toBe("1,234.5");
    expect(formatNumber(1234.5, "de-DE")).toBe("1.234,5");
  });

  it("applies custom options", () => {
    expect(
      formatNumber(0.4567, "en-US", {
        style: "percent",
        maximumFractionDigits: 1,
      })
    ).toBe("45.7%");
  });
});

const AUTO_24H: TimeFormatPreferences = {
  timezone: "auto",
  clockFormat: "24h",
  firstDayOfWeek: 1,
};

describe("formatDateTimeWithPreferences", () => {
  const date = new Date("2026-06-15T14:30:00.000Z");

  it("renders 24-hour time when clockFormat is 24h", () => {
    const result = formatDateTimeWithPreferences(date, "en-US", {
      timezone: "UTC",
      clockFormat: "24h",
      firstDayOfWeek: 1,
    });
    expect(result).toContain("14:30");
    expect(result).not.toMatch(/\bAM\b|\bPM\b/);
  });

  it("renders 12-hour time with AM/PM when clockFormat is 12h", () => {
    const result = formatDateTimeWithPreferences(date, "en-US", {
      timezone: "UTC",
      clockFormat: "12h",
      firstDayOfWeek: 1,
    });
    expect(result).toMatch(/\bPM\b/);
    expect(result).toContain("2:30");
  });

  it("shifts the displayed hour according to the chosen timezone", () => {
    const utcResult = formatDateTimeWithPreferences(date, "en-US", {
      timezone: "UTC",
      clockFormat: "24h",
      firstDayOfWeek: 1,
    });
    const tokyoResult = formatDateTimeWithPreferences(date, "en-US", {
      timezone: "Asia/Tokyo",
      clockFormat: "24h",
      firstDayOfWeek: 1,
    });
    expect(utcResult).toContain("14:30");
    expect(tokyoResult).toContain("23:30");
  });

  it("resolves 'auto' to the environment's timezone rather than erroring", () => {
    expect(() =>
      formatDateTimeWithPreferences(date, "en-US", AUTO_24H)
    ).not.toThrow();
  });

  it("respects custom Intl options passed alongside preferences", () => {
    const result = formatDateTimeWithPreferences(
      date,
      "en-US",
      { timezone: "UTC", clockFormat: "24h", firstDayOfWeek: 1 },
      { year: "numeric", month: "short", day: "numeric" }
    );
    expect(result).toBe("Jun 15, 2026");
  });
});

describe("formatTimeWithPreferences", () => {
  const date = new Date("2026-06-15T14:30:00.000Z");

  it("formats time-only, honoring the clock format", () => {
    const result24 = formatTimeWithPreferences(date, "en-US", {
      timezone: "UTC",
      clockFormat: "24h",
      firstDayOfWeek: 1,
    });
    const result12 = formatTimeWithPreferences(date, "en-US", {
      timezone: "UTC",
      clockFormat: "12h",
      firstDayOfWeek: 1,
    });
    expect(result24).not.toContain("2026");
    expect(result24).toBe("14:30");
    expect(result12).toMatch(/2:30\s*PM/);
  });
});

describe("formatFullDateTimeWithPreferences", () => {
  it("includes both a date portion and a time portion", () => {
    const date = new Date("2026-06-15T14:30:00.000Z");
    const result = formatFullDateTimeWithPreferences(date, "en-US", {
      timezone: "UTC",
      clockFormat: "24h",
      firstDayOfWeek: 1,
    });
    expect(result).toContain("2026");
    expect(result).toContain("14:30");
  });
});

describe("formatRelativeTime", () => {
  const now = new Date("2026-06-15T12:00:00.000Z");

  it("returns 'just now' for differences under a minute", () => {
    const date = new Date(now.getTime() - 30_000);
    expect(formatRelativeTime(date, "en-US", now)).toBe("just now");
  });

  it("formats minutes ago", () => {
    const date = new Date(now.getTime() - 5 * 60_000);
    expect(formatRelativeTime(date, "en-US", now)).toMatch(/5 minutes ago/);
  });

  it("formats hours ago", () => {
    const date = new Date(now.getTime() - 3 * 60 * 60_000);
    expect(formatRelativeTime(date, "en-US", now)).toMatch(/3 hours ago/);
  });

  it("formats days ago", () => {
    const date = new Date(now.getTime() - 2 * 24 * 60 * 60_000);
    expect(formatRelativeTime(date, "en-US", now)).toMatch(/2 days ago/);
  });

  it("formats a future time as 'in N minutes'", () => {
    const date = new Date(now.getTime() + 10 * 60_000);
    expect(formatRelativeTime(date, "en-US", now)).toMatch(/in 10 minutes/);
  });

  it("is locale-aware", () => {
    const date = new Date(now.getTime() - 2 * 60 * 60_000);
    const de = formatRelativeTime(date, "de-DE", now);
    expect(de).not.toMatch(/hours ago/);
  });
});
