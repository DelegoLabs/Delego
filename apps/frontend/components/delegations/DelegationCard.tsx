"use client";

import { useState } from "react";
import { Button, Card, StroopsInput } from "@delego/ui";
import type { Delegation, UpdateDelegationInput } from "@delego/types";
import { DelegationQR } from "./DelegationQR";

export interface DelegationCardProps {
  delegation: Delegation;
  /** True while an optimistic create/update/revoke is in flight for this delegation */
  pending?: boolean;
  onUpdate: (id: string, input: UpdateDelegationInput) => void | Promise<unknown>;
  onRevoke: (id: string) => void | Promise<unknown>;
}

function formatXlm(stroops: bigint): string {
  return (Number(stroops) / 10_000_000).toFixed(2);
}

/** Single delegation card with pause/resume, inline policy editing, revoke, and QR sharing. */
export function DelegationCard({
  delegation,
  pending = false,
  onUpdate,
  onRevoke,
}: DelegationCardProps) {
  const [editing, setEditing] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [maxPerTransaction, setMaxPerTransaction] = useState(
    delegation.policy.maxPerTransaction
  );
  const [maxTotal, setMaxTotal] = useState(delegation.policy.maxTotal);
  const [allowedMerchants, setAllowedMerchants] = useState(
    delegation.policy.allowedMerchants.join(", ")
  );
  const [saving, setSaving] = useState(false);

  const isRevoked = delegation.status === "revoked";
  const isExpired = delegation.status === "expired";
  const isTerminal = isRevoked || isExpired;
  const isPending = pending || delegation.id.startsWith("temp-");

  const handleToggleStatus = () => {
    const nextStatus = delegation.status === "active" ? "paused" : "active";
    onUpdate(delegation.id, { status: nextStatus });
  };

  const handleRevoke = () => {
    if (window.confirm(`Revoke delegation "${delegation.agentId}"? This cannot be undone.`)) {
      onRevoke(delegation.id);
    }
  };

  const handleSavePolicy = async () => {
    setSaving(true);
    try {
      await onUpdate(delegation.id, {
        policy: {
          maxPerTransaction: maxPerTransaction.toString(),
          maxTotal: maxTotal.toString(),
          allowedMerchants: allowedMerchants
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        },
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      title={delegation.agentId}
      ariaLabel={`Delegation for agent ${delegation.agentId}`}
      style={{ opacity: isPending ? 0.6 : 1, transition: "opacity 0.15s ease-in-out" }}
    >
      <div className="delegation-card-header">
        <span className={`status-badge status-${delegation.status}`}>
          {delegation.status}
        </span>
        {isPending && <span className="delegation-pending-hint">Saving…</span>}
      </div>

      {!editing ? (
        <dl className="wallet-detail-list">
          <div className="wallet-detail-row">
            <dt>Max / transaction</dt>
            <dd>{formatXlm(delegation.policy.maxPerTransaction)} XLM</dd>
          </div>
          <div className="wallet-detail-row">
            <dt>Total limit</dt>
            <dd>{formatXlm(delegation.policy.maxTotal)} XLM</dd>
          </div>
          <div className="wallet-detail-row">
            <dt>Merchants</dt>
            <dd>
              {delegation.policy.allowedMerchants.length > 0
                ? delegation.policy.allowedMerchants.join(", ")
                : "All merchants"}
            </dd>
          </div>
          <div className="wallet-detail-row">
            <dt>Expires</dt>
            <dd>{delegation.policy.expiresAt ?? "Never"}</dd>
          </div>
        </dl>
      ) : (
        <div className="settings-section">
          <div>
            <label style={{ display: "block", fontSize: "0.875rem", marginBottom: "0.25rem" }}>
              Max per transaction
            </label>
            <StroopsInput
              value={maxPerTransaction}
              onChange={setMaxPerTransaction}
              style={{ width: "100%" }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "0.875rem", marginBottom: "0.25rem" }}>
              Max total
            </label>
            <StroopsInput
              value={maxTotal}
              onChange={setMaxTotal}
              style={{ width: "100%" }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "0.875rem", marginBottom: "0.25rem" }}>
              Allowed merchants (comma-separated)
            </label>
            <input
              value={allowedMerchants}
              onChange={(e) => setAllowedMerchants(e.target.value)}
              style={{ width: "100%", padding: "0.5rem", borderRadius: "0.375rem" }}
            />
          </div>
        </div>
      )}

      <div className="form-actions delegation-actions">
        {!isTerminal && !editing && (
          <>
            <Button variant="secondary" onClick={handleToggleStatus} disabled={isPending}>
              {delegation.status === "active" ? "Pause" : "Resume"}
            </Button>
            <Button variant="secondary" onClick={() => setEditing(true)} disabled={isPending}>
              Edit
            </Button>
            <Button variant="ghost" onClick={() => setShowQr((v) => !v)}>
              {showQr ? "Hide QR" : "Share QR"}
            </Button>
            <Button variant="ghost" onClick={handleRevoke} disabled={isPending}>
              Revoke
            </Button>
          </>
        )}
        {editing && (
          <>
            <Button variant="primary" onClick={handleSavePolicy} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </Button>
          </>
        )}
      </div>

      {showQr && !editing && (
        <DelegationQR
          delegationId={delegation.id}
          userId={delegation.userId}
          agentId={delegation.agentId}
        />
      )}
    </Card>
  );
}
