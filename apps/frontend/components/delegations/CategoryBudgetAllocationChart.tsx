"use client";

import { Card } from "@delegolabs/ui";
import { formatXlm } from "../../lib/orders";
import { categoryColor, percentOf, toStroops, totalAllocated } from "../../lib/categoryBudgets";
import type { CategoryBudget } from "../../lib/categoryBudgets";

export interface CategoryBudgetAllocationChartProps {
  /** The parent delegation limit every category budget sits inside. */
  parentLimitStroops: string;
  budgets: CategoryBudget[];
  locale?: string;
}

/**
 * Read-only view of how a delegation's category budgets divide up its
 * parent limit. Editing lives in `CategoryBudgetSliders`; this is the
 * summary shown alongside it.
 */
export function CategoryBudgetAllocationChart({
  parentLimitStroops,
  budgets,
  locale,
}: CategoryBudgetAllocationChartProps) {
  const parentLimit = toStroops(parentLimitStroops);
  const allocated = totalAllocated(budgets);
  const unassigned = parentLimit - allocated;

  return (
    <Card>
      <div style={{ display: "grid", gap: "0.75rem" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: "0.8125rem",
            color: "#6b7280",
          }}
        >
          <span>Allocated</span>
          <span>
            {formatXlm(allocated, locale)} of {formatXlm(parentLimit, locale)} XLM
          </span>
        </div>

        {budgets.length === 0 ? (
          <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>
            No category budgets allocated yet.
          </p>
        ) : (
          <ul
            data-testid="category-budget-allocation-chart"
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "grid",
              gap: "0.5rem",
            }}
          >
            {budgets.map((budget, index) => {
              const percent = parentLimit > 0n
                ? Number(percentOf(toStroops(budget.allocatedStroops), parentLimit))
                : 0;
              return (
                <li
                  key={budget.category}
                  style={{ display: "grid", gap: "0.25rem" }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "0.8125rem",
                    }}
                  >
                    <span style={{ fontWeight: 500 }}>{budget.category}</span>
                    <span style={{ color: "#6b7280" }}>
                      {formatXlm(toStroops(budget.allocatedStroops), locale)} XLM
                    </span>
                  </div>
                  <div
                    role="progressbar"
                    aria-label={`${budget.category} share of delegation limit`}
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
                        width: `${Math.min(100, percent)}%`,
                        background: categoryColor(index),
                        transition: "width 200ms ease-out",
                      }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {unassigned > 0n ? (
          <p style={{ fontSize: "0.75rem", color: "#6b7280" }}>
            {formatXlm(unassigned, locale)} XLM of the delegation limit is not
            assigned to a category yet.
          </p>
        ) : null}
      </div>
    </Card>
  );
}

export default CategoryBudgetAllocationChart;
