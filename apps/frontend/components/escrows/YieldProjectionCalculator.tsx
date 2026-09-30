"use client";

import { useId, useMemo, useState } from "react";
import {
  projectYield,
  BLEND_PROJECTION_APR_PERCENT,
  DEFAULT_HOLDING_DAYS,
  MIN_HOLDING_DAYS,
  SLIDER_MAX_HOLDING_DAYS,
  YIELD_PROJECTION_DISCLAIMER,
  type YieldProjectionCalculation,
} from "../../lib/yieldProjection";

export interface YieldProjectionCalculatorProps {
  /** Escrow principal in USD (or the app's quote currency). */
  principalAmount: number;
  /** Controlled holding-days value. Omit to let the component own the slider. */
  holdingDays?: number;
  /** Called when the slider moves. */
  onHoldingDaysChange?: (days: number) => void;
}

function formatUsd(value: number): string {
  return value.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Interactive yield projection calculator for the escrow deposit screen (#810).
 *
 * Buyers drag a holding-days slider and see compound-interest projections for
 * Blend escrow in real time. A disclaimer tooltip makes the estimate-vs-guarantee
 * distinction explicit.
 */
export function YieldProjectionCalculator({
  principalAmount,
  holdingDays,
  onHoldingDaysChange,
}: YieldProjectionCalculatorProps) {
  const baseId = useId();
  const sliderId = `${baseId}-days`;
  const disclaimerId = `${baseId}-disclaimer`;
  const [internalDays, setInternalDays] = useState(DEFAULT_HOLDING_DAYS);
  const [tooltipOpen, setTooltipOpen] = useState(false);

  const days = holdingDays ?? internalDays;

  const calculation: YieldProjectionCalculation = useMemo(
    () => projectYield({ principalAmount, estimatedHoldingDays: days }),
    [principalAmount, days],
  );

  const setDays = (next: number) => {
    const clamped = Math.min(
      SLIDER_MAX_HOLDING_DAYS,
      Math.max(MIN_HOLDING_DAYS, Math.floor(next) || MIN_HOLDING_DAYS),
    );
    if (onHoldingDaysChange) onHoldingDaysChange(clamped);
    else setInternalDays(clamped);
  };

  return (
    <section
      aria-label="Yield projection calculator"
      data-testid="yield-projection-calculator"
      style={{
        border: "1px solid var(--color-border, #e5e7eb)",
        borderRadius: "0.5rem",
        padding: "0.75rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
        <h3 style={{ margin: 0, fontSize: "0.9375rem", fontWeight: 600 }}>
          Projected yield while funds are held in escrow
        </h3>
        <span style={{ position: "relative" }}>
          <button
            type="button"
            aria-label="Yield projection disclaimer"
            aria-describedby={disclaimerId}
            onMouseEnter={() => setTooltipOpen(true)}
            onMouseLeave={() => setTooltipOpen(false)}
            onFocus={() => setTooltipOpen(true)}
            onBlur={() => setTooltipOpen(false)}
            style={{
              width: "1.25rem",
              height: "1.25rem",
              borderRadius: "999px",
              border: "1px solid var(--color-border, #d1d5db)",
              background: "transparent",
              cursor: "pointer",
              fontSize: "0.75rem",
              lineHeight: 1,
            }}
          >
            ?
          </button>
          <span
            id={disclaimerId}
            role="tooltip"
            style={{
              position: "absolute",
              zIndex: 5,
              left: 0,
              bottom: "1.5rem",
              width: "18rem",
              padding: "0.5rem 0.625rem",
              background: "#111827",
              color: "#fff",
              borderRadius: "0.375rem",
              fontSize: "0.75rem",
              lineHeight: 1.4,
              visibility: tooltipOpen ? "visible" : "hidden",
            }}
          >
            {YIELD_PROJECTION_DISCLAIMER}
          </span>
        </span>
      </div>

      <label htmlFor={sliderId} style={{ fontSize: "0.875rem" }}>
        Estimated holding period:{" "}
        <strong data-testid="yield-projection-days">{days}</strong> day
        {days === 1 ? "" : "s"}
      </label>
      <input
        id={sliderId}
        type="range"
        min={MIN_HOLDING_DAYS}
        max={SLIDER_MAX_HOLDING_DAYS}
        step={1}
        value={days}
        onChange={(e) => setDays(Number(e.target.value))}
        aria-valuemin={MIN_HOLDING_DAYS}
        aria-valuemax={SLIDER_MAX_HOLDING_DAYS}
        aria-valuenow={days}
        aria-valuetext={`${days} days`}
        data-testid="yield-projection-slider"
        style={{ width: "100%" }}
      />

      <dl
        data-testid="yield-projection-results"
        style={{
          margin: 0,
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gap: "0.25rem 0.75rem",
          fontSize: "0.875rem",
        }}
      >
        <dt style={{ color: "#6b7280" }}>Principal</dt>
        <dd data-testid="yield-projection-principal" style={{ margin: 0 }}>
          {formatUsd(calculation.principalAmount)}
        </dd>

        <dt style={{ color: "#6b7280" }}>Estimated APY</dt>
        <dd data-testid="yield-projection-apy" style={{ margin: 0 }}>
          {calculation.aprPercent.toFixed(2)}%
        </dd>

        <dt style={{ color: "#6b7280" }}>Projected earnings</dt>
        <dd
          data-testid="yield-projection-earnings"
          style={{ margin: 0, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}
        >
          {formatUsd(calculation.projectedEarningsUsd)}
        </dd>
      </dl>

      <p style={{ margin: 0, fontSize: "0.75rem", color: "#9ca3af" }}>
        Estimate only — not financial advice. APY is Blend&apos;s current{" "}
        {BLEND_PROJECTION_APR_PERCENT}% rate and will change with utilization.
      </p>
    </section>
  );
}
