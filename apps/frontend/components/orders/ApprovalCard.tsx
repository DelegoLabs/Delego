"use client";

import { useState } from "react";
import { useLocale } from "next-intl";
import { Amount, Button, Card } from "@delegolabs/ui";
import type { Order } from "@delegolabs/types";
import { formatDateTimeWithPreferences } from "../../lib/intl";
import { useCurrency } from "../../hooks/useCurrency";
import { useTimeFormat } from "../../hooks/useTimeFormat";
import { useAnnounce } from "../../hooks/useAnnounce";
import { useNetworkMismatch } from "../../hooks/useNetworkMismatch";
import {
  useDemoModeGuard,
  DEMO_MODE_BLOCKED_MESSAGE,
} from "../../hooks/useDemoModeGuard";
import { ApprovalAgeBadge } from "./ApprovalAgeBadge";
import { DelegationTagBadge } from "../delegations/public";
import { useDelegationTags } from "../../hooks/useDelegationTags";
import { useFeatureFlag } from "../../lib/featureFlags";
import { useDualControlCapability } from "../../hooks/useDualControlCapability";
import { useWallet } from "../../hooks/useWallet";
import { DualControlGuard } from "./DualControlGuard";
import { submitApproval } from "../../services/approvals";

export interface ApprovalCardProps {
  order: Order;
  /** True while an approve/reject request for this order is in flight. */
  pending?: boolean;
  /** True when a mutation for this order is queued offline awaiting reconnect replay (#618). */
  pendingOffline?: boolean;
  onApprove: (id: string) => void | Promise<unknown>;
  onReject: (id: string, reason?: string) => void | Promise<unknown>;
  /** Called with the fresh order after a dual-control approve/countersign settles (#574), so the caller can refresh its list. */
  onDualControlUpdate?: (order: Order) => void;
}

/**
 * Review card for a single high-value order awaiting approval. Shows the line
 * items and total, and gates rejection behind an inline reason prompt.
 */
