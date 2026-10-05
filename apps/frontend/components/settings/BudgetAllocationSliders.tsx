"use client";

import { useCallback, useId } from "react";
import { formatXlm } from "../../lib/orders";
import { categoryColor } from "../../lib/categoryBudgets";
import { usedPercent, type CategoryBudgetAllocation } from "./budgetAllocationTypes";

/** Slider granularity: 1 XLM. */
const STEP_XLM = 1n;
const STROOPS_PER_XLM = 10_000_000n;

export interface BudgetAllocationSlidersProps {
  allocations: CategoryBudgetAllocation[];
  onChange: (allocations: CategoryBudgetAllocation[]) => void;
  locale?: string;
}

/**
 * One slider per category for editing its monthly limit. Edits are staged
 * locally and handed back through `onChange`; the caller decides when to
 * persist.
 */
export function BudgetAllocationSliders({
  allocations,
  onChange,
  locale,
}: BudgetAllocationSlidersProps) {
  const groupId = useId();

  const updateLimit = useCallback(
    (index: number, monthlyLimitStroops: bigint) => {
      onChange(
        allocations.map((allocation, i) =>
          i === index ? { ...allocation, monthlyLimitStroops } : allocation,
        ),
      );
    },
    [allocations, onChange],
  );

  if (allocations.length === 0) {
    return (
      <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>
        No category budgets to edit.
      </p>
    );
  }

  return (
    <div
      role="group"
      aria-labelledby={`${groupId}-heading`}
      style={{ display: "grid", gap: "1rem" }}
    >
      <span id={`${groupId}-heading`} style={{ fontWeight: 600 }}>
        Monthly limits
      </span>
      {allocations.map((allocation, index) => {
        const percent = usedPercent(allocation);
        const inputId = `${groupId}-${index}`;
        return (
          <div key={allocation.category} style={{ display: "grid", gap: "0.25rem" }}>
            <label
              htmlFor={inputId}
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "0.8125rem",
              }}
            >
              <span>{allocation.category}</span>
              <span style={{ color: "#6b7280" }}>
                {formatXlm(allocation.monthlyLimitStroops, locale)} XLM
              </span>
            </label>
            <input
              id={inputId}
              type="range"
              min={0}
              max={Number(allocation.monthlyLimitStroops / STEP_XLM) + 1}
              value={Number(allocation.monthlyLimitStroops / STROOPS_PER_XLM)}
              data-testid={`budget-slider-${allocation.category}`}
              onChange={(event) =>
                updateLimit(
                  index,
                  BigInt(event.target.value) * STROOPS_PER_XLM,
                )
              }
              style={{ accentColor: categoryColor(index) }}
            />
            <span
              aria-live="polite"
              style={{ fontSize: "0.75rem", color: percent >= 100 ? "#b91c1c" : "#6b7280" }}
            >
              {percent}% used this month
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default BudgetAllocationSliders;
