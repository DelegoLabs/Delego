"use client";

import { use, useMemo } from "react";
import type { Delegation, Order } from "@delegolabs/types";
import { Card } from "@delegolabs/ui";
import { api } from "../../lib/api";
import { getResource } from "../../lib/suspenseResource";
import { spendByRange, type AnalyticsRange } from "../../lib/analytics";
import { adaptOrders, type ListOrdersResponse } from "@delegolabs/api-generated";
import { SpendingOverview } from "./SpendingOverview";
import { SpendChart } from "./SpendChart";
import { RangeSwitcher } from "./RangeSwitcher";
import { StaleBadge } from "../offline/StaleBadge";
import type { SpendingOverview as SpendingOverviewType } from "../../hooks/useAnalytics";
import { WidgetBoundary } from "../dashboard/WidgetBoundary";

const OVERVIEW_MIN_HEIGHT = "12rem";
const CHART_MIN_HEIGHT = "20rem";
const TABLE_MIN_HEIGHT = "16rem";

function asBigInt(value: bigint | string | number): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.trunc(value));
  return BigInt(value);
}

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

function overviewFrom(delegations: Delegation[]): SpendingOverviewType {
  return {
    totalDelegations: delegations.length,
    activeDelegations: delegations.filter((d) => d.status === "active").length,
    pausedDelegations: delegations.filter((d) => d.status === "paused").length,
    totalSpendingLimit: delegations.reduce(
      (sum, d) => sum + asBigInt(d.policy.maxTotal),
      0n
    ),
    averageSpendingLimit:
      delegations.length > 0
        ? delegations.reduce((sum, d) => sum + asBigInt(d.policy.maxTotal), 0n) /
          BigInt(delegations.length)
        : 0n,
    delegationsByStatus: delegations.reduce(
      (acc, d) => {
        acc[d.status] = (acc[d.status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    ),
  };
}

function OverviewWidget() {
  const delegations = use(loadDelegations());
  return <SpendingOverview overview={overviewFrom(delegations)} />;
}

function ChartWidget({
  range,
  locale,
  onRangeChange,
}: {
  range: AnalyticsRange;
  locale: string;
  onRangeChange: (range: AnalyticsRange) => void;
}) {
  const orders = use(loadOrders());
  const buckets = useMemo(
    () => spendByRange(orders, range, { locale }),
    [orders, range, locale]
  );
  return (
    <Card
      title="Spending Over Time"
      ariaLabel="Spending over time"
      style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
    >
      <RangeSwitcher value={range} onChange={onRangeChange} />
      <SpendChart buckets={buckets} locale={locale} />
    </Card>
  );
}

function ComparisonWidget() {
  const delegations = use(loadDelegations());
  return (
    <Card title="Delegation Comparison">
      {delegations.length === 0 ? (
        <p>No delegations to compare.</p>
      ) : (
        <div className="comparison-table-wrapper">
          <table className="comparison-table">
            <thead>
              <tr>
                <th>Agent</th>
                <th>Status</th>
                <th>Max/Transaction</th>
                <th>Total Limit</th>
                <th>Expires</th>
              </tr>
            </thead>
            <tbody>
              {delegations.map((del) => (
                <tr key={del.id}>
                  <td>{del.agentId}</td>
                  <td>
                    <span className={`status-badge status-${del.status}`}>
                      {del.status}
                    </span>
                  </td>
                  <td>
                    {(Number(asBigInt(del.policy.maxPerTransaction)) / 10_000_000).toFixed(2)}{" "}
                    XLM
                  </td>
                  <td>
                    {(Number(asBigInt(del.policy.maxTotal)) / 10_000_000).toFixed(2)}{" "}
                    XLM
                  </td>
                  <td>{del.policy.expiresAt ?? "Never"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function UtilizationWidget() {
  const delegations = use(loadDelegations());
  return (
    <Card title="Spending Utilization">
      {delegations.length === 0 ? (
        <p>No spending data to display.</p>
      ) : (
        <div className="utilization-bars">
          {delegations.map((del) => {
            const maxTotal = asBigInt(del.policy.maxTotal);
            const maxPer = asBigInt(del.policy.maxPerTransaction);
            const utilization =
              maxTotal > 0n ? Number((maxPer * 100n) / maxTotal) : 0;
            return (
              <div key={del.id} className="utilization-row">
                <span className="utilization-label">{del.agentId}</span>
                <div className="utilization-bar-track">
                  <div
                    className="utilization-bar-fill"
                    style={{ width: `${Math.min(utilization, 100)}%` }}
                  />
                </div>
                <span className="utilization-value">{utilization}%</span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

export interface AnalyticsDashboardProps {
  range: AnalyticsRange;
  locale: string;
  onRangeChange: (range: AnalyticsRange) => void;
  stale?: boolean;
  cachedAt?: number | null;
  ttlMs?: number;
}

/**
 * Independent analytics widgets, each in its own Suspense + error boundary
 * so the slowest query no longer blocks the rest of the dashboard (#625).
 */
export function AnalyticsDashboard({
  range,
  locale,
  onRangeChange,
  stale = false,
  cachedAt = null,
  ttlMs,
}: AnalyticsDashboardProps) {
  return (
    <div className="analytics-dashboard">
      <StaleBadge family="analytics" stale={stale} cachedAt={cachedAt} ttlMs={ttlMs} />
      <WidgetBoundary name="Spending over time" minHeight={CHART_MIN_HEIGHT}>
        <ChartWidget range={range} locale={locale} onRangeChange={onRangeChange} />
      </WidgetBoundary>
      <WidgetBoundary name="Spending overview" minHeight={OVERVIEW_MIN_HEIGHT}>
        <OverviewWidget />
      </WidgetBoundary>
      <WidgetBoundary name="Delegation comparison" minHeight={TABLE_MIN_HEIGHT}>
        <ComparisonWidget />
      </WidgetBoundary>
      <WidgetBoundary name="Spending utilization" minHeight={TABLE_MIN_HEIGHT}>
        <UtilizationWidget />
      </WidgetBoundary>
    </div>
  );
}
