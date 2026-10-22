/**
 * Merchant KYC verification tiers (#1013).
 *
 * Tier 1 (Bronze) — email verified; Tier 2 (Silver) — domain verified;
 * Tier 3 (Gold Business) — on-chain business entity verified.
 * `tierRequirements[i]` is the requirement for tier `i + 1`.
 */

export type VerificationTier = 1 | 2 | 3;

export interface VerificationTierStatus {
  currentTier: VerificationTier;
  tierRequirements: Array<{
    name: string;
    isCompleted: boolean;
    verificationLink?: string;
  }>;
}

export type VerificationRequirement = VerificationTierStatus["tierRequirements"][number];

export const VERIFICATION_TIERS: readonly VerificationTier[] = [1, 2, 3];

/** Badge key per tier; display names come from the `kycVerification.tierBadge` messages. */
export const TIER_BADGE_KEYS = {
  1: "bronze",
  2: "silver",
  3: "goldBusiness",
} as const satisfies Record<VerificationTier, string>;

/**
 * Number of tiers earned: requirements are cumulative, so a tier counts only
 * once it and every tier below it are completed (0 when Tier 1 is not).
 */
export function earnedTierCount(requirements: VerificationRequirement[]): number {
  let earned = 0;
  for (const requirement of requirements.slice(0, VERIFICATION_TIERS.length)) {
    if (!requirement.isCompleted) break;
    earned++;
  }
  return earned;
}

/** Whether the merchant actually holds `status.currentTier` (false while Tier 1 is still pending). */
export function isCurrentTierEarned(status: VerificationTierStatus): boolean {
  return earnedTierCount(status.tierRequirements) >= status.currentTier;
}

export interface VerificationChecks {
  emailVerified: boolean;
  domainVerified: boolean;
  businessEntityVerified: boolean;
}

/**
 * Builds the stepper status. `currentTier` is the highest earned tier, or 1
 * while nothing is verified yet (check `isCurrentTierEarned` before showing
 * it as held).
 */
export function buildVerificationTierStatus(
  checks: VerificationChecks,
  names: Record<keyof VerificationChecks, string>,
  links: Partial<Record<keyof VerificationChecks, string>> = {}
): VerificationTierStatus {
  const order: (keyof VerificationChecks)[] = ["emailVerified", "domainVerified", "businessEntityVerified"];
  const tierRequirements = order.map((key) => ({
    name: names[key],
    isCompleted: checks[key],
    ...(links[key] ? { verificationLink: links[key] } : {}),
  }));
  const earned = earnedTierCount(tierRequirements);
  return {
    currentTier: Math.max(1, earned) as VerificationTier,
    tierRequirements,
  };
}
