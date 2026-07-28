"use client";

import { Card } from "@delego/ui";
import { SpendingOverview } from "../../components/analytics/SpendingOverview";
import { useAnalytics } from "../../hooks/useAnalytics";

export default function AnalyticsPage() {
  const { delegations, overview, loading, error } = useAnalytics();

  if (loading) {
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

      <SpendingOverview overview={overview} />

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
                      {(
                        Number(del.policy.maxPerTransaction) / 10_000_000
                      ).toFixed(2)}{" "}
                      XLM
                    </td>
                    <td>
                      {(Number(del.policy.maxTotal) / 10_000_000).toFixed(2)}{" "}
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
