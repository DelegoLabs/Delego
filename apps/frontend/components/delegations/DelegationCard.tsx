"use client";

import { useState } from "react";
import { Amount, Button, Card, StroopsInput } from "@delegolabs/ui";
import type { Delegation, UpdateDelegationInput } from "@delegolabs/types";
import { DelegationQR } from "./DelegationQR";
import { LimitUsageBar } from "./LimitUsageBar";
import { PauseResumeConfirmModal } from "./PauseResumeConfirmModal";
import { MerchantWhitelistPicker } from "./MerchantWhitelistPicker";
import { useCurrency } from "../../hooks/useCurrency";
import { DelegationTagBadge } from "./DelegationTagBadge";
import { DelegationTagPicker } from "./DelegationTagPicker";
import { useDelegationTags } from "../../hooks/useDelegationTags";
import { DelegationStatusChip } from "./DelegationStatusChip";
import { HoverPrefetchLink } from "../layout/HoverPrefetchLink";

export interface DelegationCardProps {
  delegation: Delegation;
  /** True while an optimistic create/update/revoke is in flight for this delegation */
  pending?: boolean;
  onUpdate: (
    id: string,
    input: UpdateDelegationInput
  ) => void | Promise<unknown>;
  onRevoke: (id: string) => void | Promise<unknown>;
  onDuplicate?: (delegation: Delegation) => void;
}

