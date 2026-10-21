"use client";

/**
 * Multi-merchant checkout flow with sequential escrow signing (#918).
 *
 * When the cart contains items from N merchants, this component:
 *   1. Partitions the cart into per-merchant groups via partitionCartByMerchant.
 *   2. Walks the buyer through signing an independent escrow transaction for
 *      each partition in order.
 *   3. Shows a clear progress indicator so the buyer knows which escrow they
 *      are authorising and how many remain.
 *   4. Allows single-merchant packages to be checked out individually.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  allConfirmed,
  partitionCartByMerchant,
  type EscrowStatus,
  type MerchantCartPartition,
} from "../../lib/cartPartition";
import { useCart } from "../../hooks/useCart";
import type { AppliedPromoCode } from "../../lib/promoCode";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STROOPS_PER_XLM = 10_000_000n;

function formatStroops(stroops: string): string {
  try {
    const xlm = Number(BigInt(stroops)) / Number(STROOPS_PER_XLM);
    return `${xlm.toLocaleString(undefined, { maximumFractionDigits: 7 })} XLM`;
  } catch {
    return stroops;
  }
}

const STATUS_LABEL: Record<EscrowStatus, string> = {
  pending: "Pending",
  authorizing: "Awaiting signature…",
  confirmed: "Confirmed",
  failed: "Failed",
};

const STATUS_COLOR: Record<EscrowStatus, string> = {
  pending: "#6b7280",
  authorizing: "#d97706",
  confirmed: "#16a34a",
  failed: "#dc2626",
};

// ---------------------------------------------------------------------------
// Step indicator
// ---------------------------------------------------------------------------

interface StepIndicatorProps {
  partitions: MerchantCartPartition[];
  activeIndex: number;
}

function StepIndicator({ partitions, activeIndex }: StepIndicatorProps) {
  return (
    <nav aria-label="Checkout progress" style={{ marginBottom: "1.5rem" }}>
      <ol
        style={{
          display: "flex",
          gap: "0",
          listStyle: "none",
          margin: 0,
          padding: 0,
          alignItems: "center",
        }}
      >
        {partitions.map((partition, idx) => {
          const isDone = partition.escrowStatus === "confirmed";
          const isActive = idx === activeIndex;
          const isFailed = partition.escrowStatus === "failed";

          return (
            <li
              key={partition.merchantId}
              style={{ display: "flex", alignItems: "center", flex: idx < partitions.length - 1 ? "1" : "none" }}
            >
              {/* Circle */}
              <div
                aria-current={isActive ? "step" : undefined}
                title={`Step ${idx + 1}: ${partition.merchantName}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "2rem",
                  height: "2rem",
                  borderRadius: "9999px",
                  fontWeight: 700,
                  fontSize: "0.875rem",
                  flexShrink: 0,
                  border: `2px solid ${
                    isFailed ? "#dc2626" : isDone ? "#16a34a" : isActive ? "#2563eb" : "#d1d5db"
                  }`,
                  background: isFailed
                    ? "#fee2e2"
                    : isDone
                    ? "#dcfce7"
                    : isActive
                    ? "#eff6ff"
                    : "#f9fafb",
                  color: isFailed
                    ? "#dc2626"
                    : isDone
                    ? "#16a34a"
                    : isActive
                    ? "#2563eb"
                    : "#9ca3af",
                }}
              >
                {isDone ? "✓" : isFailed ? "✕" : idx + 1}
              </div>

              {/* Connector line */}
              {idx < partitions.length - 1 && (
                <div
                  aria-hidden="true"
                  style={{
                    flex: 1,
                    height: "2px",
                    background: isDone ? "#16a34a" : "#e5e7eb",
                    margin: "0 0.25rem",
                  }}
                />
              )}
            </li>
          );
        })}
      </ol>

      {/* Active step label */}
      {activeIndex >= 0 && activeIndex < partitions.length && (
        <p
          aria-live="polite"
          style={{
            marginTop: "0.5rem",
            fontSize: "0.8125rem",
            color: "#374151",
            textAlign: "center",
          }}
        >
          Step {activeIndex + 1} of {partitions.length}:{" "}
          <strong>{partitions[activeIndex].merchantName}</strong>
        </p>
      )}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Single partition card
// ---------------------------------------------------------------------------

interface PartitionCardProps {
  partition: MerchantCartPartition;
  index: number;
  isActive: boolean;
  onAuthorize: (index: number) => void;
  onRetry: (index: number) => void;
  disabled: boolean;
}

function PartitionCard({
  partition,
  index,
  isActive,
  onAuthorize,
  onRetry,
  disabled,
}: PartitionCardProps) {
  const { escrowStatus } = partition;
  const isAuthorizing = escrowStatus === "authorizing";

  return (
    <div
      data-testid={`partition-card-${partition.merchantId}`}
      style={{
        borderRadius: "0.75rem",
        border: `1px solid ${
          escrowStatus === "confirmed"
            ? "#86efac"
            : escrowStatus === "failed"
            ? "#fca5a5"
            : isActive
            ? "#93c5fd"
            : "#e5e7eb"
        }`,
        background:
          escrowStatus === "confirmed"
            ? "#f0fdf4"
            : escrowStatus === "failed"
            ? "#fef2f2"
            : "#fff",
        padding: "1rem 1.125rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
      }}
    >
      {/* Merchant header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <p style={{ margin: 0, fontWeight: 700, fontSize: "0.9375rem" }}>
            {partition.merchantName}
          </p>
          <p style={{ margin: 0, fontSize: "0.75rem", color: "#6b7280", fontFamily: "monospace" }}>
            {partition.payoutAddress
              ? `${partition.payoutAddress.slice(0, 6)}…${partition.payoutAddress.slice(-4)}`
              : "No payout address"}
          </p>
        </div>
        <span
          style={{
            fontSize: "0.75rem",
            fontWeight: 600,
            color: STATUS_COLOR[escrowStatus],
            padding: "0.2rem 0.6rem",
            borderRadius: "9999px",
            background: `${STATUS_COLOR[escrowStatus]}18`,
          }}
        >
          {STATUS_LABEL[escrowStatus]}
        </span>
      </div>

      {/* Item breakdown */}
      <ul style={{ margin: 0, padding: "0 0 0 1rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
        {partition.items.map((item) => (
          <li key={item.productId} style={{ fontSize: "0.8125rem", color: "#374151" }}>
            {item.title}{" "}
            <span style={{ color: "#6b7280" }}>
              × {item.quantity} —{" "}
              {formatStroops(
                (BigInt(item.priceStroops) * BigInt(item.quantity)).toString()
              )}
            </span>
          </li>
        ))}
      </ul>

      {/* Subtotal row */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          paddingTop: "0.5rem",
          borderTop: "1px solid #f3f4f6",
        }}
      >
        <span style={{ fontSize: "0.875rem", fontWeight: 600 }}>Subtotal</span>
        <span style={{ fontSize: "0.9375rem", fontWeight: 700 }}>
          {formatStroops(partition.subtotalStroops)}
        </span>
      </div>

      {/* Action */}
      {isActive && escrowStatus === "pending" && (
        <button
          type="button"
          onClick={() => onAuthorize(index)}
          disabled={disabled || isAuthorizing}
          style={{
            padding: "0.5rem 1rem",
            borderRadius: "0.5rem",
            border: "none",
            background: "#2563eb",
            color: "#fff",
            fontWeight: 600,
            fontSize: "0.875rem",
            cursor: "pointer",
            alignSelf: "flex-end",
          }}
        >
          Authorize escrow
        </button>
      )}

      {isActive && escrowStatus === "authorizing" && (
        <div
          aria-live="polite"
          style={{
            fontSize: "0.8125rem",
            color: "#d97706",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            alignSelf: "flex-end",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: "1rem",
              height: "1rem",
              borderRadius: "9999px",
              border: "2px solid #d97706",
              borderTopColor: "transparent",
              display: "inline-block",
              animation: "spin 0.75s linear infinite",
            }}
          />
          Waiting for wallet signature…
        </div>
      )}

      {escrowStatus === "failed" && (
        <button
          type="button"
          onClick={() => onRetry(index)}
          disabled={disabled}
          style={{
            padding: "0.375rem 0.875rem",
            borderRadius: "0.5rem",
            border: "1px solid #dc2626",
            background: "transparent",
            color: "#dc2626",
            fontWeight: 600,
            fontSize: "0.8125rem",
            cursor: "pointer",
            alignSelf: "flex-end",
          }}
        >
          Retry Signing
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export interface EscrowReceipt {
  escrowId: string;
  txHash: string;
}

export interface MultiMerchantBatchState {
  currentMerchantIndex: number;
  completedEscrows: Array<EscrowReceipt & { merchantId: string }>;
  failedMerchantId?: string;
  status: "idle" | "in_progress" | "partially_completed" | "failed" | "completed";
}

export interface MultiMerchantCheckoutProps {
  /** A server-validated coupon bound to the cart being checked out. */
  promoCode?: AppliedPromoCode;
  onComplete?: (partitions: MerchantCartPartition[]) => void;
  onCancel?: () => void;
  /** Resolve only after confirmation, with the actual on-chain receipt.
   * Reject only once it is known no escrow was created; reconcile ambiguous
   * submissions before returning so retry cannot create duplicate escrows. */
  signEscrow?: (partition: MerchantCartPartition) => Promise<EscrowReceipt>;
  /** Resolve only once funds have been refunded, not when cancellation is requested.
   * Must reconcile ambiguous outcomes and be idempotent for the escrow ID. */
  refundEscrow?: (escrow: MultiMerchantBatchState["completedEscrows"][number]) => Promise<void>;
  onRecoveryRequiredChange?: (required: boolean) => void;
}

export function MultiMerchantCheckout({
  promoCode,
  onComplete,
  onCancel,
  signEscrow,
  refundEscrow,
  onRecoveryRequiredChange,
}: MultiMerchantCheckoutProps) {
  const { summary, clearCart } = useCart();
  const [initialPartitions] = useState(() => partitionCartByMerchant(summary.items, promoCode));
  const [partitions, setPartitions] = useState(initialPartitions);
  const [completedEscrows, setCompletedEscrows] = useState<MultiMerchantBatchState["completedEscrows"]>([]);
  const [refundedIds, setRefundedIds] = useState<string[]>([]);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  // State alone does not prevent two clicks before React commits the next render.
  const operation = useRef(false);
  const done = allConfirmed(partitions) && !cancelling;
  const activeIndex = partitions.findIndex(p => p.escrowStatus !== "confirmed");
  const failed = partitions.find(p => p.escrowStatus === "failed");
  const outstanding = completedEscrows.filter(e => !refundedIds.includes(e.escrowId));
  const batch: MultiMerchantBatchState = {
    currentMerchantIndex: activeIndex,
    completedEscrows,
    failedMerchantId: failed?.merchantId,
    status: done ? "completed" : failed
      ? completedEscrows.length ? "partially_completed" : "failed"
      : busy || completedEscrows.length ? "in_progress" : "idle",
  };
  const recoveryRequired = busy || (!done && outstanding.length > 0);
  useEffect(() => {
    onRecoveryRequiredChange?.(recoveryRequired);
  }, [recoveryRequired, onRecoveryRequiredChange]);
  useEffect(() => {
    if (!recoveryRequired) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [recoveryRequired]);

  const updateStatus = useCallback((index: number, status: EscrowStatus) => {
    setPartitions(prev => prev.map((p, i) => i === index ? { ...p, escrowStatus: status } : p));
  }, []);

  const handleAuthorize = async (index: number) => {
    if (operation.current || cancelling || cancelled || index !== activeIndex) return;
    operation.current = true;
    setBusy(true);
    setGlobalError(null);
    updateStatus(index, "authorizing");
    let updated: MerchantCartPartition[] | undefined;
    try {
      if (!signEscrow) throw new Error("Escrow signing is not connected. No funds have been moved.");
      const receipt = await signEscrow(partitions[index]);
      setCompletedEscrows(prev => [...prev, { ...receipt, merchantId: partitions[index].merchantId }]);
      updated = partitions.map((p, i) => i === index ? { ...p, escrowStatus: "confirmed" } : p);
      setPartitions(updated);
    } catch (err) {
      updateStatus(index, "failed");
      setGlobalError(err instanceof Error ? err.message : "Escrow signing failed.");
    } finally {
      operation.current = false;
      setBusy(false);
    }
    // Consumer callbacks must not turn a confirmed escrow into a retryable failure.
    if (updated && allConfirmed(updated)) {
      clearCart();
      onComplete?.(updated);
    }
  };

  const handleCancel = async () => {
    if (operation.current || cancelled) return;
    if (outstanding.length === 0) {
      setCancelled(true);
      onCancel?.();
      return;
    }
    if (!refundEscrow) {
      setGlobalError("Refunds are not connected. Your confirmed escrows remain active; keep their IDs below for recovery.");
      return;
    }
    operation.current = true;
    setBusy(true);
    setCancelling(true);
    setGlobalError(null);
    let success = false;
    try {
      for (const escrow of outstanding) {
        await refundEscrow(escrow);
        setRefundedIds(prev => [...prev, escrow.escrowId]);
      }
      success = true;
      setCancelled(true);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : "Refund failed. Retry to refund the remaining escrows.");
    } finally {
      operation.current = false;
      setBusy(false);
    }
    if (success) onCancel?.();
  };

  if (initialPartitions.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "2rem", color: "#6b7280" }}>
        <p>Your cart is empty.</p>
      </div>
    );
  }

  return (
    <section
      aria-label="Multi-merchant checkout"
      style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
    >
      {/* Spinner keyframes — injected once */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <h2 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 700 }}>
        Checkout
      </h2>

      {partitions.length > 1 && (
        <p style={{ margin: 0, fontSize: "0.875rem", color: "#6b7280" }}>
          Your cart has items from <strong>{partitions.length} merchants</strong>.
          Each requires a separate escrow transaction.
        </p>
      )}

      {/* Step progress indicator (only shown for multi-merchant) */}
      {partitions.length > 1 && (
        <StepIndicator partitions={partitions} activeIndex={activeIndex} />
      )}

      {/* Global error */}
      {globalError && (
        <div
          role="alert"
          style={{
            padding: "0.75rem 1rem",
            borderRadius: "0.5rem",
            background: "#fef2f2",
            border: "1px solid #fca5a5",
            color: "#dc2626",
            fontSize: "0.875rem",
          }}
        >
          {globalError}
        </div>
      )}

      {(batch.status === "partially_completed" || cancelling) && !cancelled && (
        <div role="alert" style={{ padding: "0.75rem", border: "1px solid #f59e0b", borderRadius: "0.5rem", background: "#fffbeb", color: "#92400e", lineHeight: 1.5 }}>
          Checkout is incomplete. {outstanding.length} confirmed escrow(s) still hold funds.
          {cancelling ? " Refund recovery is in progress; retry refunds to finish cancelling."
            : " Retry Signing continues with the failed merchant without charging successful merchants again, or cancel and refund completed escrows."}
        </div>
      )}
      {completedEscrows.length > 0 && (
        <ul aria-label="Escrow receipts" style={{ fontSize: "0.8125rem", overflowWrap: "anywhere", paddingLeft: "1.25rem" }}>
          {completedEscrows.map(escrow => (
            <li key={escrow.escrowId}>
              {partitions.find(p => p.merchantId === escrow.merchantId)?.merchantName}: {escrow.escrowId}
              {" - Transaction: "}{escrow.txHash}
              {refundedIds.includes(escrow.escrowId) ? " - Refunded" : " - Confirmed"}
            </li>
          ))}
        </ul>
      )}
      {cancelled && <p role="status">Checkout cancelled. All completed escrows have been refunded. Your cart has been kept.</p>}

      {/* Partition cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {partitions.map((partition, idx) => (
          <PartitionCard
            key={partition.merchantId}
            partition={partition}
            index={idx}
            isActive={idx === activeIndex}
            onAuthorize={handleAuthorize}
            onRetry={handleAuthorize}
            disabled={busy || cancelling || cancelled}
          />
        ))}
      </div>

      {/* Completion state */}
      {done && (
        <div
          role="status"
          style={{
            padding: "1rem",
            borderRadius: "0.75rem",
            background: "#f0fdf4",
            border: "1px solid #86efac",
            color: "#15803d",
            fontWeight: 600,
            textAlign: "center",
          }}
        >
          All escrows confirmed. Your orders are being processed.
        </div>
      )}

      {/* Cancel */}
      {!done && !cancelled && (
        <button
          type="button"
          onClick={handleCancel}
          disabled={busy}
          style={{
            background: "transparent",
            border: "none",
            color: "#6b7280",
            fontSize: "0.8125rem",
            cursor: "pointer",
            textDecoration: "underline",
            alignSelf: "flex-start",
            padding: 0,
          }}
        >
          {busy && cancelling ? "Refunding..." : outstanding.length ? "Cancel & Refund Completed Escrows" : "Cancel checkout"}
        </button>
      )}
    </section>
  );
}
