"use client";

import { useEffect, useRef } from "react";
import { Button } from "@delegolabs/ui";
import type { Order } from "@delegolabs/types";
import { formatXlm } from "../../lib/orders";
import type { OrderExplainability } from "../../lib/approvalExplainability";
import { ApprovalAgeBadge } from "./ApprovalAgeBadge";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useAnnounce } from "../../hooks/useAnnounce";
import { DelegationTagBadge } from "../delegations/public";
import { useDelegationTags } from "../../hooks/useDelegationTags";

export interface ApprovalDrawerProps {
  order: Order | null;
  pending?: boolean;
  /**
   * Agent explainability data for `order` (item imagery, price hints, reasoning,
   * evidence links, delegation context). Optional — sections with no data
   * collapse cleanly. Keyed by the caller to the currently-open order.
   */
  explainability?: OrderExplainability;
  onApprove: (id: string) => void | Promise<unknown>;
  onReject: (id: string, reason?: string) => void | Promise<unknown>;
  onClose: () => void;
}

/**
 * Slide-over detail panel for a single approval — opened via the "Enter" hotkey
 * (FE-023) or by clicking a background approval notification. Includes the
 * agent explainability panel (#530): reasoning, price-range hints, evidence
 * links, and delegation context, alongside the standard line-item breakdown.
 */
export function ApprovalDrawer({
  order,
  pending = false,
  explainability,
  onApprove,
  onReject,
  onClose,
}: ApprovalDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const isOpen = order !== null;
  const { announce } = useAnnounce();
  const { getTag } = useDelegationTags();
  const tag = order ? getTag(order.delegationId) : undefined;

  useFocusTrap(panelRef, isOpen);

  useEffect(() => {
    if (!order) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [order, onClose]);

  if (!order) return null;

  const handleApprove = async () => {
    try {
      await onApprove(order.id);
      announce(`Order ${order.id} approved.`, "polite");
      onClose();
    } catch {
      announce(`Failed to approve order ${order.id}.`, "assertive");
    }
  };

  const handleReject = async () => {
    try {
      await onReject(order.id);
      announce(`Order ${order.id} rejected.`, "polite");
      onClose();
    } catch {
      announce(`Failed to reject order ${order.id}.`, "assertive");
    }
  };

  const priceRangeByProductId = explainability?.priceRangeByProductId;
  const imageUrlByProductId = explainability?.imageUrlByProductId;
  const evidenceLinks = explainability?.evidenceLinks;
  const delegationContext = explainability?.delegationContext;

  return (
    <div className="approval-drawer-overlay" onClick={onClose}>
      <div
        ref={panelRef}
        className="approval-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`Order ${order.id} details`}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="approval-drawer-header">
          <h2>Order {order.id}</h2>
          <ApprovalAgeBadge createdAt={order.createdAt} />
          <button
            type="button"
            aria-label="Close"
            className="approval-drawer-close"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <dl className="wallet-detail-list">
          <div className="wallet-detail-row">
            <dt>Merchant</dt>
            <dd>{order.merchantId}</dd>
          </div>
          <div className="wallet-detail-row">
            <dt>Delegation</dt>
            <dd className="flex items-center gap-2">
              <span>{order.delegationId}</span>
              <DelegationTagBadge label={tag?.label} colorTag={tag?.colorTag} />
            </dd>
          </div>
          {delegationContext && (
            <div className="wallet-detail-row">
              <dt>Remaining limit</dt>
              <dd>{formatXlm(delegationContext.remainingLimitStroops)} XLM</dd>
            </div>
          )}
        </dl>

        {order.dualControl?.required && (
          <section
            className="approval-explainability-section"
            aria-label="Dual-control approval"
          >
            <h3>Dual-control approval</h3>
            {order.dualControl.status === "completed" &&
            order.dualControl.firstApproval &&
            order.dualControl.secondApproval ? (
              <dl className="wallet-detail-list">
                <div className="wallet-detail-row">
                  <dt>First approver</dt>
                  <dd>
                    {order.dualControl.firstApproval.approverAddress ??
                      order.dualControl.firstApproval.approverId}{" "}
                    · {new Date(order.dualControl.firstApproval.timestamp).toLocaleString()}
                  </dd>
                </div>
                <div className="wallet-detail-row">
                  <dt>Countersigned by</dt>
                  <dd>
                    {order.dualControl.secondApproval.approverAddress ??
                      order.dualControl.secondApproval.approverId}{" "}
                    · {new Date(order.dualControl.secondApproval.timestamp).toLocaleString()}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="approval-reasoning-text" data-testid="dual-control-drawer-notice">
                {order.dualControl.status === "awaiting_countersign"
                  ? "Waiting for countersignature — a first approval is on record for this order."
                  : "This order will require a second signer to approve."}
              </p>
            )}
          </section>
        )}

        {explainability?.reasoning && (
          <section
            className="approval-explainability-section"
            aria-label="Agent reasoning"
          >
            <h3>Why the agent chose this</h3>
            <p className="approval-reasoning-text">
              {explainability.reasoning}
            </p>
          </section>
        )}

        <div className="approval-line-items">
          <table className="comparison-table">
            <thead>
              <tr>
                <th scope="col">Product</th>
                <th scope="col">Qty</th>
                <th scope="col">Unit</th>
                <th scope="col">Subtotal</th>
                {priceRangeByProductId && <th scope="col">Typical range</th>}
              </tr>
            </thead>
            <tbody>
              {order.lineItems.map((item) => {
                const range = priceRangeByProductId?.[item.productId];
                const imageUrl = imageUrlByProductId?.[item.productId];
                return (
                  <tr key={item.productId}>
                    <td>
                      <div className="approval-line-item-product">
                        {imageUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={imageUrl}
                            alt=""
                            className="approval-line-item-image"
                          />
                        )}
                        <span>{item.productId}</span>
                      </div>
                    </td>
                    <td>{item.quantity}</td>
                    <td>{formatXlm(item.unitPriceStroops)} XLM</td>
                    <td>
                      {formatXlm(item.unitPriceStroops * BigInt(item.quantity))}{" "}
                      XLM
                    </td>
                    {priceRangeByProductId && (
                      <td>
                        {range ? (
                          <span
                            className={
                              item.unitPriceStroops > range.highStroops
                                ? "approval-price-hint approval-price-hint-above"
                                : "approval-price-hint"
                            }
                            title={range.label}
                          >
                            {formatXlm(range.lowStroops)}–
                            {formatXlm(range.highStroops)} XLM
                          </span>
                        ) : (
                          <span className="approval-price-hint approval-price-hint-unknown">
                            —
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="approval-total">
          <span>Total</span>
          <strong>{formatXlm(order.totalStroops)} XLM</strong>
        </div>

        {evidenceLinks && evidenceLinks.length > 0 && (
          <section
            className="approval-explainability-section"
            aria-label="Decision evidence"
          >
            <h3>Decision evidence</h3>
            <ul className="approval-evidence-list">
              {evidenceLinks.map((link) => (
                <li key={link.url}>
                  <a href={link.url} target="_blank" rel="noopener noreferrer">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="form-actions">
          <Button variant="primary" onClick={handleApprove} disabled={pending}>
            Approve
          </Button>
          <Button variant="ghost" onClick={handleReject} disabled={pending}>
            Reject
          </Button>
        </div>
      </div>
    </div>
  );
}
