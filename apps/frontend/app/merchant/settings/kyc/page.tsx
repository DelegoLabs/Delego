"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Card } from "@delegolabs/ui";
import { Button } from "@delegolabs/ui";
import { VerificationStepper } from "../../../../components/merchant/VerificationStepper";
import { loadOnboardingState } from "../../../../lib/merchantRegistration";
import {
  buildVerificationTierStatus,
  type VerificationChecks,
} from "../../../../lib/merchantVerificationTiers";

/** Fetches merchant verification checks from the profile/KYC endpoint. */
async function fetchMerchantVerificationChecks(): Promise<
  Pick<VerificationChecks, "emailVerified" | "businessEntityVerified">
> {
  const response = await fetch("/api/v1/merchant/profile");
  if (!response.ok) {
    throw new Error("Failed to fetch merchant verification status");
  }
  const data = await response.json();
  return {
    emailVerified: data.emailVerified ?? false,
    businessEntityVerified: data.businessEntityVerified ?? false,
  };
}

/**
 * Merchant KYC tier progress (#1013).
 *
 * Fetches the merchant's verification checks from the merchant profile/KYC endpoint.
 * Falls back to domain verification from onboarding state and placeholder values
 * if the API is not yet available.
 */
export default function MerchantKycSettingsPage() {
  const t = useTranslations("kycVerification");
  const tCommon = useTranslations("common");
  const [domainVerified, setDomainVerified] = useState(false);
  const [kycStatus, setKycStatus] = useState<
    Pick<VerificationChecks, "emailVerified" | "businessEntityVerified">
  >({ emailVerified: false, businessEntityVerified: false });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Load domain verification from onboarding state
    setDomainVerified(loadOnboardingState()?.isDomainVerified ?? false);
  }, []);

  useEffect(() => {
    async function loadKycStatus() {
      setIsLoading(true);
      setError(null);
      try {
        const checks = await fetchMerchantVerificationChecks();
        setKycStatus(checks);
      } catch (err) {
        // If API not available, use placeholder values (false)
        // This allows the UI to remain functional during development
        setKycStatus({ emailVerified: false, businessEntityVerified: false });
      } finally {
        setIsLoading(false);
      }
    }

    loadKycStatus();
  }, []);

  const status = buildVerificationTierStatus(
    { ...kycStatus, domainVerified },
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

      {error && (
        <Card>
          <div
            role="alert"
            style={{
              padding: "1rem",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: "0.375rem",
              color: "#b91c1c",
            }}
          >
            <p style={{ margin: "0 0 0.5rem" }}>{error}</p>
            <Button variant="secondary" onClick={() => window.location.reload()}>
              {tCommon("tryAgain")}
            </Button>
          </div>
        </Card>
      )}

      {isLoading ? (
        <Card>
          <p style={{ textAlign: "center", color: "#6b7280" }}>
            {t("loading") || "Loading verification status..."}
          </p>
        </Card>
      ) : (
        <Card>
          <VerificationStepper status={status} />
        </Card>
      )}
    </div>
  );
}