export function ApprovalCard({
  order,
  pending = false,
  pendingOffline = false,
  onApprove,
  onReject,
  onDualControlUpdate,
}: ApprovalCardProps) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  const { isMismatched } = useNetworkMismatch();
  const locale = useLocale();
  const { preferences: timeFormatPreferences } = useTimeFormat();
  const { currencyId, rate } = useCurrency();
  const { announce } = useAnnounce();
  const { isDemoMode, guard } = useDemoModeGuard();
  const { getTag } = useDelegationTags();
  const tag = getTag(order.delegationId);

  // Dual-control approvals (#574): feature-off (or the API not advertising
  // support) leaves every branch below unreached and behavior identical to
  // the pre-existing single-approval flow.
  const dualControlFlagEnabled = useFeatureFlag("DUAL_CONTROL_APPROVALS");
  const dualControlCapable = useDualControlCapability();
  const { address: walletAddress } = useWallet();
  const dualControlActive =
    dualControlFlagEnabled && dualControlCapable && order.dualControl?.required === true;
  const [dcSubmitting, setDcSubmitting] = useState(false);

  const disabled = pending || dcSubmitting || isMismatched || isDemoMode;

  const actionTitle = isDemoMode
    ? DEMO_MODE_BLOCKED_MESSAGE
    : isMismatched
      ? "Cannot execute action while wallet and app network are mismatched"
      : undefined;

  const handleApprove = guard(async () => {
    try {
      await onApprove(order.id);
      announce(`Order ${order.id} approved.`, "polite");
    } catch {
      announce(`Failed to approve order ${order.id}.`, "assertive");
    }
  });

  const handleDualControlApprove = guard(async () => {
    setDcSubmitting(true);
    try {
      const res = await submitApproval(order.id, walletAddress ?? "");
      if (res.error) throw new Error(res.error.message);
      announce(
        res.data?.dualControl?.status === "completed"
          ? `Order ${order.id} approved.`
          : `Order ${order.id} approval recorded — waiting for a countersignature.`,
        "polite"
      );
      if (res.data) onDualControlUpdate?.(res.data);
    } catch {
      announce(`Failed to approve order ${order.id}.`, "assertive");
    } finally {
      setDcSubmitting(false);
    }
  });

  const handleConfirmReject = guard(async () => {
    try {
      await onReject(order.id, reason.trim() || undefined);
      announce(`Order ${order.id} rejected.`, "polite");
    } catch {
      announce(`Failed to reject order ${order.id}.`, "assertive");
    }
  });

  return (
    <DualControlGuard order={order} currentUserId={walletAddress ?? ""} active={dualControlActive}>
      {({ blocked: dcBlocked, reason: dcReason, awaitingCountersign }) => (
        <Card
          title={`Order #${order.id}`}
          ariaLabel={`Approval request for order ${order.id}`}
          style={{ opacity: pending ? 0.6 : 1 }}
        >
          <div className="approval-card-badges">
            <span className="status-badge order-status-pending_approval">
              Pending approval
            </span>

            {awaitingCountersign && (
              <span
                className="status-badge"
                data-testid="dual-control-tag"
                title={dcBlocked ? dcReason : "A first approval is on record for this order"}
                style={{
                  background: "var(--color-warning-bg, #fffbeb)",
                  color: "var(--color-warning-text, #92400e)",
                  border: "1px solid var(--color-warning-border, #fde68a)",
                }}
              >
                {dcBlocked ? "Waiting for countersignature" : "Ready to countersign"}
              </span>
            )}

            {pendingOffline && (
              <span
                className="status-badge"
                style={{
                  background: "var(--color-warning-bg)",
                  color: "var(--color-warning-text)",
                  border: "1px solid var(--color-warning-border)",
                }}
                title="Queued offline — will sync automatically upon reconnect"
              >
                ⚡ Pending offline
              </span>
            )}

            <ApprovalAgeBadge createdAt={order.createdAt} />

            <span
              className="approval-flag"
              title="Exceeds the high-value threshold"
            >
              ⚠ High value
            </span>
          </div>

          <dl className="wallet-detail-list">
            <div className="wallet-detail-row">
              <dt>Merchant</dt>
              <dd>{(order as any).merchantId || order.merchantName}</dd>
            </div>

            <div className="wallet-detail-row">
              <dt>Delegation</dt>
              <dd className="flex items-center gap-2">
                <span>{order.delegationId}</span>
                <DelegationTagBadge label={tag?.label} colorTag={tag?.colorTag} />
              </dd>
            </div>

            <div className="wallet-detail-row">
              <dt>Requested</dt>
              <dd>
                {formatDateTimeWithPreferences(
                  order.createdAt,
                  locale,
                  timeFormatPreferences
                )}
              </dd>
            </div>
          </dl>

          <div className="approval-line-items">
            <table className="comparison-table">
              <thead>
                <tr>
                  <th scope="col">Product</th>
                  <th scope="col">Qty</th>
                  <th scope="col">Unit Price</th>
                  <th scope="col">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {(order.items || (order as any).lineItems || []).map(
                  (item: any, idx: number) => (
                    <tr key={item.productId || item.name || idx}>
                      <td>{item.productId || item.name}</td>
                      <td>{item.quantity}</td>
                      <td>
                        <Amount
                          stroops={item.unitPriceStroops || item.price}
                          currencyId={currencyId}
                          rate={rate}
                        />
                      </td>
                      <td>
                        <Amount
                          stroops={
                            (item.unitPriceStroops || item.price) *
                            BigInt(item.quantity)
                          }
                          currencyId={currencyId}
                          rate={rate}
                        />
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>

          <div className="approval-card-total">
            <span>Total:</span>
            <strong className="approval-total-amount">
              <Amount stroops={order.amount} currencyId={currencyId} rate={rate} />
            </strong>
          </div>

          {rejecting ? (
            <div className="approval-reject-form">
              <label htmlFor={`reject-reason-${order.id}`} className="sr-only">
                Reason for rejection (optional)
              </label>
              <input
                id={`reject-reason-${order.id}`}
                type="text"
                className="order-search"
                placeholder="Reason for rejection (optional)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={pending}
              />
              <div className="approval-reject-actions">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setRejecting(false)}
                  disabled={pending}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleConfirmReject}
                  disabled={disabled}
                  loading={pending}
                  title={actionTitle}
                >
                  Confirm Reject
                </Button>
              </div>
            </div>
          ) : (
            <div className="approval-card-actions">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setRejecting(true)}
                disabled={disabled}
                title={actionTitle}
              >
                Reject
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={dualControlActive ? handleDualControlApprove : handleApprove}
                disabled={disabled || dcBlocked}
                loading={pending || dcSubmitting}
                title={dcBlocked ? dcReason : actionTitle}
              >
                Approve & Pay
              </Button>
            </div>
          )}
        </Card>
      )}
    </DualControlGuard>
  );
}
