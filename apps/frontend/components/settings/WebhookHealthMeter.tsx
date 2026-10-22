"use client";

import { useId, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Badge, type BadgeTone } from "@delegolabs/ui";
import {
  formatSuccessRate,
  type WebhookDeliveryError,
  type WebhookHealthScore,
  type WebhookHealthTier,
} from "../../lib/webhookHealth";

export interface WebhookHealthMeterProps {
  score: WebhookHealthScore;
  /** Most recent failed deliveries, newest first (see `getRecentDeliveryErrors`). */
  recentErrors: WebhookDeliveryError[];
}

const TIER_TONE: Record<WebhookHealthTier, BadgeTone> = {
  healthy: "success",
  warning: "warning",
  critical: "error",
};

const TIER_COLOR: Record<WebhookHealthTier, string> = {
  healthy: "#16a34a",
  warning: "#d97706",
  critical: "#dc2626",
};

/** 7-day delivery reliability gauge for a webhook endpoint (#1010). */
export function WebhookHealthMeter({ score, recentErrors }: WebhookHealthMeterProps) {
  const t = useTranslations("webhookHealth");
  const format = useFormatter();
  const baseId = useId();
  const labelId = `${baseId}-label`;
  const tooltipId = `${baseId}-errors`;
  const [tooltipOpen, setTooltipOpen] = useState(false);

  if (score.totalAttempts7d === 0) {
    return (
      <section className="webhook-health" aria-labelledby={labelId}>
        <h4 id={labelId} style={{ margin: 0, fontSize: "0.8125rem" }}>
          {t("title")}
        </h4>
        <p style={{ margin: "0.25rem 0 0", fontSize: "0.8125rem", color: "#6b7280" }}>
          {t("noData")}
        </p>
      </section>
    );
  }

  const tier = score.healthTier;
  const rate = formatSuccessRate(score.successRatePercentage);
  const unhealthy = tier !== "healthy";

  return (
    <section
      className="webhook-health"
      aria-labelledby={labelId}
      data-tier={tier}
      style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
        <h4 id={labelId} style={{ margin: 0, fontSize: "0.8125rem" }}>
          {t("title")}
        </h4>
        <Badge tone={TIER_TONE[tier]}>
          {t(`tier.${tier}`)} · {t("rate", { rate })}
        </Badge>
      </div>

      <div
        role="meter"
        aria-label={t("gaugeLabel")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={rate}
        aria-valuetext={t("rate", { rate })}
        style={{
          height: "0.5rem",
          borderRadius: "999px",
          background: "var(--color-bg-subtle, #f3f4f6)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${rate}%`,
            height: "100%",
            borderRadius: "999px",
            background: TIER_COLOR[tier],
          }}
        />
      </div>

      <p style={{ margin: 0, fontSize: "0.75rem", color: "#6b7280" }}>
        {t("attempts", { count: score.totalAttempts7d })}
        {score.consecutiveFailures > 0 &&
          ` · ${t("consecutiveFailures", { count: score.consecutiveFailures })}`}
      </p>

      {unhealthy && (
        <div
          role={tier === "critical" ? "alert" : "status"}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.5rem",
            padding: "0.5rem 0.75rem",
            borderRadius: "0.5rem",
            border: `1px solid ${TIER_COLOR[tier]}`,
            background: tier === "critical" ? "#fee2e2" : "#fef3c7",
            color: tier === "critical" ? "#991b1b" : "#92400e",
            fontSize: "0.8125rem",
            fontWeight: 600,
          }}
        >
          <span>
            <span aria-hidden="true">⚠ </span>
            {t(`warning.${tier}`)}
          </span>

          {recentErrors.length > 0 && (
            <span style={{ position: "relative" }}>
              <button
                type="button"
                aria-describedby={tooltipId}
                onMouseEnter={() => setTooltipOpen(true)}
                onMouseLeave={() => setTooltipOpen(false)}
                onFocus={() => setTooltipOpen(true)}
                onBlur={() => setTooltipOpen(false)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setTooltipOpen(false);
                }}
                style={{
                  padding: "0.125rem 0.5rem",
                  borderRadius: "0.375rem",
                  border: "1px solid currentColor",
                  background: "transparent",
                  color: "inherit",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {t("recentErrorsButton")}
              </button>
              <span
                id={tooltipId}
                role="tooltip"
                style={{
                  position: "absolute",
                  zIndex: 5,
                  right: 0,
                  top: "1.75rem",
                  width: "16rem",
                  padding: "0.5rem 0.625rem",
                  background: "#111827",
                  color: "#fff",
                  borderRadius: "0.375rem",
                  fontSize: "0.75rem",
                  fontWeight: 400,
                  lineHeight: 1.4,
                  visibility: tooltipOpen ? "visible" : "hidden",
                }}
              >
                <strong style={{ display: "block", marginBottom: "0.25rem" }}>
                  {t("recentErrorsTitle")}
                </strong>
                {recentErrors.map((error) => (
                  <span key={`${error.httpStatus}-${error.deliveredAt.getTime()}`} style={{ display: "block" }}>
                    {error.label} ·{" "}
                    {format.dateTime(error.deliveredAt, { dateStyle: "medium", timeStyle: "short" })}
                  </span>
                ))}
              </span>
            </span>
          )}
        </div>
      )}
    </section>
  );
}
