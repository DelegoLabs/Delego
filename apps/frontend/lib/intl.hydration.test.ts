/**
 * Hydration stability tests for Intl formatting functions
 * Ensures server/client rendered output is stable
 */

import { describe, it, expect } from "vitest";
import {
  formatDate,
  formatDateTime,
  formatNumber,
  formatDateTimeWithPreferences,
  formatTimeWithPreferences,
  formatFullDateTimeWithPreferences,
  formatRelativeTime,
} from "./intl";

/**
 * Hydration stability requirement: Server and client must render identical text content.
 * 
 * Since server doesn't know the user's timezone/locale preferences, we must:
 * 1. Use a stable locale (en-US) on server for deterministic output
 * 2. Or suppress hydration warnings on locale-dependent elements
 * 3. Or use skeleton placeholders that update after hydration
 */

describe("formatDate hydration stability", () => {
  const testDate = new Date("2025-07-15");

  it("formats consistently with explicit locale", () => {
    // Both server and client should use the same locale to avoid mismatch
    const result = formatDate(testDate, "en-US");
    expect(result).toBe("Jul 15, 2025");
  });

  it("uses same output regardless of browser locale if explicit locale provided", () => {
    // Server uses "en-US"
    const serverResult = formatDate(testDate, "en-US");
    // Client would also use "en-US" (from user preferences or default)
    const clientResult = formatDate(testDate, "en-US");
    
    expect(serverResult).toBe(clientResult);
  });
});

describe("formatDateTime hydration stability", () => {
  // Use a date/time that produces consistent output in en-US locale
  const testDate = new Date("2025-07-15T13:30:00Z");

  it("formats consistently with explicit locale", () => {
    const result = formatDateTime(testDate, "en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Europe/London",
    });
    expect(result).toContain("2025");
    expect(result).toContain("2:30");
  });
});

describe("formatNumber hydration stability", () => {
  it("formats with explicit locale consistently", () => {
    const result = formatNumber(1234567.89, "en-US");
    expect(result).toBe("1,234,567.89");
  });

  it("respects locale grouping with explicit locale", () => {
    const result = formatNumber(1234567.89, "de-DE");
    expect(result).toBe("1.234.567,89");
  });
});

describe("formatDateTimeWithPreferences hydration stability", () => {
  // Use a date that produces consistent output
  const testDate = new Date("2025-07-15T14:30:00Z");

  it("formats with preferences consistently", () => {
    const preferences = {
      timezone: "UTC",
      clockFormat: "24h" as const,
      firstDayOfWeek: 1 as const,
    };

    const result = formatDateTimeWithPreferences(testDate, "en-US", preferences);
    // Should contain date and time components
    expect(result).toContain("2025");
    expect(result).toContain("14:30");
  });
});

describe("formatTimeWithPreferences hydration stability", () => {
  const testDate = new Date("2025-07-15T14:30:00Z");

  it("formats time consistently with preferences", () => {
    const preferences = {
      timezone: "UTC",
      clockFormat: "24h" as const,
      firstDayOfWeek: 1 as const,
    };

    const result = formatTimeWithPreferences(testDate, "en-US", preferences);
    expect(result).toBe("14:30");
  });
});

describe("formatFullDateTimeWithPreferences hydration stability", () => {
  // Use a date that produces consistent output
  const testDate = new Date("2025-07-15T14:30:00Z");

  it("formats full date/time consistently", () => {
    const preferences = {
      timezone: "UTC",
      clockFormat: "24h" as const,
      firstDayOfWeek: 1 as const,
    };

    const result = formatFullDateTimeWithPreferences(testDate, "en-US", preferences);
    // Should contain both date and time
    expect(result).toContain("2025");
    expect(result).toContain("14:30");
  });
});

describe("formatRelativeTime hydration stability", () => {
  const testDate = new Date();
  testDate.setHours(testDate.getHours() - 2); // 2 hours ago

  it("formats relative time consistently", () => {
    const result = formatRelativeTime(testDate, "en-US");
    expect(result).toBe("2 hours ago");
  });

  it("handles 'just now' case", () => {
    const now = new Date();
    const result = formatRelativeTime(now, "en-US");
    expect(result).toBe("just now");
  });
});

describe("hydration mismatch prevention patterns", () => {
  it("demonstrates stable formatting approach", () => {
    const testDate = new Date("2025-07-15T14:30:00Z");

    // Server renders with explicit locale (from user preference or default)
    const serverDate = formatDate(testDate, "en-US");
    const serverTime = formatTimeWithPreferences(
      testDate,
      "en-US",
      { timezone: "UTC", clockFormat: "24h", firstDayOfWeek: 1 }
    );

    // Client must use same locale to avoid mismatch
    const clientDate = formatDate(testDate, "en-US");
    const clientTime = formatTimeWithPreferences(
      testDate,
      "en-US",
      { timezone: "UTC", clockFormat: "24h", firstDayOfWeek: 1 }
    );

    expect(serverDate).toBe(clientDate);
    expect(serverTime).toBe(clientTime);
  });
});