/** Single delegation card with pause/resume, inline policy editing, revoke, duplicate, QR sharing, and tag editing (#600). */
export function DelegationCard({
  delegation,
  pending = false,
  onUpdate,
  onRevoke,
  onDuplicate,
}: DelegationCardProps) {
  const [editing, setEditing] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);

  const { getTag, updateTag } = useDelegationTags();
  const tagRecord = getTag(delegation.id);
  const activeLabel = tagRecord?.label || delegation.label;
  const activeColorTag = tagRecord?.colorTag || delegation.colorTag;

  const [maxPerTransaction, setMaxPerTransaction] = useState(
    delegation.policy.maxPerTransaction
  );

  const [maxTotal, setMaxTotal] = useState(delegation.policy.maxTotal);

  const [allowedMerchants, setAllowedMerchants] = useState<string[]>(
    delegation.policy.allowedMerchants
  );

  const [unrestrictedMerchants, setUnrestrictedMerchants] = useState(
    delegation.policy.allowedMerchants.length === 0
  );

  const [showEmptyWhitelistError, setShowEmptyWhitelistError] = useState(false);
  const [saving, setSaving] = useState(false);

  const { currencyId, rate } = useCurrency();

  const isPaused = delegation.status === "paused";
  const isRevoked = delegation.status === "revoked";
  const isExpired = delegation.status === "expired";
  const isTerminal = isRevoked || isExpired;
  const isPending = pending || delegation.id.startsWith("temp-");

  const handleConfirmPauseToggle = async () => {
    setModalLoading(true);
    try {
      await onUpdate(delegation.id, {
        status: isPaused ? "active" : "paused",
      });
      setShowPauseModal(false);
    } finally {
      setModalLoading(false);
    }
  };

  const handleSavePolicy = async () => {
    if (!unrestrictedMerchants && allowedMerchants.length === 0) {
      setShowEmptyWhitelistError(true);
      return;
    }
    setShowEmptyWhitelistError(false);
    setSaving(true);
    try {
      await onUpdate(delegation.id, {
        policy: {
          maxPerTransaction: maxPerTransaction.toString(),
          maxTotal: maxTotal.toString(),
          allowedMerchants: unrestrictedMerchants ? [] : allowedMerchants,
        },
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Card
        title={activeLabel || delegation.agentId}
        ariaLabel={`Delegation for agent ${delegation.agentId}`}
        style={{
          opacity: isPending ? 0.6 : isPaused ? 0.8 : 1,
          borderColor: isPaused
            ? "var(--color-border-paused, #d1d5db)"
            : undefined,
          backgroundColor: isPaused
            ? "var(--color-bg-paused, #f9fafb)"
            : undefined,
          transition:
            "opacity 0.15s ease-in-out, border-color 0.15s ease-in-out",
        }}
      >
        <div
          className="delegation-card-header"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "0.75rem",
          }}
        >
          <div className="flex items-center gap-2">
            <DelegationStatusChip
              delegation={delegation}
              cap={delegation.policy.maxTotal}
              onResume={() => setShowPauseModal(true)}
              onRenew={
                onDuplicate ? () => onDuplicate(delegation) : undefined
              }
            />

            {(activeLabel || activeColorTag) && (
              <DelegationTagBadge
                label={activeLabel}
                colorTag={activeColorTag}
              />
            )}

            {isPaused && (
              <span
                style={{
                  fontSize: "0.75rem",
                  color: "#6b7280",
                  fontStyle: "italic",
                }}
              >
                (Spends blocked)
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowTagPicker(!showTagPicker)}
              className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"
              title="Edit label & color tag"
            >
              🏷️ Edit tag
            </button>
            {/* Card grid, potentially many per page — prefetch on
                hover/intent only, not viewport (#621). */}
            <HoverPrefetchLink
              href={`/delegations/${delegation.id}`}
              style={{
                fontSize: "0.8125rem",
                color: "var(--color-primary, #2563eb)",
                fontWeight: 500,
              }}
            >
              View detail →
            </HoverPrefetchLink>
          </div>
        </div>

        {showTagPicker && (
          <div className="my-3">
            <DelegationTagPicker
              initialTag={{ label: activeLabel, colorTag: activeColorTag }}
              onSave={(rec) => {
                updateTag(delegation.id, rec);
                setShowTagPicker(false);
              }}
              onCancel={() => setShowTagPicker(false)}
            />
          </div>
        )}

        <div className="delegation-card-meta">
          <div className="delegation-meta-row">
            <span className="delegation-meta-label">Agent ID:</span>
            <code className="delegation-meta-value">{delegation.agentId}</code>
          </div>
          {delegation.walletId && (
            <div className="delegation-meta-row">
              <span className="delegation-meta-label">Wallet:</span>
              <code className="delegation-meta-value">
                {delegation.walletId}
              </code>
            </div>
          )}
          {delegation.permissionLevel && (
            <div className="delegation-meta-row">
              <span className="delegation-meta-label">Permission:</span>
              <span className="delegation-permission-badge">
                {delegation.permissionLevel}
              </span>
            </div>
          )}
        </div>

        <LimitUsageBar
          delegation={delegation}
          currencyId={currencyId}
          rate={rate}
        />

        {editing ? (
          <div className="delegation-card-edit-form">
            <div className="form-group">
              <StroopsInput
                label="Max per transaction"
                value={maxPerTransaction}
                onChange={setMaxPerTransaction}
                disabled={saving}
              />
            </div>
            <div className="form-group">
              <StroopsInput
                label="Max total budget"
                value={maxTotal}
                onChange={setMaxTotal}
                disabled={saving}
              />
            </div>

            <MerchantWhitelistPicker
              allowedMerchants={allowedMerchants}
              unrestricted={unrestrictedMerchants}
              onAllowedMerchantsChange={setAllowedMerchants}
              onUnrestrictedChange={(unrestricted) => {
                setUnrestrictedMerchants(unrestricted);
                if (unrestricted) setShowEmptyWhitelistError(false);
              }}
              showEmptyError={showEmptyWhitelistError}
              disabled={saving}
            />

            <div className="delegation-card-edit-actions">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setEditing(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSavePolicy}
                loading={saving}
              >
                Save Policy
              </Button>
            </div>
          </div>
        ) : (
          <div className="delegation-card-policy-summary">
            <div className="policy-summary-row">
              <span>Per transaction limit:</span>
              <Amount
                stroops={delegation.policy.maxPerTransaction}
                currencyId={currencyId}
                rate={rate}
              />
            </div>
            <div className="policy-summary-row">
              <span>Total budget limit:</span>
              <Amount
                stroops={delegation.policy.maxTotal}
                currencyId={currencyId}
                rate={rate}
              />
            </div>
            <div className="policy-summary-row">
              <span>Merchants:</span>
              <span>
                {delegation.policy.allowedMerchants.length === 0
                  ? "Unrestricted"
                  : `${delegation.policy.allowedMerchants.length} whitelisted`}
              </span>
            </div>
          </div>
        )}

        <div className="delegation-card-footer flex justify-between items-center mt-4">
          <div className="flex gap-2">
            {!isTerminal && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowPauseModal(true)}
                disabled={isPending}
              >
                {isPaused ? "Resume" : "Pause"}
              </Button>
            )}
            {!isTerminal && !editing && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setEditing(true)}
                disabled={isPending}
              >
                Edit Policy
              </Button>
            )}
            {onDuplicate && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onDuplicate(delegation)}
                disabled={isPending}
              >
                Duplicate
              </Button>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowQr(!showQr)}
              ariaLabel="Show QR code"
            >
              {showQr ? "Hide QR" : "Share QR"}
            </Button>

            {!isRevoked && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => onRevoke(delegation.id)}
                disabled={isPending}
              >
                Revoke
              </Button>
            )}
          </div>
        </div>

        {showQr && (
          <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-900 rounded border">
            <DelegationQR delegation={delegation} />
          </div>
        )}
      </Card>

      {showPauseModal && (
        <PauseResumeConfirmModal
          isOpen={showPauseModal}
          isPaused={isPaused}
          agentId={delegation.agentId}
          onConfirm={handleConfirmPauseToggle}
          onCancel={() => setShowPauseModal(false)}
          loading={modalLoading}
        />
      )}
    </>
  );
}
