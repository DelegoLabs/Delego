"use client";

import { useId, useState } from "react";
import { formatAmount } from "@delegolabs/ui";
import {
  BLEND_YIELD_RISK_DISCLAIMER,
  buildYieldEscrowOption,
  YIELD_ESCROW_TOGGLE_LABEL,
} from "../../lib/yieldEscrow";

export interface YieldEscrowToggleProps {
  principalStroops: bigint;
  enabled: boolean;
  timeoutDays: number;
  onEnabledChange: (enabled: boolean) => void;
  onTimeoutDaysChange: (days: number) => void;
}

/** Checkbox for earning Blend yield while funds sit in escrow (#701). */
export function YieldEscrowToggle({
  principalStroops,
  enabled,
  timeoutDays,
  onEnabledChange,
  onTimeoutDaysChange,
}: YieldEscrowToggleProps) {
  const baseId = useId();
  const checkboxId = `${baseId}-yield`;
  const timeoutId = `${baseId}-timeout`;
  const tooltipId = `${baseId}-risk`;
  const [tooltipOpen, setTooltipOpen] = useState(false);

  const option = buildYieldEscrowOption(enabled, principalStroops, timeoutDays);
  const earnings = formatAmount(BigInt(option.estimatedEarningsStroops));

  return (
    <fieldset
      style={{
        border: "1px solid var(--color-border, #e5e7eb)",
        borderRadius: "0.5rem",
        padding: "0.75rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
      }}
    >
      <legend className="sr-only">Escrow checkout yield</legend>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem" }}>
        <input
          id={checkboxId}
          type="checkbox"
          checked={enabled}
          onChange={(e) => onEnabledChange(e.target.checked)}
          aria-describedby={tooltipId}
          style={{ marginTop: "0.2rem" }}
        />
        <label htmlFor={checkboxId} style={{ fontWeight: 500, flex: 1 }}>
          {YIELD_ESCROW_TOGGLE_LABEL}
        </label>
        <span style={{ position: "relative" }}>
          <button
            type="button"
            aria-label="Smart contract risk"
            aria-describedby={tooltipId}
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
            }}
          >
            ?
          </button>
          <span
            id={tooltipId}
            role="tooltip"
            style={{
              position: "absolute",
              zIndex: 5,
              right: 0,
              bottom: "1.5rem",
              width: "16rem",
              padding: "0.5rem 0.625rem",
              background: "#111827",
              color: "#fff",
              borderRadius: "0.375rem",
              fontSize: "0.75rem",
              lineHeight: 1.4,
              visibility: tooltipOpen ? "visible" : "hidden",
            }}
          >
            {BLEND_YIELD_RISK_DISCLAIMER}
          </span>
        </span>
      </div>

      {enabled && (
        <>
          <label htmlFor={timeoutId} style={{ fontSize: "0.875rem" }}>
            Escrow timeout (days)
          </label>
          <input
            id={timeoutId}
            type="number"
            min={1}
            max={3650}
            value={timeoutDays > 0 ? timeoutDays : ""}
            onChange={(e) => onTimeoutDaysChange(Number(e.target.value))}
            style={{ width: "8rem", padding: "0.375rem 0.5rem" }}
          />
          <p style={{ margin: 0, fontSize: "0.875rem" }}>
            Projected interest over {timeoutDays > 0 ? timeoutDays : 0} days:{" "}
            {earnings.value} {earnings.symbol}
          </p>
        </>
      )}
    </fieldset>
  );
}
