import { describe, expect, it } from "vitest";
import {
  buildVerificationTierStatus,
  earnedTierCount,
  isCurrentTierEarned,
  type VerificationChecks,
} from "./merchantVerificationTiers";

const NAMES = {
  emailVerified: "Email",
  domainVerified: "Domain",
  businessEntityVerified: "Entity",
};

function checks(email: boolean, domain: boolean, entity: boolean): VerificationChecks {
  return { emailVerified: email, domainVerified: domain, businessEntityVerified: entity };
}

describe("buildVerificationTierStatus", () => {
  it("orders requirements email → domain → business entity, with optional links", () => {
    const status = buildVerificationTierStatus(checks(true, false, false), NAMES, { domainVerified: "/verify" });
    expect(status.tierRequirements).toEqual([
      { name: "Email", isCompleted: true },
      { name: "Domain", isCompleted: false, verificationLink: "/verify" },
      { name: "Entity", isCompleted: false },
    ]);
  });

  it.each([
    [checks(false, false, false), 1, false],
    [checks(true, false, false), 1, true],
    [checks(true, true, false), 2, true],
    [checks(true, true, true), 3, true],
    // Tiers are cumulative: a verified domain without a verified email earns nothing.
    [checks(false, true, true), 1, false],
    [checks(true, false, true), 1, true],
  ])("%o → current tier %i (earned: %s)", (input, currentTier, earned) => {
    const status = buildVerificationTierStatus(input, NAMES);
    expect(status.currentTier).toBe(currentTier);
    expect(isCurrentTierEarned(status)).toBe(earned);
  });
});

describe("earnedTierCount", () => {
  it("counts consecutive completed tiers from Tier 1", () => {
    expect(earnedTierCount([])).toBe(0);
    expect(
      earnedTierCount([
        { name: "a", isCompleted: true },
        { name: "b", isCompleted: true },
        { name: "c", isCompleted: false },
      ])
    ).toBe(2);
  });
});
