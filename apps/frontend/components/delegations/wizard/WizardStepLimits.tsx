"use client";

import { useTranslations } from "next-intl";
import { FormField, StroopsInput } from "@delegolabs/ui";
import { HelpLink } from "../../help/HelpLink";
import { YieldEscrowToggle } from "../../escrows/YieldEscrowToggle";

export interface WizardStepLimitsProps {
  maxPerTransaction: string;
  onMaxPerTransactionChange: (stroops: string) => void;
  maxTotal: string;
  onMaxTotalChange: (stroops: string) => void;
  expiresAt: string;
  onExpiresAtChange: (value: string) => void;
  maxTotalError?: string;
  principalStroops: bigint;
  yieldEnabled: boolean;
  escrowTimeoutDays: number;
  onYieldEnabledChange: (enabled: boolean) => void;
  onEscrowTimeoutDaysChange: (days: number) => void;
}

/** Step 3 — spending limits and expiry (#523). */
export function WizardStepLimits({
  maxPerTransaction,
  onMaxPerTransactionChange,
  maxTotal,
  onMaxTotalChange,
  expiresAt,
  onExpiresAtChange,
  maxTotalError,
  principalStroops,
  yieldEnabled,
  escrowTimeoutDays,
  onYieldEnabledChange,
  onEscrowTimeoutDaysChange,
}: WizardStepLimitsProps) {
  const t = useTranslations("delegations.wizard");

  return (
    <div className="settings-section">
      <div>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.375rem",
            fontWeight: 500,
            marginBottom: "0.5rem",
          }}
        >
          {t("maxPerTransaction.label")}
          <HelpLink concept="delegation-limits" />
        </label>
        <StroopsInput
          value={BigInt(maxPerTransaction || "0")}
          onChange={(stroops) => onMaxPerTransactionChange(stroops.toString())}
          style={{ width: "100%" }}
        />
      </div>

      <div>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.375rem",
            fontWeight: 500,
            marginBottom: "0.5rem",
          }}
        >
          {t("maxTotal.label")}
          <HelpLink concept="delegation-limits" />
        </label>
        <StroopsInput
          value={BigInt(maxTotal || "0")}
          onChange={(stroops) => onMaxTotalChange(stroops.toString())}
          error={maxTotalError && t("errors.invalidTotal")}
          style={{ width: "100%" }}
        />
      </div>

      <FormField
        label={t("expiresAt.label")}
        hint={t("expiresAt.hint")}
        inputProps={{
          type: "date",
          value: expiresAt,
          onChange: (e) => onExpiresAtChange(e.target.value),
          style: { width: "100%" },
        }}
      />

      <YieldEscrowToggle
        principalStroops={principalStroops}
        enabled={yieldEnabled}
        timeoutDays={escrowTimeoutDays}
        onEnabledChange={onYieldEnabledChange}
        onTimeoutDaysChange={onEscrowTimeoutDaysChange}
      />
    </div>
  );
}
