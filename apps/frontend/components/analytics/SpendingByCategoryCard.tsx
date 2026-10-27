"use client";

import { use, useMemo, useState } from "react";
import type { Delegation, Order } from "@delegolabs/types";
import { Card } from "@delegolabs/ui";
import { api } from "../../lib/api";
import { getResource } from "../../lib/suspenseResource";
import {
  adaptOrders,
  type ListOrdersResponse,
} from "@delegolabs/api-generated";
import {
  computeSpendingByCategory,
  spendingForMode,
  type SpendMode,
  type SpendingCategoryRange,
} from "../../lib/spendingByCategory";
import { SpendingDonutChart } from "./SpendingDonutChart";
import { SpendingLegend } from "./SpendingLegend";
import { SpendingRangeSelector } from "./SpendingRangeSelector";
import { fetchXlmRate } from "../../lib/rates";

function loadDelegations(): Promise<Delegation[]> {
  return getResource("analytics:delegations", async () => {
    const response = await api.getDelegations();
    return response.data ?? [];
  });
}

function loadOrders(): Promise<Order[]> {
  return getResource("analytics:orders", async () => {
    const res = (await api.getOrders()) as ListOrdersResponse;
    if (!Array.isArray(res.data)) return [];
    return adaptOrders(res.data);
  });
}

/** XLM/USD rate for the tooltip's USD equivalent. Falls back to a static rate when no rate source is configured. */
function loadRate(): Promise<number> {
  return getResource("analytics:rate", async () => {
    const snapshot = await fetchXlmRate();
    return snapshot.xlmUsdRate;
  });
}

export interface SpendingByCategoryCardProps {
  range: SpendingCategoryRange;
  onRangeChange: (range: SpendingCategoryRange) => void;
  locale?: string;
}

/**
 * Container for the buyer spending-by-category breakdown (#989). Loads orders
 * and delegations through the shared Suspense resource cache, computes the
 * per-category totals, and renders the donut chart + interactive legend +
 * range selector.
 */
export function SpendingByCategoryCard({
  range,
  onRangeChange,
  locale,
}: SpendingByCategoryCardProps) {
  const orders = use(loadOrders());
  const delegations = use(loadDelegations());
  const xlmUsdRate = use(loadRate());
  const [modeFilter, setModeFilter] = useState<SpendMode>("all");

  const categories = useMemo(
    () => computeSpendingByCategory(orders, delegations, range),
    [orders, delegations, range]
  );

  // The chart and the legend always describe the same slice of spend.
  const visibleCategories = useMemo(
    () => spendingForMode(categories, modeFilter),
    [categories, modeFilter]
  );

  return (
    <Card
      title="Spending by Category"
      ariaLabel="Spending by category"
      style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
    >
      <div className="spending-by-category-header">
        <SpendingRangeSelector value={range} onChange={onRangeChange} />
      </div>

      {categories.length === 0 ? (
        <div className="spending-by-category-empty">
          <p>No spending in the selected range.</p>
        </div>
      ) : (
        <div className="spending-by-category-grid">
          <SpendingDonutChart
            categories={visibleCategories}
            locale={locale}
            xlmUsdRate={xlmUsdRate}
          />
          <SpendingLegend
            categories={visibleCategories}
            locale={locale}
            modeFilter={modeFilter}
            onModeFilterChange={setModeFilter}
          />
        </div>
      )}
    </Card>
  );
}
