"use client";

import { useMemo, useState } from "react";
import { Card, Button } from "@delegolabs/ui";
import { useOrders } from "../../../hooks/useOrders";
import { useQueryParamState } from "../../../hooks/useQueryParamState";
import { buildWeeklyReport, formatReportAsText } from "../../../lib/weeklyReport";
import { formatXlm } from "../../../lib/orders";

const WEEK_OPTIONS = [1, 2, 4, 8];

function fmtDate(d: Date) {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function pctLabel(p: number | null) {
  if (p === null) return "n/a";
  return `${p >= 0 ? "+" : ""}${p.toFixed(1)}%`;
}

export default function WeeklyReportPage() {
  const { orders, loading } = useOrders();
  const [weekCount, setWeekCount] = useQueryParamState<number>({
    key: "weeks",
    defaultValue: 1,
  });
  const [copied, setCopied] = useState(false);

  const report = useMemo(
    () => buildWeeklyReport(orders, new Date(), weekCount),
    [orders, weekCount]
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(formatReportAsText(report));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — no-op */
    }
  };

  if (loading) {
    return <div className="settings-page">Loading…</div>;
  }

  return (
    <div className="settings-page weekly-report-page">
      <header className="header no-print">
        <h1>Weekly report</h1>
        <p>A shareable summary for forwarding or approval chains.</p>
      </header>

      <div className="report-controls no-print">
        <label htmlFor="report-week-count">Period</label>
        <select
          id="report-week-count"
          value={weekCount}
          onChange={(e) => setWeekCount(Number(e.target.value))}
        >
          {WEEK_OPTIONS.map((n) => (
            <option key={n} value={n}>
              Last {n} week{n === 1 ? "" : "s"}
            </option>
          ))}
        </select>
        <Button variant="secondary" onClick={handleCopy}>
          {copied ? "Copied!" : "Copy summary as text"}
        </Button>
        <Button variant="primary" onClick={() => window.print()}>
          Print
        </Button>
      </div>

      <div className="report-print-area">
        <div className="report-print-header">
          <h2>Weekly Report</h2>
          <p>
            {fmtDate(report.periodStart)} – {fmtDate(report.periodEnd)}
          </p>
        </div>

        <div className="report-kpi-cards">
          <Card title="Total spend">
            <p className="stat-value">{report.totalSpendStroops.current.toFixed(2)} XLM</p>
            <p className="stat-label">{pctLabel(report.totalSpendStroops.percentChange)} vs prior period</p>
          </Card>
          <Card title="Orders">
            <p className="stat-value">{report.orderCount.current}</p>
            <p className="stat-label">{pctLabel(report.orderCount.percentChange)} vs prior period</p>
          </Card>
        </div>

        <Card title="Top delegations">
          {report.topDelegations.length === 0 ? (
            <p className="stat-label">No spend in this period.</p>
          ) : (
            <table className="comparison-table">
              <thead>
                <tr>
                  <th scope="col">Delegation</th>
                  <th scope="col">Spend</th>
                  <th scope="col">Orders</th>
                </tr>
              </thead>
              <tbody>
                {report.topDelegations.map((row) => (
                  <tr key={row.delegationId}>
                    <td>{row.delegationId}</td>
                    <td>{formatXlm(row.totalStroops)} XLM</td>
                    <td>{row.orderCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="Notable events">
          {report.notableEvents.length === 0 ? (
            <p className="stat-label">No disputes or rejections in this period.</p>
          ) : (
            <ul className="report-events-list">
              {report.notableEvents.map((event) => (
                <li key={event.orderId}>
                  <strong>{event.type === "dispute_opened" ? "Dispute" : "Rejected"}</strong> — Order{" "}
                  {event.orderId}: {event.detail}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <p className="report-print-footer">
          Generated {new Date().toLocaleString()}
        </p>
      </div>
    </div>
  );
}
