"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Card } from "@delegolabs/ui";
import { VerificationStepper } from "../../../../components/merchant/VerificationStepper";
import { loadOnboardingState } from "../../../../lib/merchantRegistration";
import {
  buildVerificationTierStatus,
  type VerificationChecks,
} from "../../../../lib/merchantVerificationTiers";

/**
 * Merchant KYC tier progress (#1013).
 *
 * Only Tier 2 has a real signal today: `isDomainVerified` from the
 * onboarding wizard's stellar.toml check, persisted client-side. The gateway
 * exposes no email-verification or on-chain business-entity status yet.
 */
// PLACEHOLDER (#1013): replace with the gateway's merchant verification
// status once an endpoint exists; until then these tiers always read as
// not verified.
const PLACEHOLDER_CHECKS: Pick<VerificationChecks, "emailVerified" | "businessEntityVerified"> = {
  emailVerified: false,
  businessEntityVerified: false,
};

export default function MerchantKycSettingsPage() {
  const t = useTranslations("kycVerification");
  const [domainVerified, setDomainVerified] = useState(false);

  useEffect(() => {
    setDomainVerified(loadOnboardingState()?.isDomainVerified ?? false);
  }, []);

  const status = buildVerificationTierStatus(
    { ...PLACEHOLDER_CHECKS, domainVerified },
    {
      emailVerified: t("requirements.email"),
      domainVerified: t("requirements.domain"),
      businessEntityVerified: t("requirements.businessEntity"),
    },
    { domainVerified: "/merchant/register" }
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <header>
        <h1>{t("pageTitle")}</h1>
        <p style={{ margin: 0, color: "#6b7280" }}>{t("pageDescription")}</p>
      </header>
      <Card>
        <VerificationStepper status={status} />
      </Card>
    </div>
  );
}
