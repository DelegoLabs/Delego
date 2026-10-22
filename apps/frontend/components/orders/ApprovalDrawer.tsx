"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Button } from "@delegolabs/ui";
import type { Order, RejectionReasonCode } from "@delegolabs/types";
import { formatXlm, isHighValue } from "../../lib/orders";
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
import { DelegationTagBadge } from "../delegations/DelegationTagBadge";
import { useDelegationTags } from "../../hooks/useDelegationTags";
import { useDataSaver } from "../../hooks/useDataSaver";
import { useWallet } from "../../hooks/useWallet";
import { useApprovalNoteCapability } from "../../hooks/useApprovalNoteCapability";
import { submitApproval } from "../../services/approvals";
import { setLocalApprovalNote } from "../../lib/localApprovalNotes";
import { ApprovalNoteField, APPROVAL_NOTE_MAX_LENGTH } from "./ApprovalNoteField";
import { ApprovalNoteDisplay } from "./ApprovalNoteDisplay";
import { BiometricApprovalPrompt } from "./BiometricApprovalPrompt";
import { YieldEscrowToggle } from "../escrows/YieldEscrowToggle";
import { parseStroopsAmount } from "../../lib/yieldEscrow";
import { QuorumApprovalChecklist, type QuorumSignerStatus } from "./QuorumApprovalChecklist";

export interface ApprovalDrawerProps {
  order: Order | null;
  pending?: boolean;
  explainability?: OrderExplainability;
  quorumConfig?: {
    requiredThreshold: number;
    signers: QuorumSignerStatus[];
  };
  onApprove: (id: string) => void | Promise<unknown>;
  onReject: (
    id: string,
    reason?: string,
    reasonCode?: RejectionReasonCode
  ) => void | Promise<unknown>;
  onClose: () => void;
}

export function ApprovalDrawer({
  order,
  pending = false,
  explainability,
  quorumConfig,
  onApprove,
  onReject,
  onClose,
}: ApprovalDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const approveButtonId = order ? `approval-drawer-approve-${order.id}` : undefined;
  const isOpen = order !== null;
  const { announce } = useAnnounce();
  const { getTag } = useDelegationTags();
  const tag = order ? getTag(order.delegationId) : undefined;
  const [note, setNote] = useState("");
  const [yieldEnabled, setYieldEnabled] = useState(false);
  const [yieldTimeoutDays, setYieldTimeoutDays] = useState(7);
  const { address: walletAddress } = useWallet();
  const approvalNoteSupported = useApprovalNoteCapability();

  const [showReasonPicker, setShowReasonPicker] = useState(false);
  const [reasonCode, setReasonCode] = useState<RejectionReasonCode | "">("");
  const [reasonNote, setReasonNote] = useState("");
  const [biometricProof, setBiometricProof] = useState<string | null>(null);

  const [brokenImageProductIds, setBrokenImageProductIds] = useState<Set<string>>(
    () => new Set()
  );

  const { reducedModeActive } = useDataSaver();
  const [revealedImageProductIds, setRevealedImageProductIds] = useState<Set<string>>(
    () => new Set()
  );

  useFocusTrap({ containerRef: panelRef, isActive: isOpen, onEscape: onClose });

  const priceAdvisory = useMemo(
    () =>
      assessPriceAdvisory(
        order?.lineItems ?? [],
        explainability?.priceRangeByProductId
      ),
    [order, explainability]
  );
  const [priceAckd, setPriceAckd] = useState(false);

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
    setNote("");
    setYieldEnabled(false);
    setYieldTimeoutDays(7);
    setBiometricProof(null);
  }, [order?.id]);

  if (!order) return null;

  const handleApprove = async () => {
    const trimmedNote = note.trim();
    try {
      if (trimmedNote && approvalNoteSupported) {
        const res = await submitApproval(order.id, walletAddress ?? "", trimmedNote);
        if (res.error) throw new Error(res.error.message);
      } else {
        await onApprove(order.id);
        if (trimmedNote) setLocalApprovalNote(order.id, trimmedNote);
      }
      announce(
        biometricProof
          ? `Order ${order.id} approved with biometric verification.`
          : `Order ${order.id} approved.`,
        "polite"
      );
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
          <ApprovalAgeBadge createdAt={new Date(order.createdAt)} />
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

        {quorumConfig && (
          <div className="mb-4 border-b border-gray-100 pb-4">
            <QuorumApprovalChecklist
              orderId={order.id}
              requiredThreshold={quorumConfig.requiredThreshold}
              signers={quorumConfig.signers}
              onDisburse={() => handleApprove()}
            />
          </div>
        )}

        {priceAdvisory && (
          <PriceAdvisoryStrip
            advisory={priceAdvisory}
            acknowledged={priceAckd}
            onAcknowledgedChange={handlePriceAckChange}
          />
        )}

        <ApprovalNoteDisplay note={order.approvalNote} orderId={order.id} />

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
              {(order.lineItems ?? []).map((item) => {
                const productId = item.productId ?? "";
                const range = priceRangeByProductId?.[productId];
                const imageUrl = imageUrlByProductId?.[productId];
                const imageBroken = brokenImageProductIds.has(productId);
                const imageRevealed =
                  !reducedModeActive || revealedImageProductIds.has(productId);
                return (
                  <tr key={productId}>
                    <td>
                      <div className="approval-line-item-product">
                        {imageUrl && !imageBroken && imageRevealed ? (
                          <Image
                            src={imageUrl}
                            alt=""
                            width={32}
                            height={32}
                            className="approval-line-item-image"
                            unoptimized
                            onError={() =>
                              setBrokenImageProductIds((prev) => {
                                const next = new Set(prev);
                                next.add(productId);
                                return next;
                              })
                            }
                          />
                        ) : imageUrl && !imageBroken ? (
                          <button
                            type="button"
                            className="approval-line-item-image approval-line-item-image-placeholder"
                            onClick={() =>
                              setRevealedImageProductIds((prev) => {
                                const next = new Set(prev);
                                next.add(productId);
                                return next;
                              })
                            }
                            aria-label={`Load image for ${productId}`}
                            title="Data saver is on — tap to load this image"
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

        <YieldEscrowToggle
          principalStroops={parseStroopsAmount(order.totalStroops)}
          enabled={yieldEnabled}
          timeoutDays={yieldTimeoutDays}
          onEnabledChange={setYieldEnabled}
          onTimeoutDaysChange={setYieldTimeoutDays}
        />

        <ApprovalNoteField
          id={`approval-drawer-note-${order.id}`}
          value={note}
          onChange={setNote}
          disabled={pending}
          variant="textarea"
        />

        {isHighValue(order) && (
          <BiometricApprovalPrompt
            orderId={order.id}
            amount={`${formatXlm(order.totalStroops)} XLM`}
            onSuccess={(signature) => {
              setBiometricProof(signature);
              announce("Biometric verification succeeded.", "polite");
            }}
            onError={(error) => {
              announce(error, "assertive");
            }}
            onPinFallback={() =>
              document.getElementById(approveButtonId ?? "")?.focus()
            }
          />
        )}

        <div className="form-actions">
          <Button
            id={approveButtonId}
            variant="primary"
            onClick={handleApprove}
            disabled={
              pending || approveBlockedByPrice || note.length > APPROVAL_NOTE_MAX_LENGTH
            }
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
