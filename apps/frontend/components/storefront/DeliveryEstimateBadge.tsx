"use client";

import { useMemo } from "react";
import {
  calculateDeliveryEstimate,
  formatDeliveryDate,
  type BusinessDayPredicate,
  type DeliveryDateInput,
  type DeliveryEstimate,
} from "../../lib/deliveryEstimate";

export {
  addBusinessDays,
  calculateDeliveryEstimate,
  formatDeliveryDate,
  formatDeliveryWindow,
  isWeekday,
  toIsoDate,
} from "../../lib/deliveryEstimate";
export type {
  BusinessDayPredicate,
  DeliveryDateInput,
  DeliveryEstimate,
} from "../../lib/deliveryEstimate";

export interface DeliveryEstimateBadgeProps {
  handlingDays?: number;
  transitDaysMin?: number;
  transitDaysMax?: number;
  expressTransitDaysMin?: number;
  expressTransitDaysMax?: number;
  baseDate?: DeliveryDateInput;
  isExpress?: boolean;
  showExpress?: boolean;
  locale?: string;
  isBusinessDay?: BusinessDayPredicate;
  compact?: boolean;
  className?: string;
}

export function DeliveryEstimateBadge({
  handlingDays = 1,
  transitDaysMin = 3,
  transitDaysMax = 5,
  expressTransitDaysMin,
  expressTransitDaysMax,
  baseDate,
  isExpress = false,
  showExpress = false,
  locale = "en-US",
  isBusinessDay,
  compact = false,
  className = "",
}: DeliveryEstimateBadgeProps) {
  const standardEstimate = useMemo(
    () =>
      calculateDeliveryEstimate({
        handlingDays,
        transitDaysMin,
        transitDaysMax,
        baseDate,
        isBusinessDay,
      }),
    [handlingDays, transitDaysMin, transitDaysMax, baseDate, isBusinessDay]
  );

  const expressEstimate = useMemo(() => {
    if (!showExpress && !isExpress) return null;
    return calculateDeliveryEstimate({
      handlingDays,
      transitDaysMin: expressTransitDaysMin ?? transitDaysMin,
      transitDaysMax: expressTransitDaysMax ?? transitDaysMax,
      baseDate,
      isExpress: true,
      expressTransitDaysMin,
      expressTransitDaysMax,
      isBusinessDay,
    });
  }, [
    handlingDays,
    transitDaysMin,
    transitDaysMax,
    expressTransitDaysMin,
    expressTransitDaysMax,
    baseDate,
    isExpress,
    showExpress,
    isBusinessDay,
  ]);

  const primaryEstimate =
    isExpress && expressEstimate ? expressEstimate : standardEstimate;

  function renderWindow(estimate: DeliveryEstimate) {
    const earliest = formatDeliveryDate(estimate.earliestArrivalDate, locale);
    const latest = formatDeliveryDate(estimate.latestArrivalDate, locale);
    const sameDay = earliest === latest;

    return (
      <>
        {sameDay ? "Arrives by " : "Arrives between "}
        <time dateTime={estimate.earliestArrivalDate}>{earliest}</time>
        {!sameDay && (
          <>
            {" - "}
            <time dateTime={estimate.latestArrivalDate}>{latest}</time>
          </>
        )}
      </>
    );
  }

  const classes = [
    "delivery-estimate-badge",
    compact ? "delivery-estimate-badge--compact" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      data-testid="delivery-estimate-badge"
      role="region"
      aria-label={isExpress ? "Express delivery estimate" : "Delivery estimate"}
      className={classes}
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: compact ? 0 : "0.375rem",
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.375rem",
          padding: "0.25rem 0.625rem",
          borderRadius: "9999px",
          border: `1px solid ${isExpress ? "#fcd34d" : "#bfdbfe"}`,
          background: isExpress ? "#fffbeb" : "#eff6ff",
          color: isExpress ? "#92400e" : "#1e40af",
          fontSize: "0.75rem",
          fontWeight: 600,
          lineHeight: 1.4,
          whiteSpace: "nowrap",
        }}
      >
        {isExpress && (
          <strong style={{ textTransform: "uppercase", letterSpacing: "0.03em" }}>
            Express
          </strong>
        )}
        <span>{renderWindow(primaryEstimate)}</span>
      </span>
      {!compact && (
        <>
          <span style={{ color: "#6b7280", fontSize: "0.75rem" }}>
            ({primaryEstimate.handlingDays}d handling)
          </span>
          {expressEstimate && !isExpress && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.375rem",
                color: "#92400e",
                fontSize: "0.75rem",
                fontWeight: 600,
              }}
            >
              <strong>Express delivery</strong>
              <span>{renderWindow(expressEstimate)}</span>
            </span>
          )}
        </>
      )}
    </div>
  );
}
