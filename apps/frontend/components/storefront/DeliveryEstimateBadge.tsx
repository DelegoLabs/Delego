"use client";

import React, { useMemo } from "react";

export interface DeliveryEstimate {
  handlingDays: number;
  transitDaysMin: number;
  transitDaysMax: number;
  earliestArrivalDate: string;
  latestArrivalDate: string;
}

export interface DeliveryEstimateBadgeProps {
  /** Merchant handling time in business days. Default: 1 */
  handlingDays?: number;
  /** Carrier transit minimum days. Default: 3 */
  transitDaysMin?: number;
  /** Carrier transit maximum days. Default: 5 */
  transitDaysMax?: number;
  /** Optional base reference date (defaults to current date). */
  baseDate?: Date;
  /** Flag to toggle express expedited shipping. */
  isExpress?: boolean;
  /** Optional styling class. */
  className?: string;
}

/**
 * Adds business days (skipping Saturday and Sunday) to a starting date.
 */
export function addBusinessDays(startDate: Date, businessDaysToAdd: number): Date {
  const result = new Date(startDate.getTime());
  let daysRemaining = Math.max(0, businessDaysToAdd);

  while (daysRemaining > 0) {
    result.setDate(result.getDate() + 1);
    const dayOfWeek = result.getDay();
    // 0 is Sunday, 6 is Saturday
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      daysRemaining--;
    }
  }

  return result;
}

/**
 * Formats a date object to "MMM d" (e.g. "Oct 24").
 */
export function formatDeliveryDate(date: Date, locale = "en-US"): string {
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
  }).format(date);
}

/**
 * Calculates delivery estimates based on merchant handling days and transit times.
 */
export function calculateDeliveryEstimate(
  handlingDays = 1,
  transitDaysMin = 3,
  transitDaysMax = 5,
  baseDate: Date = new Date(),
  isExpress = false
): DeliveryEstimate {
  const effectiveMinTransit = isExpress ? Math.max(1, Math.min(2, transitDaysMin)) : transitDaysMin;
  const effectiveMaxTransit = isExpress ? Math.max(effectiveMinTransit, Math.min(3, transitDaysMax)) : transitDaysMax;

  const totalMinDays = handlingDays + effectiveMinTransit;
  const totalMaxDays = handlingDays + effectiveMaxTransit;

  const earliestDate = addBusinessDays(baseDate, totalMinDays);
  const latestDate = addBusinessDays(baseDate, totalMaxDays);

  return {
    handlingDays,
    transitDaysMin: effectiveMinTransit,
    transitDaysMax: effectiveMaxTransit,
    earliestArrivalDate: formatDeliveryDate(earliestDate),
    latestArrivalDate: formatDeliveryDate(latestDate),
  };
}

/**
 * Displays realistic estimated delivery date ranges on product detail views
 * based on merchant handling processing time and transit windows (#966).
 */
export function DeliveryEstimateBadge({
  handlingDays = 1,
  transitDaysMin = 3,
  transitDaysMax = 5,
  baseDate,
  isExpress = false,
  className = "",
}: DeliveryEstimateBadgeProps) {
  const estimate = useMemo(() => {
    return calculateDeliveryEstimate(
      handlingDays,
      transitDaysMin,
      transitDaysMax,
      baseDate || new Date(),
      isExpress
    );
  }, [handlingDays, transitDaysMin, transitDaysMax, baseDate, isExpress]);

  const isSameDate = estimate.earliestArrivalDate === estimate.latestArrivalDate;
  const arrivalRangeText = isSameDate
    ? `Arrives by ${estimate.earliestArrivalDate}`
    : `Arrives between ${estimate.earliestArrivalDate} - ${estimate.latestArrivalDate}`;

  return (
    <div
      role="region"
      aria-label="Delivery estimate"
      className={`delivery-estimate-badge inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium border ${
        isExpress
          ? "bg-amber-500/10 text-amber-500 border-amber-500/30"
          : "bg-muted/50 text-foreground border-border"
      } ${className}`}
    >
      <span className="estimate-icon" aria-hidden="true">
        {isExpress ? "⚡" : "📦"}
      </span>
      <span className="estimate-text font-semibold">{arrivalRangeText}</span>
      {isExpress && (
        <span className="rounded bg-amber-500/20 px-1 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-500">
          Express
        </span>
      )}
      <span className="text-muted-foreground ml-1">
        ({estimate.handlingDays}d handling)
      </span>
    </div>
  );
}
