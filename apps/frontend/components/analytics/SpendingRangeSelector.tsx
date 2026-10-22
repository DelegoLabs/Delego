"use client";

import {
  SPENDING_CATEGORY_RANGE_LABELS,
  SPENDING_CATEGORY_RANGES,
  type SpendingCategoryRange,
} from "../../lib/spendingByCategory";

export interface SpendingRangeSelectorProps {
  value: SpendingCategoryRange;
  onChange: (range: SpendingCategoryRange) => void;
}

/**
 * Month selector for the category breakdown (#989): Current Month / Last 30
 * Days / Year-to-Date. The active range is persisted in the URL by the caller
 * (see app/analytics/page.tsx).
 */
export function SpendingRangeSelector({
  value,
  onChange,
}: SpendingRangeSelectorProps) {
  return (
    <label className="spending-range-selector">
      <span className="spending-range-selector-label">Period</span>
      <select
        value={value}
        aria-label="Spending period"
        onChange={(event) =>
          onChange(event.target.value as SpendingCategoryRange)
        }
      >
        {SPENDING_CATEGORY_RANGES.map((range) => (
          <option key={range} value={range}>
            {SPENDING_CATEGORY_RANGE_LABELS[range]}
          </option>
        ))}
      </select>
    </label>
  );
}
