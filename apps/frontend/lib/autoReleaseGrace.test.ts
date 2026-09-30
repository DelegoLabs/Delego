import { describe, it, expect } from "vitest";
import {
  DEFAULT_AUTO_RELEASE_GRACE_HOURS,
  formatGraceCountdown,
  formatGraceWindow,
  getAutoReleaseGraceRemainingMs,
  isAutoReleaseGraceExpired,
} from "./autoReleaseGrace";

const NOW = new Date("2026-01-01T00:00:00.000Z");

describe("getAutoReleaseGraceRemainingMs", () => {
  it("returns the ms until the server-issued expiry", () => {
    expect(
      getAutoReleaseGraceRemainingMs("2026-01-01T08:00:00.000Z", NOW)
    ).toBe(DEFAULT_AUTO_RELEASE_GRACE_HOURS * 3600 * 1000);
  });

  it("floors at zero once the window has passed", () => {
    expect(getAutoReleaseGraceRemainingMs("2025-12-31T23:00:00.000Z", NOW)).toBe(0);
  });

  it("treats an unparseable expiry as already elapsed", () => {
    expect(getAutoReleaseGraceRemainingMs("nonsense", NOW)).toBe(0);
  });
});

describe("isAutoReleaseGraceExpired", () => {
  it("is false inside the window and true at/after the deadline", () => {
    expect(isAutoReleaseGraceExpired("2026-01-01T00:00:01.000Z", NOW)).toBe(false);
    expect(isAutoReleaseGraceExpired("2026-01-01T00:00:00.000Z", NOW)).toBe(true);
    expect(isAutoReleaseGraceExpired("2025-12-31T23:59:59.000Z", NOW)).toBe(true);
  });
});

describe("formatGraceCountdown", () => {
  it("renders hours:minutes:seconds above an hour", () => {
    expect(formatGraceCountdown(8 * 3600 * 1000)).toBe("8:00:00");
    expect(formatGraceCountdown(7 * 3600 * 1000 + 59 * 60 * 1000 + 59_000)).toBe("7:59:59");
  });

  it("renders minutes:seconds below an hour", () => {
    expect(formatGraceCountdown(9 * 60 * 1000 + 4000)).toBe("9:04");
    expect(formatGraceCountdown(59_000)).toBe("0:59");
  });

  it("rounds up so the display only reads 0:00 once the window is truly closed", () => {
    expect(formatGraceCountdown(1)).toBe("0:01");
    expect(formatGraceCountdown(0)).toBe("0:00");
    expect(formatGraceCountdown(-5_000)).toBe("0:00");
  });
});

describe("formatGraceWindow", () => {
  it("describes whole hours and pluralises correctly", () => {
    expect(formatGraceWindow(8 * 3600 * 1000)).toBe("8 hours");
    expect(formatGraceWindow(1 * 3600 * 1000)).toBe("1 hour");
  });

  it("describes minutes and seconds for short windows", () => {
    expect(formatGraceWindow(45 * 60 * 1000)).toBe("45 minutes");
    expect(formatGraceWindow(60 * 1000)).toBe("1 minute");
    expect(formatGraceWindow(30_000)).toBe("30 seconds");
    expect(formatGraceWindow(1000)).toBe("1 second");
  });
});
