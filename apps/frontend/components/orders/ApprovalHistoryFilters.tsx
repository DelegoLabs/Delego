"use client";

import { Button } from "@delegolabs/ui";
import type { ApprovalDecisionType } from "../../lib/approvals";

/** Raw (string) filter state, mirrored 1:1 to the URL query string. */
export interface ApprovalHistoryFilterValues {
  /** ISO date `YYYY-MM-DD`, or "" for no lower bound. */
  from: string;
  /** ISO date `YYYY-MM-DD`, or "" for no upper bound. */
  to: string;
  decision: "" | ApprovalDecisionType;
  agentId: string;
  delegationId: string;
}

export const EMPTY_HISTORY_FILTERS: ApprovalHistoryFilterValues = {
  from: "",
  to: "",
  decision: "",
  agentId: "",
  delegationId: "",
};

export function hasAnyHistoryFilter(
  values: ApprovalHistoryFilterValues
): boolean {
  return (
    values.from !== "" ||
    values.to !== "" ||
    values.decision !== "" ||
    values.agentId !== "" ||
    values.delegationId !== ""
  );
}

export interface ApprovalHistoryFiltersProps {
  values: ApprovalHistoryFilterValues;
  agentOptions: string[];
  delegationOptions: string[];
  onChange: (patch: Partial<ApprovalHistoryFilterValues>) => void;
  onReset: () => void;
}

/**
 * Filter bar for the approvals history view (#568): date range, decision
 * type, agent, delegation. Filters compose AND-style — the page applies them
 * together and keeps this state in the URL so a filtered view is shareable.
 */
export function ApprovalHistoryFilters({
  values,
  agentOptions,
  delegationOptions,
  onChange,
  onReset,
}: ApprovalHistoryFiltersProps) {
  return (
    <div className="order-filters">
      <div className="order-filters-row">
        <label className="order-sort">
          <span className="order-sort-label">Decided from</span>
          <input
            type="date"
            value={values.from}
            max={values.to || undefined}
            onChange={(e) => onChange({ from: e.target.value })}
            aria-label="Decided on or after"
          />
        </label>
        <label className="order-sort">
          <span className="order-sort-label">Decided to</span>
          <input
            type="date"
            value={values.to}
            min={values.from || undefined}
            onChange={(e) => onChange({ to: e.target.value })}
            aria-label="Decided on or before"
          />
        </label>
        <label className="order-sort">
          <span className="order-sort-label">Decision</span>
          <select
            value={values.decision}
            onChange={(e) =>
              onChange({
                decision: e.target.value as ApprovalHistoryFilterValues["decision"],
              })
            }
            aria-label="Filter by decision"
          >
            <option value="">Any decision</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </label>
        <label className="order-sort">
          <span className="order-sort-label">Agent</span>
          <select
            value={values.agentId}
            onChange={(e) => onChange({ agentId: e.target.value })}
            aria-label="Filter by agent"
          >
            <option value="">Any agent</option>
            {agentOptions.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
        <label className="order-sort">
          <span className="order-sort-label">Delegation</span>
          <select
            value={values.delegationId}
            onChange={(e) => onChange({ delegationId: e.target.value })}
            aria-label="Filter by delegation"
          >
            <option value="">Any delegation</option>
            {delegationOptions.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
      </div>

      {hasAnyHistoryFilter(values) && (
        <div className="form-actions">
          <Button variant="ghost" onClick={onReset}>
            Clear filters
          </Button>
        </div>
      )}
    </div>
  );
}
