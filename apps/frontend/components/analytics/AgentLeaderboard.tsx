"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { Order, Delegation } from "@delegolabs/types";
import { Amount } from "@delegolabs/ui";
import { useCurrency } from "../../hooks/useCurrency";

export interface AgentLeaderboardProps {
  orders: Order[];
  delegations: Delegation[];
}

type SortField = "agentId" | "tasks" | "successRate" | "avgSavings" | "totalSpent" | "activeDelegations";
type SortDirection = "asc" | "desc";

export function AgentLeaderboard({ orders, delegations }: AgentLeaderboardProps) {
  const router = useRouter();
  const { currencyId, rate } = useCurrency();
  const [sortField, setSortField] = useState<SortField>("totalSpent");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");

  const agentsData = useMemo(() => {
    const agentMap = new Map<string, any>();
    
    // Process delegations
    for (const del of delegations) {
      if (!agentMap.has(del.agentId)) {
        agentMap.set(del.agentId, {
          agentId: del.agentId,
          tasks: 0,
          approvedCount: 0,
          totalSpent: 0n,
          avgSavings: 0n,
          activeDelegations: 0
        });
      }
      const data = agentMap.get(del.agentId);
      if (del.status === "active") {
        data.activeDelegations += 1;
      }
    }

    // Process orders (agentId is assumed to be associated, if it's stored on order or delegation)
    // Note: Order might not have agentId directly, it might be delegationId.
    // If order has delegationId, we map it to agentId.
    const delegationAgentMap = new Map(delegations.map(d => [d.id, d.agentId]));

    for (const order of orders) {
      const orderAgentId = (order as any).agentId || delegationAgentMap.get(order.delegationId);
      if (!orderAgentId) continue;

      if (!agentMap.has(orderAgentId)) {
        agentMap.set(orderAgentId, {
          agentId: orderAgentId,
          tasks: 0,
          approvedCount: 0,
          totalSpent: 0n,
          avgSavings: 0n,
          activeDelegations: 0
        });
      }
      const data = agentMap.get(orderAgentId);
      data.tasks += 1;
      if (order.status === "approved" || order.status === "fulfilled" || order.status === "settled" || order.status === "escrowed") {
        data.approvedCount += 1;
        data.totalSpent += order.totalStroops;
      }
    }

    const rows = Array.from(agentMap.values()).map(row => ({
      ...row,
      successRate: row.tasks > 0 ? row.approvedCount / row.tasks : 0,
    }));

    return rows.sort((a, b) => {
      let delta = 0;
      if (sortField === "agentId") {
        delta = a.agentId.localeCompare(b.agentId);
      } else if (sortField === "totalSpent" || sortField === "avgSavings") {
        delta = a[sortField] < b[sortField] ? -1 : a[sortField] > b[sortField] ? 1 : 0;
      } else {
        delta = a[sortField] - b[sortField];
      }
      return sortDir === "asc" ? delta : -delta;
    });
  }, [orders, delegations, sortField, sortDir]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return <span aria-hidden="true" className="sort-icon">{sortDir === "asc" ? " ▲" : " ▼"}</span>;
  };

  const handleRowClick = (agentId: string) => {
    router.push(`/orders?search=${encodeURIComponent(agentId)}`);
  };

  return (
    <div className="leaderboard-container">
      <div className="comparison-table-wrapper desktop-leaderboard">
        <table className="comparison-table sticky-header">
          <thead>
            <tr>
              <th aria-sort={sortField === "agentId" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
                <button onClick={() => handleSort("agentId")} className="sort-button">Agent <SortIcon field="agentId" /></button>
              </th>
              <th aria-sort={sortField === "tasks" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
                <button onClick={() => handleSort("tasks")} className="sort-button">Tasks <SortIcon field="tasks" /></button>
              </th>
              <th aria-sort={sortField === "successRate" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
                <button onClick={() => handleSort("successRate")} className="sort-button">Success Rate <SortIcon field="successRate" /></button>
              </th>
              <th aria-sort={sortField === "avgSavings" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
                <button onClick={() => handleSort("avgSavings")} className="sort-button">Avg Savings <SortIcon field="avgSavings" /></button>
              </th>
              <th aria-sort={sortField === "totalSpent" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
                <button onClick={() => handleSort("totalSpent")} className="sort-button">Total Spent <SortIcon field="totalSpent" /></button>
              </th>
              <th aria-sort={sortField === "activeDelegations" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
                <button onClick={() => handleSort("activeDelegations")} className="sort-button">Active Delegations <SortIcon field="activeDelegations" /></button>
              </th>
            </tr>
          </thead>
          <tbody>
            {agentsData.map(row => (
              <tr key={row.agentId} onClick={() => handleRowClick(row.agentId)} className="clickable-row">
                <td>{row.agentId}</td>
                <td>{row.tasks}</td>
                <td>{(row.successRate * 100).toFixed(1)}%</td>
                <td>
                  <Amount stroops={row.avgSavings} currency={currencyId} xlmUsdRate={rate?.xlmUsdRate} />
                </td>
                <td>
                  <Amount stroops={row.totalSpent} currency={currencyId} xlmUsdRate={rate?.xlmUsdRate} />
                </td>
                <td>{row.activeDelegations}</td>
              </tr>
            ))}
            {agentsData.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: "center" }}>No agent data available.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mobile-leaderboard-cards">
        {agentsData.map(row => (
          <div key={row.agentId} className="card clickable-card" onClick={() => handleRowClick(row.agentId)} style={{ marginBottom: "1rem", cursor: "pointer" }}>
            <div className="card-header">
              <h3>{row.agentId}</h3>
            </div>
            <div className="grid">
              <div className="stat-group">
                <span className="stat-label">Total Spent </span>
                <span className="stat-value">
                  <Amount stroops={row.totalSpent} currency={currencyId} xlmUsdRate={rate?.xlmUsdRate} />
                </span>
              </div>
              <div className="stat-group">
                <span className="stat-label">Tasks </span>
                <span className="stat-value">{row.tasks}</span>
              </div>
              <div className="stat-group">
                <span className="stat-label">Success Rate </span>
                <span className="stat-value">{(row.successRate * 100).toFixed(1)}%</span>
              </div>
              <div className="stat-group">
                <span className="stat-label">Active </span>
                <span className="stat-value">{row.activeDelegations}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <style jsx>{`
        .sort-button {
          background: none;
          border: none;
          color: inherit;
          font: inherit;
          cursor: pointer;
          padding: 0;
          display: flex;
          align-items: center;
          gap: 0.25rem;
        }
        .clickable-row { cursor: pointer; transition: background 0.15s; }
        .clickable-row:hover { background: var(--color-bg-subtle); }
        .sticky-header th { position: sticky; top: 0; background: var(--color-bg); z-index: 10; }
        @media (min-width: 768px) {
          .mobile-leaderboard-cards { display: none; }
        }
        @media (max-width: 767px) {
          .desktop-leaderboard { display: none; }
        }
      `}</style>
    </div>
  );
}
