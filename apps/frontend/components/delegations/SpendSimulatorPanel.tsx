"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, Card, StroopsInput } from "@delego/ui";
import { useSpendSimulator } from "../../hooks/useSpendSimulator";
import type { SpendDenialReason } from "../../lib/spendSimulator";
import {
  DENIAL_REASON_LABELS,
  getRemediationLink,
} from "../../lib/spendSimulator";
import { formatXlm } from "../../lib/orders";

export interface SpendSimulatorPanelProps {
  delegationId: string;
}

/**
 * Spend Simulator Panel — lives on the delegation detail page.
 *
 * Lets the user ask "if this delegation buys a 30 XLM item right now, what
 * happens?" by calling the gateway's read-only SpendPreview dry-run. No
 * mutation call sites are touched: the hook and this panel are intentionally
 * structured so they cannot import or call any state-changing API method.
 */
export function SpendSimulatorPanel({ delegationId }: SpendSimulatorPanelProps) {
  const { state, simulate, reset } = useSpendSimulator();

  const [amountStroops, setAmountStroops] = useState<bigint>(0n);
  const [merchantId, setMerchantId] = useState("");

  const handleSimulate = () => {
    if (amountStroops <= 0n) return;
    simulate({
      delegationId,
      amountStroops,
      merchantId: merchantId.trim() || undefined,
    });
  };

  return (
    <Card title="Spend simulator" ariaLabel="Spend simulator panel">
      <p className="stat-label" style={{ marginBottom: "1rem" }}>
        See what would happen if this delegation spent a given amount right now
        — no real transaction is created.
      </p>

      {/* ── Inputs ── */}
      <div className="settings-section">
        <div>
          <label
            htmlFor="simulator-amount"
            style={{ display: "block", fontWeight: 500, marginBottom: "0.25rem" }}
          >
            Amount
          </label>
          <StroopsInput
            id="simulator-amount"
            value={amountStroops}
            onChange={setAmountStroops}
            disabled={state.status === "loading"}
            style={{ width: "100%" }}
          />
        </div>

        <div>
          <label
            htmlFor="simulator-merchant"
            style={{ display: "block", fontWeight: 500, marginBottom: "0.25rem" }}
          >
            Merchant ID
            <span
              className="stat-label"
              style={{ fontWeight: 400, marginLeft: "0.5rem" }}
            >
              (optional)
            </span>
          </label>
          <input
            id="simulator-merchant"
            type="text"
            value={merchantId}
            onChange={(e) => setMerchantId(e.target.value)}
            disabled={state.status === "loading"}
            placeholder="merchant-xyz"
            style={{
              width: "100%",
              padding: "0.5rem",
              borderRadius: "0.375rem",
              border: "1px solid #d1d5db",
              boxSizing: "border-box",
            }}
          />
        </div>

        <div className="form-actions">
          <Button
            variant="primary"
            onClick={handleSimulate}
            disabled={state.status === "loading" || amountStroops <= 0n}
            ariaLabel="Run spend simulation"
          >
            {state.status === "loading" ? "Simulating…" : "Simulate"}
          </Button>
          {state.status !== "idle" && state.status !== "loading" && (
            <Button variant="ghost" onClick={reset}>
              Reset
            </Button>
          )}
        </div>
      </div>

      {/* ── States ── */}
      {state.status === "loading" && (
        <SimulatorLoadingState />
      )}

      {state.status === "error" && (
        <SimulatorErrorState message={state.message} onRetry={handleSimulate} />
      )}

      {state.status === "result" && (
        <SimulatorResultCard
          result={state.result}
          amountStroops={amountStroops}
          delegationId={delegationId}
        />
      )}

      {state.status === "idle" && <SimulatorEmptyState />}
    </Card>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SimulatorEmptyState() {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "1.5rem",
        color: "#9ca3af",
        fontSize: "0.875rem",
      }}
      aria-label="No simulation run yet"
    >
      Enter an amount above and click <strong>Simulate</strong> to preview what
      would happen.
    </div>
  );
}

function SimulatorLoadingState() {
  return (
    <div
      className="card skeleton"
      aria-busy="true"
      aria-label="Running simulation"
      style={{ marginTop: "1rem" }}
    >
      <div className="skeleton-title" />
      <div className="skeleton-text" />
      <div className="skeleton-text" />
    </div>
  );
}

function SimulatorErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      className="settings-status error"
      role="alert"
      style={{ marginTop: "1rem", display: "flex", alignItems: "center", gap: "0.75rem" }}
    >
      <span>{message}</span>
      <Button variant="ghost" onClick={onRetry} style={{ flexShrink: 0 }}>
        Retry
      </Button>
    </div>
  );
}

interface SimulatorResultCardProps {
  result: import("../../lib/spendSimulator").SpendPreviewResult;
  amountStroops: bigint;
  delegationId: string;
}

function SimulatorResultCard({
  result,
  amountStroops,
  delegationId,
}: SimulatorResultCardProps) {
  const remediation =
    !result.allowed && result.bindingConstraint
      ? getRemediationLink(result.bindingConstraint, delegationId)
      : null;

  return (
    <div
      role="region"
      aria-label="Simulation result"
      style={{
        marginTop: "1rem",
        borderRadius: "0.5rem",
        border: `2px solid ${result.allowed ? "#16a34a" : "#dc2626"}`,
        padding: "1rem",
        background: result.allowed ? "#f0fdf4" : "#fef2f2",
      }}
    >
      {/* ── Verdict ── */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
        <span
          style={{
            fontSize: "1.25rem",
            lineHeight: 1,
          }}
          aria-hidden="true"
        >
          {result.allowed ? "✅" : "🚫"}
        </span>
        <strong style={{ fontSize: "1rem", color: result.allowed ? "#15803d" : "#b91c1c" }}>
          {result.allowed
            ? `${formatXlm(amountStroops)} XLM spend would be allowed`
            : `${formatXlm(amountStroops)} XLM spend would be denied`}
        </strong>
      </div>

      {/* ── Details ── */}
      <dl className="wallet-detail-list">
        {result.remainingAfterStroops != null && (
          <div className="wallet-detail-row">
            <dt>Remaining after</dt>
            <dd>{formatXlm(result.remainingAfterStroops)} XLM</dd>
          </div>
        )}
        {result.bindingConstraint && (
          <div className="wallet-detail-row">
            <dt>Binding constraint</dt>
            <dd>
              <ConstraintPill reason={result.bindingConstraint} />
            </dd>
          </div>
        )}
      </dl>

      {/* ── Remediation link (denied only) ── */}
      {!result.allowed && remediation && (
        <div style={{ marginTop: "0.75rem" }}>
          <Link
            href={remediation.href}
            style={{
              color: "#2563eb",
              textDecoration: "underline",
              fontSize: "0.875rem",
              fontWeight: 500,
            }}
          >
            {remediation.label} →
          </Link>
        </div>
      )}
    </div>
  );
}

function ConstraintPill({ reason }: { reason: SpendDenialReason }) {
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: "0.75rem",
        fontWeight: 600,
        padding: "0.125rem 0.5rem",
        borderRadius: "9999px",
        background: "#fee2e2",
        color: "#991b1b",
      }}
    >
      {DENIAL_REASON_LABELS[reason]}
    </span>
  );
}
