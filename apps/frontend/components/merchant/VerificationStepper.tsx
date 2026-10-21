"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge } from "@delegolabs/ui";
import {
  TIER_BADGE_KEYS,
  VERIFICATION_TIERS,
  earnedTierCount,
  isCurrentTierEarned,
  type VerificationTier,
  type VerificationTierStatus,
} from "../../lib/merchantVerificationTiers";

export interface VerificationStepperProps {
  status: VerificationTierStatus;
}

const TIER_BADGE_STYLE: Record<VerificationTier, { background: string; color: string; border: string }> = {
  1: { background: "#f5e6d3", color: "#7c4a1e", border: "#d6a76c" },
  2: { background: "#f1f5f9", color: "#334155", border: "#94a3b8" },
  3: { background: "#fef3c7", color: "#854d0e", border: "#eab308" },
};

function TierBadge({ tier, label }: { tier: VerificationTier; label: string }) {
  const style = TIER_BADGE_STYLE[tier];
  return (
    <span
      data-tier={tier}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.375rem",
        padding: "0.25rem 0.625rem",
        borderRadius: "999px",
        border: `1px solid ${style.border}`,
        background: style.background,
        color: style.color,
        fontSize: "0.8125rem",
        fontWeight: 700,
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <circle cx="12" cy="9" r="7" />
        <path d="M8 15.5 6 23l6-3 6 3-2-7.5" />
      </svg>
      {label}
    </span>
  );
}

/** Merchant KYC tier progress: Bronze → Silver → Gold Business (#1013). */
export function VerificationStepper({ status }: VerificationStepperProps) {
  const t = useTranslations("kycVerification");
  const requirements = status.tierRequirements;
  const completedCount = requirements.filter((r) => r.isCompleted).length;
  const earned = earnedTierCount(requirements);
  const nextIndex = requirements.findIndex((r) => !r.isCompleted);
  const currentEarned = isCurrentTierEarned(status);
  const badgeLabel = (tier: VerificationTier) => t(`tierBadge.${TIER_BADGE_KEYS[tier]}`);

  return (
    <section aria-labelledby="kyc-stepper-title" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}>
        <div>
          <h2 id="kyc-stepper-title" style={{ margin: 0, fontSize: "1rem" }}>
            {t("currentTier")}
          </h2>
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.8125rem", color: "#6b7280" }}>
            {t("progress", { completed: completedCount, total: requirements.length })}
          </p>
        </div>
        {currentEarned ? (
          <TierBadge tier={status.currentTier} label={badgeLabel(status.currentTier)} />
        ) : (
          <Badge tone="neutral">{t("notVerified")}</Badge>
        )}
      </div>

      <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.625rem" }}>
        {VERIFICATION_TIERS.map((tier, index) => {
          const requirement = requirements[index];
          if (!requirement) return null;
          const isNext = index === nextIndex;
          const tierEarned = tier <= earned;
          const stepState = requirement.isCompleted ? "verified" : isNext ? "next" : "pending";
          return (
            <li
              key={tier}
              aria-current={isNext ? "step" : undefined}
              data-state={stepState}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.75rem",
                padding: "0.75rem 1rem",
                borderRadius: "0.75rem",
                border: `1px solid ${isNext ? "#2563eb" : "#e5e7eb"}`,
                background: requirement.isCompleted ? "#f0fdf4" : "#fff",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <span
                  aria-hidden="true"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "1.75rem",
                    height: "1.75rem",
                    borderRadius: "999px",
                    background: requirement.isCompleted ? "#16a34a" : isNext ? "#2563eb" : "#e5e7eb",
                    color: requirement.isCompleted || isNext ? "#fff" : "#374151",
                    fontWeight: 700,
                    fontSize: "0.8125rem",
                  }}
                >
                  {requirement.isCompleted ? "✓" : tier}
                </span>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.125rem" }}>
                  <span style={{ fontSize: "0.75rem", color: "#6b7280", fontWeight: 600 }}>
                    {t("tierLabel", { tier, badge: badgeLabel(tier) })}
                  </span>
                  <span style={{ fontSize: "0.875rem", fontWeight: 600 }}>{requirement.name}</span>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                {tierEarned ? (
                  <TierBadge tier={tier} label={t("verifiedBadge", { badge: badgeLabel(tier) })} />
                ) : requirement.isCompleted ? (
                  <Badge tone="success">{t("status.verified")}</Badge>
                ) : (
                  <>
                    <Badge tone={isNext ? "info" : "neutral"}>
                      {isNext ? t("status.next") : t("status.pending")}
                    </Badge>
                    {requirement.verificationLink && (
                      <Link
                        href={requirement.verificationLink}
                        aria-label={t("verifyNowFor", { name: requirement.name })}
                        style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#2563eb" }}
                      >
                        {t("verifyNow")}
                      </Link>
                    )}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
