"use client";

import { useTranslations } from "next-intl";
import { Amount } from "@delegolabs/ui";
import { useCurrency } from "../../../hooks/useCurrency";
import type { DelegationWizardDraft } from "../../../lib/delegationWizard";
import {
  buildYieldEscrowOption,
  parseStroopsAmount,
  parseTimeoutDays,
} from "../../../lib/yieldEscrow";

export interface WizardStepReviewProps {
  draft: DelegationWizardDraft;
}

function formatExpiry(expiresAt: string): string {
  if (!expiresAt) return "";
  return new Date(expiresAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Step 4 — plain-language summary of what's about to be created (#523). */
export function WizardStepReview({ draft }: WizardStepReviewProps) {
  const t = useTranslations("delegations.wizard.steps.review");
  const { currencyId, rate } = useCurrency();
  const yieldOption = buildYieldEscrowOption(
    draft.yieldEnabled === true,
    parseStroopsAmount(draft.maxTotal),
    parseTimeoutDays(draft.escrowTimeoutDays ?? "7")
  );

  const merchantScope = draft.unrestrictedMerchants
    ? t("merchantScopeAll")
    : t("merchantScopeRestricted", { count: draft.allowedMerchants.length });

  const summary = t("summary", {
    agentLabel: draft.label.trim() || draft.agentId,
    maxTotal: `${draft.maxTotal ? Number(draft.maxTotal) / 10_000_000 : 0} XLM`,
    merchantScope,
    expiry: draft.expiresAt
      ? formatExpiry(draft.expiresAt)
      : t("summaryNoExpiry"),
  });

  return (
    <div className="settings-section">
      <div
        className="card"
        style={{ background: "var(--color-bg-secondary, #f9fafb)" }}
      >
        <p style={{ fontSize: "1rem", margin: 0 }}>{summary}</p>
      </div>

      <dl className="wallet-detail-list">
        <div className="wallet-detail-row">
          <dt>Agent</dt>
          <dd>{draft.agentId}</dd>
        </div>
        <div className="wallet-detail-row">
          <dt>Wallet</dt>
          <dd>{draft.walletId}</dd>
        </div>
        <div className="wallet-detail-row">
          <dt>Permission level</dt>
          <dd>{draft.permissionLevel.replace("_", " ")}</dd>
        </div>
        <div className="wallet-detail-row">
          <dt>Max / transaction</dt>
          <dd>
            <Amount
              stroops={BigInt(draft.maxPerTransaction || "0")}
              currency={currencyId}
              xlmUsdRate={rate?.xlmUsdRate}
            />
          </dd>
        </div>
        <div className="wallet-detail-row">
          <dt>Total limit</dt>
          <dd>
            <Amount
              stroops={BigInt(draft.maxTotal || "0")}
              currency={currencyId}
              xlmUsdRate={rate?.xlmUsdRate}
            />
          </dd>
        </div>
        <div className="wallet-detail-row">
          <dt>Merchants</dt>
          <dd>
            {draft.unrestrictedMerchants
              ? "All merchants"
              : draft.allowedMerchants.join(", ")}
          </dd>
        </div>
        <div className="wallet-detail-row">
          <dt>Categories</dt>
          <dd>{draft.allowedCategories || "All categories"}</dd>
        </div>
        <div className="wallet-detail-row">
          <dt>Expires</dt>
          <dd>{draft.expiresAt ? formatExpiry(draft.expiresAt) : "Never"}</dd>
        </div>
        <div className="wallet-detail-row">
          <dt>Blend yield</dt>
          <dd>
            {yieldOption.isEnabled ? (
              <>
                On, projected{" "}
                <Amount
                  stroops={BigInt(yieldOption.estimatedEarningsStroops)}
                  currency={currencyId}
                  xlmUsdRate={rate?.xlmUsdRate}
                />
              </>
            ) : (
              "Off"
            )}
          </dd>
        </div>
      </dl>
    </div>
  );
}
