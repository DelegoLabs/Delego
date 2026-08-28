"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Button } from "@delegolabs/ui";
import type { Order, RejectionReasonCode } from "@delegolabs/types";
import { formatXlm } from "../../lib/orders";
import { REJECTION_REASON_OPTIONS } from "../../lib/rejectionReasons";
import type { OrderExplainability } from "../../lib/approvalExplainability";
import {
  assessPriceAdvisory,
  readPriceAdvisoryAck,
  writePriceAdvisoryAck,
} from "../../lib/priceAdvisory";
import { ApprovalAgeBadge } from "./ApprovalAgeBadge";
import { PriceAdvisoryStrip } from "./PriceAdvisoryStrip";
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
  onReject: (
    id: string,
    reason?: string,
    /** Structured reason code (#567); optional for callers that don't collect one. */
    reasonCode?: RejectionReasonCode
  ) => void | Promise<unknown>;
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

  const [showReasonPicker, setShowReasonPicker] = useState(false);
  const [reasonCode, setReasonCode] = useState<RejectionReasonCode | "">("");
  const [reasonNote, setReasonNote] = useState("");

  // Tracks which line-item images failed to load (#622) — merchant image
  // URLs are arbitrary, unwhitelisted hosts (see OrderExplainability's
  // doc comment), so a single unreachable/broken CDN must not break the
  // rest of the list. Keyed by productId since this is a per-row concern.
  const [brokenImageProductIds, setBrokenImageProductIds] = useState<Set<string>>(
    () => new Set()
  );

  useFocusTrap(panelRef, isOpen);

  // Price advisory (#571): summarize the payload's comparable-range hints, if
  // any, into one non-blocking strip. Never fabricated — `null` when the
  // payload carries no hints.
  const priceAdvisory = useMemo(
    () =>
      assessPriceAdvisory(
        order?.lineItems ?? [],
        explainability?.priceRangeByProductId
      ),
    [order, explainability]
  );
  const [priceAckd, setPriceAckd] = useState(false);
  // Rehydrate the per-session acknowledgement whenever a new order opens.
  useEffect(() => {
    if (order) setPriceAckd(readPriceAdvisoryAck());
  }, [order]);
  const handlePriceAckChange = (next: boolean) => {
    setPriceAckd(next);
    if (next) writePriceAdvisoryAck();
  };
  const approveBlockedByPrice =
    priceAdvisory?.level === "above" && !priceAckd;

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
      await onReject(order.id, reasonNote.trim() || undefined, reasonCode || undefined);
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

        {priceAdvisory && (
          <PriceAdvisoryStrip
            advisory={priceAdvisory}
            acknowledged={priceAckd}
            onAcknowledgedChange={handlePriceAckChange}
          />
        )}

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
                const productId = item.productId ?? "";
                const range = priceRangeByProductId?.[productId];
                const imageUrl = imageUrlByProductId?.[productId];
                const imageBroken = brokenImageProductIds.has(productId);
                return (
                  <tr key={productId}>
                    <td>
                      <div className="approval-line-item-product">
                        {imageUrl && !imageBroken ? (
                          <Image
                            src={imageUrl}
                            alt=""
                            width={32}
                            height={32}
                            className="approval-line-item-image"
                            // Item images come from arbitrary, unwhitelisted
                            // merchant sources (#622) — next/image's
                            // remotePatterns optimizer can't cover a host
                            // list that isn't known ahead of time, so this
                            // is unoptimized on purpose. We still get
                            // explicit dimensions (zero CLS contribution)
                            // and onError, which is the actual point here.
                            unoptimized
                            onError={() =>
                              setBrokenImageProductIds((prev) => {
                                const next = new Set(prev);
                                next.add(productId);
                                return next;
                              })
                            }
                          />
                        ) : imageUrl ? (
                          <div
                            className="approval-line-item-image approval-line-item-image-fallback"
                            role="img"
                            aria-label={`Image unavailable for ${productId}`}
                          />
                        ) : null}
                        <span>{productId}</span>
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

        {showReasonPicker ? (
          <div className="approval-reject-reason-picker">
            <label htmlFor="drawer-reject-reason-code" className="sr-only">
              Reason for rejection
            </label>
            <select
              id="drawer-reject-reason-code"
              className="order-search"
              value={reasonCode}
              onChange={(e) => setReasonCode(e.target.value as RejectionReasonCode | "")}
              disabled={pending}
            >
              <option value="">Select a reason…</option>
              {REJECTION_REASON_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <label htmlFor="drawer-reject-reason-note" className="sr-only">
              Additional detail (optional)
            </label>
            <input
              id="drawer-reject-reason-note"
              type="text"
              className="order-search"
              placeholder="Additional detail (optional)"
              value={reasonNote}
              onChange={(e) => setReasonNote(e.target.value)}
              disabled={pending}
            />
          </div>
        ) : (
          <button
            type="button"
            className="approval-reject-add-reason"
            onClick={() => setShowReasonPicker(true)}
            disabled={pending}
          >
            + Add reason
          </button>
        )}

        <div className="form-actions">
          <Button
            variant="primary"
            onClick={handleApprove}
            disabled={pending || approveBlockedByPrice}
          >
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
