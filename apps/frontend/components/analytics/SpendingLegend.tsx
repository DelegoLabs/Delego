"use client";

import type {
  BuyerSpendingCategory,
  SpendMode,
} from "../../lib/spendingByCategory";
import { SPEND_MODE_LABELS } from "../../lib/spendingByCategory";
import { categoryColor } from "../../lib/categoryBudgets";
import { formatXlm } from "../../lib/orders";

export interface SpendingLegendProps {
  /**
   * Categories to list. The caller passes them already re-based onto the
   * active spend mode (see `spendingForMode`), so `totalSpentStroops` and
   * `percentageOfTotal` describe the slice of spend currently on screen.
   */
  categories: BuyerSpendingCategory[];
  locale?: string;
  modeFilter: SpendMode;
  onModeFilterChange: (mode: SpendMode) => void;
}

/**
 * Interactive legend for the category donut (#989): All/Autonomous/Manual
 * toggles plus a per-category row with a split bar showing the autonomous vs
 * manual ratio. Categories with no spend in the active mode are dimmed.
 */
export function SpendingLegend({
  categories,
  locale,
  modeFilter,
  onModeFilterChange,
}: SpendingLegendProps) {
  const totalAutonomous = categories.reduce(
    (sum, c) => sum + BigInt(c.autonomousSpendStroops),
    0n
  );
  const totalManual = categories.reduce(
    (sum, c) => sum + BigInt(c.manualSpendStroops),
    0n
  );

  const modes: { value: SpendMode; label: string; amount: bigint | null }[] = [
    { value: "all", label: SPEND_MODE_LABELS.all, amount: null },
    {
      value: "autonomous",
      label: SPEND_MODE_LABELS.autonomous,
      amount: totalAutonomous,
    },
    { value: "manual", label: SPEND_MODE_LABELS.manual, amount: totalManual },
  ];

  return (
    <div className="spending-legend">
      <div
        className="spending-legend-modes"
        role="group"
        aria-label="Spend mode"
      >
        {modes.map((mode) => (
          <button
            key={mode.value}
            type="button"
            className={`spending-legend-mode${mode.value === modeFilter ? " active" : ""}`}
            aria-pressed={mode.value === modeFilter}
            onClick={() => onModeFilterChange(mode.value)}
          >
            <span>{mode.label}</span>
            {mode.amount !== null && (
              <span className="spending-legend-mode-amount">
                {formatXlm(mode.amount, locale)} XLM
              </span>
            )}
          </button>
        ))}
      </div>

      <ul className="spending-legend-list">
        {categories.map((category, index) => {
          const amount = BigInt(category.totalSpentStroops);
          const autonomous = BigInt(category.autonomousSpendStroops);
          const manual = BigInt(category.manualSpendStroops);
          // The split bar always shows the autonomous share of the category's
          // full spend, whichever mode the chart is filtered to.
          const categoryTotal = autonomous + manual;
          const autonomousPct =
            categoryTotal > 0n
              ? (Number(autonomous) / Number(categoryTotal)) * 100
              : 0;
          const dimmed = amount === 0n && modeFilter !== "all";

          return (
            <li
              key={category.category}
              className="spending-legend-item"
              style={{ opacity: dimmed ? 0.4 : 1 }}
            >
              <span
                className="spending-legend-swatch"
                style={{ background: categoryColor(index) }}
                aria-hidden="true"
              />
              <span className="spending-legend-name">{category.category}</span>
              <span className="spending-legend-split" aria-hidden="true">
                <span
                  className="spending-legend-split-autonomous"
                  style={{ width: `${autonomousPct}%` }}
                />
                <span
                  className="spending-legend-split-manual"
                  style={{ width: `${100 - autonomousPct}%` }}
                />
              </span>
              <span className="spending-legend-amount">
                {formatXlm(amount, locale)} XLM
              </span>
              <span className="spending-legend-percent">
                {category.percentageOfTotal.toFixed(1)}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
