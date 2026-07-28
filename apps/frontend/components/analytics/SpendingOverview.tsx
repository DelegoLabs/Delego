"use client";

import { Card } from "@delego/ui";
import type { SpendingOverview as SpendingOverviewType } from "../../hooks/useAnalytics";

interface SpendingOverviewProps {
  overview: SpendingOverviewType;
}

export function SpendingOverview({ overview }: SpendingOverviewProps) {
  const formatStroops = (stroops: bigint) => {
    const xlm = Number(stroops) / 10_000_000;
    return xlm.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  return (
    <div className="grid">
      <Card title="Total Delegations">
        <p className="stat-value">{overview.totalDelegations}</p>
        <p className="stat-label">All delegations</p>
      </Card>

      <Card title="Active">
        <p className="stat-value stat-positive">{overview.activeDelegations}</p>
        <p className="stat-label">Currently active</p>
      </Card>

      <Card title="Paused">
        <p className="stat-value stat-neutral">{overview.pausedDelegations}</p>
        <p className="stat-label">Currently paused</p>
      </Card>

      <Card title="Total Spending Limit">
        <p className="stat-value">
          {formatStroops(overview.totalSpendingLimit)} XLM
        </p>
        <p className="stat-label">Across all delegations</p>
      </Card>

      <Card title="Average Limit">
        <p className="stat-value">
          {formatStroops(overview.averageSpendingLimit)} XLM
        </p>
        <p className="stat-label">Per delegation</p>
      </Card>

      <Card title="By Status">
        <div className="status-bars">
          {Object.entries(overview.delegationsByStatus).map(
            ([status, count]) => {
              const percentage =
                overview.totalDelegations > 0
                  ? (count / overview.totalDelegations) * 100
                  : 0;
              return (
                <div key={status} className="status-bar-row">
                  <span className="status-label">{status}</span>
                  <div className="status-bar-track">
                    <div
                      className="status-bar-fill"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <span className="status-count">{count}</span>
                </div>
              );
            }
          )}
        </div>
      </Card>
    </div>
  );
}
