"use client";

import { formatXlm } from "../../lib/orders";
import { categoryColor } from "../../lib/categoryBudgets";
import { usedPercent, type CategoryBudgetAllocation } from "./budgetAllocationTypes";

export interface BudgetAllocationChartProps {
  allocations: CategoryBudgetAllocation[];
  locale?: string;
}

/**
 * Horizontal bars showing how much of each category's monthly limit has
 * been used. Deliberately dependency-free markup — the numbers are the
 * point, and this renders inside the settings page without a chart runtime.
 */
export function BudgetAllocationChart({
  allocations,
  locale,
}: BudgetAllocationChartProps) {
  if (allocations.length === 0) {
    return (
      <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>
        No category budgets configured yet.
      </p>
    );
  }

  return (
    <ul
      data-testid="budget-allocation-chart"
      style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0.75rem" }}
    >
      {allocations.map((allocation, index) => {
        const percent = usedPercent(allocation);
        const overBudget = allocation.currentSpentStroops > allocation.monthlyLimitStroops;
        return (
          <li key={allocation.category} style={{ display: "grid", gap: "0.25rem" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "0.8125rem",
              }}
            >
              <span style={{ fontWeight: 500 }}>{allocation.category}</span>
              <span style={{ color: overBudget ? "#b91c1c" : "#6b7280" }}>
                {formatXlm(allocation.currentSpentStroops, locale)} /{" "}
                {formatXlm(allocation.monthlyLimitStroops, locale)} XLM
              </span>
            </div>
            <div
              role="progressbar"
              aria-label={`${allocation.category} budget used`}
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              style={{
                height: "0.5rem",
                borderRadius: "9999px",
                background: "#e5e7eb",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${percent}%`,
                  background: overBudget ? "#dc2626" : categoryColor(index),
                  transition: "width 200ms ease-out",
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default BudgetAllocationChart;
