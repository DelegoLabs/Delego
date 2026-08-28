import { describe, it, expect } from "vitest";
import {
  AUTO_TIMEZONE,
  COMMON_TIMEZONES,
  DEFAULT_TIME_FORMAT_PREFERENCES,
  getBrowserTimezone,
  isClockFormat,
  isFirstDayOfWeek,
  isTimeFormatPreferences,
  isValidTimezone,
  resolveTimezone,
} from "./timeFormat";

describe("resolveTimezone", () => {
  it("resolves 'auto' to a real IANA timezone string", () => {
    const resolved = resolveTimezone(AUTO_TIMEZONE);
    expect(resolved).not.toBe(AUTO_TIMEZONE);
    expect(resolved.length).toBeGreaterThan(0);
  });

  it("passes an explicit timezone through unchanged", () => {
    expect(resolveTimezone("Asia/Tokyo")).toBe("Asia/Tokyo");
  });
});

describe("getBrowserTimezone", () => {
  it("returns a non-empty string", () => {
    expect(getBrowserTimezone().length).toBeGreaterThan(0);
  });
});

describe("isValidTimezone", () => {
  it("accepts 'auto'", () => {
    expect(isValidTimezone(AUTO_TIMEZONE)).toBe(true);
  });

  it("accepts every entry in COMMON_TIMEZONES", () => {
    for (const tz of COMMON_TIMEZONES) {
      expect(isValidTimezone(tz)).toBe(true);
    }
  });

  it("rejects a made-up timezone name", () => {
    expect(isValidTimezone("Not/A_Real_Zone")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isValidTimezone("")).toBe(false);
  });
});

describe("isClockFormat", () => {
  it("accepts 12h and 24h", () => {
    expect(isClockFormat("12h")).toBe(true);
    expect(isClockFormat("24h")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isClockFormat("30h")).toBe(false);
    expect(isClockFormat("")).toBe(false);
  });
});

describe("isFirstDayOfWeek", () => {
  it("accepts every integer 1 through 7", () => {
    for (let day = 1; day <= 7; day++) {
      expect(isFirstDayOfWeek(day)).toBe(true);
    }
  });

  it("rejects 0, 8, and non-integers", () => {
    expect(isFirstDayOfWeek(0)).toBe(false);
    expect(isFirstDayOfWeek(8)).toBe(false);
    expect(isFirstDayOfWeek(1.5)).toBe(false);
  });
});

describe("isTimeFormatPreferences", () => {
  it("accepts a fully valid preferences object", () => {
    expect(
      isTimeFormatPreferences({
        timezone: "UTC",
        clockFormat: "24h",
        firstDayOfWeek: 1,
      })
    ).toBe(true);
  });

  it("accepts the default preferences object", () => {
    expect(isTimeFormatPreferences(DEFAULT_TIME_FORMAT_PREFERENCES)).toBe(
      true
    );
  });

  it("rejects null and non-objects", () => {
    expect(isTimeFormatPreferences(null)).toBe(false);
    expect(isTimeFormatPreferences("not an object")).toBe(false);
    expect(isTimeFormatPreferences(42)).toBe(false);
  });

  it("rejects an object missing a required field", () => {
    expect(
      isTimeFormatPreferences({ timezone: "UTC", clockFormat: "24h" })
    ).toBe(false);
  });

  it("rejects an object with an invalid timezone", () => {
    expect(
      isTimeFormatPreferences({
        timezone: "Not/Real",
        clockFormat: "24h",
        firstDayOfWeek: 1,
      })
    ).toBe(false);
  });

  it("rejects an object with an invalid clockFormat", () => {
    expect(
      isTimeFormatPreferences({
        timezone: "UTC",
        clockFormat: "30h",
        firstDayOfWeek: 1,
      })
    ).toBe(false);
  });

  it("rejects an object with an invalid firstDayOfWeek", () => {
    expect(
      isTimeFormatPreferences({
        timezone: "UTC",
        clockFormat: "24h",
        firstDayOfWeek: 9,
      })
    ).toBe(false);
  });
});
