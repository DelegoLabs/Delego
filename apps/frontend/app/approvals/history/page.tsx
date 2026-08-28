"use client";

import { useCallback, useMemo } from "react";
import { Button } from "@delegolabs/ui";
import { useOrders } from "../../../hooks/useOrders";
import { useDelegations } from "../../../hooks/useDelegations";
import { useQueryParamState, stringParamCodec } from "../../../hooks/useQueryParamState";
import {
  approvalDecisionsToCsv,
  deriveApprovalDecisions,
  filterApprovalDecisions,
  uniqueAgentIds,
  uniqueDelegationIds,
  type ApprovalHistoryFilters as ApprovalHistoryFilterModel,
} from "../../../lib/approvals";
import { downloadCsv, toCsv } from "../../../lib/csv";
import {
  ApprovalHistoryFilters,
  EMPTY_HISTORY_FILTERS,
  hasAnyHistoryFilter,
  type ApprovalHistoryFilterValues,
} from "../../../components/orders/ApprovalHistoryFilters";
import { ApprovalHistoryTable } from "../../../components/orders/ApprovalHistoryTable";
import { CopyViewLinkButton } from "../../../components/filters/CopyViewLinkButton";

const POLL_INTERVAL_MS = 15_000;

/** Parse a `YYYY-MM-DD` filter value into a day-bound Date, or null. */
function startOfDay(value: string): Date | null {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}
function endOfDay(value: string): Date | null {
  if (!value) return null;
  const date = new Date(`${value}T23:59:59.999`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Approval history (#568) — every approve/reject decision the user has made,
 * derived from the order list (there is no decisions API). Filters are
 * AND-composed and URL-synced so a filtered view can be shared; "Export CSV"
 * downloads the decisions dataset (schema documented in lib/approvals.ts).
 */
export default function ApprovalHistoryPage() {
  const { orders, loading, error } = useOrders({
    pollIntervalMs: POLL_INTERVAL_MS,
  });
  const { delegations } = useDelegations();

  const [from, setFrom] = useQueryParamState<string>({
    key: "from",
    defaultValue: "",
    codec: stringParamCodec(),
  });
  const [to, setTo] = useQueryParamState<string>({
    key: "to",
    defaultValue: "",
    codec: stringParamCodec(),
  });
  const [decision, setDecision] = useQueryParamState<string>({
    key: "decision",
    defaultValue: "",
    codec: stringParamCodec(),
  });
  const [agentId, setAgentId] = useQueryParamState<string>({
    key: "agent",
    defaultValue: "",
    codec: stringParamCodec(),
  });
  const [delegationId, setDelegationId] = useQueryParamState<string>({
    key: "delegation",
    defaultValue: "",
    codec: stringParamCodec(),
  });

  const values: ApprovalHistoryFilterValues = {
    from,
    to,
    decision: decision === "approved" || decision === "rejected" ? decision : "",
    agentId,
    delegationId,
  };

  const agentByDelegationId = useMemo(() => {
    const map = new Map<string, string>();
    for (const delegation of delegations) {
      map.set(delegation.id, delegation.agentId);
    }
    return map;
  }, [delegations]);

  const allRecords = useMemo(
    () => deriveApprovalDecisions(orders, { agentByDelegationId }),
    [orders, agentByDelegationId]
  );

  const filterModel: ApprovalHistoryFilterModel = useMemo(
    () => ({
      from: startOfDay(values.from),
      to: endOfDay(values.to),
      decision: values.decision || null,
      agentId: values.agentId || null,
      delegationId: values.delegationId || null,
    }),
    [values.from, values.to, values.decision, values.agentId, values.delegationId]
  );

  const filtered = useMemo(
    () => filterApprovalDecisions(allRecords, filterModel),
    [allRecords, filterModel]
  );

  const agentOptions = useMemo(() => uniqueAgentIds(allRecords), [allRecords]);
  const delegationOptions = useMemo(
    () => uniqueDelegationIds(allRecords),
    [allRecords]
  );

  const applyPatch = useCallback(
    (patch: Partial<ApprovalHistoryFilterValues>) => {
      if (patch.from !== undefined) setFrom(patch.from);
      if (patch.to !== undefined) setTo(patch.to);
      if (patch.decision !== undefined) setDecision(patch.decision);
      if (patch.agentId !== undefined) setAgentId(patch.agentId);
      if (patch.delegationId !== undefined) setDelegationId(patch.delegationId);
    },
    [setFrom, setTo, setDecision, setAgentId, setDelegationId]
  );

  const resetFilters = useCallback(() => {
    applyPatch(EMPTY_HISTORY_FILTERS);
  }, [applyPatch]);

  const exportCsv = useCallback(() => {
    const { header, rows } = approvalDecisionsToCsv(filtered);
    downloadCsv(
      `delego-approval-decisions-${Date.now()}.csv`,
      toCsv(header, rows)
    );
  }, [filtered]);

  const isInitialLoading = loading && orders.length === 0;

  return (
    <div className="settings-page">
      <header className="header">
        <div className="header-row">
          <div>
            <h1>Approval history</h1>
            <p>
              Every order you&rsquo;ve approved or rejected, kept for your own
              audit and expense reconciliation.
            </p>
          </div>
          <div className="form-actions">
            <Button
              variant="ghost"
              onClick={exportCsv}
              disabled={filtered.length === 0}
              ariaLabel="Export decisions as CSV"
            >
              Export CSV
            </Button>
            <CopyViewLinkButton />
          </div>
        </div>
      </header>

      {error && (
        <div className="settings-status error" role="alert">
          {error}
        </div>
      )}

      <ApprovalHistoryFilters
        values={values}
        agentOptions={agentOptions}
        delegationOptions={delegationOptions}
        onChange={applyPatch}
        onReset={resetFilters}
      />

      {isInitialLoading ? (
        <div className="card skeleton">
          <div className="skeleton-title" />
          <div className="skeleton-text" />
          <div className="skeleton-text" />
        </div>
      ) : allRecords.length === 0 ? (
        <div className="card">
          <p>
            No decided approvals yet. Once you approve or reject an order it
            shows up here.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <p>
            No decisions match these filters.
            {hasAnyHistoryFilter(values) && (
              <>
                {" "}
                <Button variant="ghost" onClick={resetFilters}>
                  Clear filters
                </Button>
              </>
            )}
          </p>
        </div>
      ) : (
        <>
          <p className="stat-label">
            {filtered.length === allRecords.length
              ? `${filtered.length} decision${filtered.length === 1 ? "" : "s"}`
              : `${filtered.length} of ${allRecords.length} decisions`}
          </p>
          <ApprovalHistoryTable records={filtered} />
        </>
      )}
    </div>
  );
}
