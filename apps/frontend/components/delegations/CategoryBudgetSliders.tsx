"use client";

import { useId } from "react";
import { Card } from "@delegolabs/ui";
import { formatXlm } from "../../lib/orders";
import {
  categoryColor,
  maxAllocationFor,
  percentOf,
  setAllocation,
  toStroops,
  totalAllocated,
  usageTone,
  validateBudgets,
  type CategoryBudget,
} from "../../lib/categoryBudgets";

export interface CategoryBudgetSlidersProps {
  /** The parent delegation's spending limit — category budgets can't exceed it in total. */
  parentLimitStroops: string;
  budgets: CategoryBudget[];
  onChange: (budgets: CategoryBudget[]) => void;
  locale?: string;
}

/** Slider granularity: whole XLM. */
const STEP_STROOPS = 10_000_000n;

const TONE_LABELS = {
  ok: "On track",
  warning: "Nearly used",
  over: "Over budget",
} as const;

/**
 * Per-category spending caps inside a delegation (#716). Each slider is
 * bounded by the headroom left under the parent limit, so the sum of
 * category budgets can never exceed it; a color-coded bar shows how the
 * limit is distributed.
 */
export function CategoryBudgetSliders({
  parentLimitStroops,
  budgets,
  onChange,
  locale,
}: CategoryBudgetSlidersProps) {
  const idPrefix = useId();
  const parentLimit = toStroops(parentLimitStroops);
  const allocated = totalAllocated(budgets);
  const unallocated = parentLimit > allocated ? parentLimit - allocated : 0n;
  const validation = validateBudgets(budgets, parentLimit);

  function handleSlider(index: number, steps: number) {
    onChange(setAllocation(budgets, index, BigInt(steps) * STEP_STROOPS, parentLimit));
  }

  return (
    <Card title="Category budgets" ariaLabel="Category budget allocation">
      <div className="category-budget-summary">
        <span>
          {formatXlm(allocated, locale)} of {formatXlm(parentLimit, locale)} XLM allocated (
          {percentOf(allocated, parentLimit)}%)
        </span>
        <span className="stat-label">{formatXlm(unallocated, locale)} XLM unallocated</span>
      </div>

      <div
        className="category-budget-bar"
        role="img"
        aria-label={budgets
          .map((b) => `${b.category} ${percentOf(toStroops(b.allocatedStroops), parentLimit)}%`)
          .concat(`Unallocated ${percentOf(unallocated, parentLimit)}%`)
          .join(", ")}
      >
        {budgets.map((b, i) => {
          const pct = percentOf(toStroops(b.allocatedStroops), parentLimit);
          return pct > 0 ? (
            <span
              key={b.category}
              className="category-budget-bar-segment"
              style={{ width: `${pct}%`, background: categoryColor(i) }}
              title={`${b.category}: ${pct}%`}
            />
          ) : null;
        })}
      </div>

      {!validation.valid && (
        <div className="settings-status error" role="alert">
          {validation.error} Reduce allocations by {formatXlm(validation.overBy, locale)} XLM.
        </div>
      )}

      <ul className="category-budget-list">
        {budgets.map((b, i) => {
          const allocation = toStroops(b.allocatedStroops);
          const spent = toStroops(b.spentStroops);
          const max = maxAllocationFor(budgets, i, parentLimit);
          const tone = usageTone(b);
          const sliderId = `${idPrefix}-${i}`;
          return (
            <li key={b.category} className="category-budget-row">
              <div className="category-budget-row-header">
                <span className="category-budget-swatch" style={{ background: categoryColor(i) }} />
                <label htmlFor={sliderId} className="category-budget-name">
                  {b.category}
                </label>
                <span className="stat-label">
                  {b.limitPeriod === "weekly" ? "per week" : "per month"}
                </span>
                <strong className="category-budget-amount">
                  {formatXlm(allocation, locale)} XLM · {percentOf(allocation, parentLimit)}%
                </strong>
              </div>
              <input
                id={sliderId}
                type="range"
                min={0}
                max={Number(parentLimit / STEP_STROOPS)}
                step={1}
                value={Number(allocation / STEP_STROOPS)}
                onChange={(e) => handleSlider(i, Number(e.target.value))}
                aria-valuetext={`${formatXlm(allocation, locale)} XLM, ${percentOf(allocation, parentLimit)}% of limit`}
                className="category-budget-slider"
                style={{ accentColor: categoryColor(i) }}
              />
              <div className="category-budget-row-footer">
                <span className={`category-budget-usage category-budget-usage-${tone}`}>
                  {TONE_LABELS[tone]}: {formatXlm(spent, locale)} XLM spent
                </span>
                <span className="stat-label">Max {formatXlm(max, locale)} XLM</span>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
