"use client";

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useLocale } from "next-intl";
import { Card } from "@delegolabs/ui";
import { SpendingOverview } from "../../components/analytics/SpendingOverview";
import { SpendChart } from "../../components/analytics/SpendChart";
import { RangeSwitcher } from "../../components/analytics/RangeSwitcher";
import { DeltaCards } from "../../components/analytics/DeltaCards";
import { AgentLeaderboard } from "../../components/analytics/AgentLeaderboard";
import { useAnalytics } from "../../hooks/useAnalytics";
import { useOrders } from "../../hooks/useOrders";
import {
  parseAnalyticsRange,
  spendByRange,
  calculateDeltas,
  type AnalyticsRange,
} from "../../lib/analytics";

export default function AnalyticsPage() {
  const { delegations, overview, loading, error } = useAnalytics();
  const { orders, loading: ordersLoading } = useOrders();
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const range = parseAnalyticsRange(searchParams.get("range"));
  const buckets = useMemo(
    () => spendByRange(orders, range, { locale }),
    [orders, range, locale]
  );
  const deltasInfo = useMemo(
    () => calculateDeltas(orders, range),
    [orders, range]
  );

  const setRange = useCallback(
    (next: AnalyticsRange) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("range", next);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  if (loading || ordersLoading) {
    return (
      <div className="settings-page">
        <header className="header">
          <h1>Analytics</h1>
          <p>Loading analytics data...</p>
        </header>
      </div>
    );
  }

  if (error) {
    return (
      <div className="settings-page">
        <header className="header">
          <h1>Analytics</h1>
          <p>Error: {error}</p>
        </header>
      </div>
    );
  }

  return (
    <div className="settings-page">
      <header className="header">
        <h1>Analytics</h1>
        <p>Compare delegation policies and view aggregate spending data</p>
      </header>

      <Card
        title="Spending Over Time"
        ariaLabel="Spending over time"
        style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
      >
        <RangeSwitcher value={range} onChange={setRange} />
        <DeltaCards current={deltasInfo.current} deltas={deltasInfo.deltas} key={range} />
        <SpendChart buckets={buckets} locale={locale} />
      </Card>

      <SpendingOverview overview={overview} />

      <Card title="Agent Leaderboard">
        <AgentLeaderboard orders={orders} delegations={delegations} />
      </Card>

      <Card title="Spending Utilization">
        {delegations.length === 0 ? (
          <p>No spending data to display.</p>
        ) : (
          <div className="utilization-bars">
            {delegations.map((del) => {
              const utilization =
                del.policy.maxTotal > 0n
                  ? Number(
                      (del.policy.maxPerTransaction * 100n) /
                        del.policy.maxTotal
                    )
                  : 0;
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
    </div>
  );
}
