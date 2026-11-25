import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_ONBOARDING_LIMITS,
  ONBOARDING_LIMITS_STORAGE_KEY,
  isValidOnboardingLimits,
  readOnboardingLimits,
  writeOnboardingLimits,
} from "./onboardingLimits";

describe("onboarding spending limits", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("uses 100 XLM per transaction and 500 XLM per day by default", () => {
    expect(DEFAULT_ONBOARDING_LIMITS).toEqual({
      maxPerTransactionStroops: "1000000000",
      dailyLimitStroops: "5000000000",
    });
    expect(readOnboardingLimits()).toEqual(DEFAULT_ONBOARDING_LIMITS);
  });

  it("requires positive limits with a daily cap at least as large as a single purchase", () => {
    expect(isValidOnboardingLimits(DEFAULT_ONBOARDING_LIMITS)).toBe(true);
    expect(
      isValidOnboardingLimits({
        maxPerTransactionStroops: "100",
        dailyLimitStroops: "100",
      })
    ).toBe(true);
    expect(
      isValidOnboardingLimits({
        maxPerTransactionStroops: "100",
        dailyLimitStroops: "99",
      })
    ).toBe(false);
    expect(
      isValidOnboardingLimits({
        maxPerTransactionStroops: "0",
        dailyLimitStroops: "100",
      })
    ).toBe(false);
    expect(
      isValidOnboardingLimits({
        maxPerTransactionStroops: "abc",
        dailyLimitStroops: "100",
      })
    ).toBe(false);
  });

  it("persists the chosen limits without losing stroop precision", () => {
    expect(
      writeOnboardingLimits({
        maxPerTransactionStroops: "123456789012345678",
        dailyLimitStroops: "987654321098765432",
      })
    ).toBe(true);

    expect(
      JSON.parse(
        window.localStorage.getItem(ONBOARDING_LIMITS_STORAGE_KEY)!
      )
    ).toEqual({
      maxPerTransactionStroops: "123456789012345678",
      dailyLimitStroops: "987654321098765432",
    });
    expect(readOnboardingLimits()).toEqual({
      maxPerTransactionStroops: "123456789012345678",
      dailyLimitStroops: "987654321098765432",
    });
  });

  it("rejects invalid writes without overwriting saved choices", () => {
    writeOnboardingLimits(DEFAULT_ONBOARDING_LIMITS);

    expect(
      writeOnboardingLimits({
        maxPerTransactionStroops: "5000000000",
        dailyLimitStroops: "1000000000",
      })
    ).toBe(false);
    expect(readOnboardingLimits()).toEqual(DEFAULT_ONBOARDING_LIMITS);
  });

  it("falls back to defaults for malformed stored data", () => {
    window.localStorage.setItem(ONBOARDING_LIMITS_STORAGE_KEY, "not json");
    expect(readOnboardingLimits()).toEqual(DEFAULT_ONBOARDING_LIMITS);

    window.localStorage.setItem(
      ONBOARDING_LIMITS_STORAGE_KEY,
      JSON.stringify({ maxPerTransactionStroops: "10", dailyLimitStroops: "1" })
    );
    expect(readOnboardingLimits()).toEqual(DEFAULT_ONBOARDING_LIMITS);
  });
});
