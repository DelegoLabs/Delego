"use client";

import { useRef, useState } from "react";
import { Amount, Badge, Button } from "@delegolabs/ui";
import { useCurrency } from "../../hooks/useCurrency";
import { useWallet } from "../../hooks/useWallet";
import {
  DUAL_CONTROL_COLUMNS,
  canSign,
  groupByStatus,
  type DualControlBoardEntry,
} from "../../lib/dualControlBoard";

export interface DualControlBoardProps {
  entries: DualControlBoardEntry[];
  /** Performs the signature for the connected member; the parent refreshes `entries`. */
  onSign: (orderId: string) => Promise<void>;
}

function shorten(address: string): string {
  return address.length <= 12 ? address : `${address.slice(0, 4)}…${address.slice(-4)}`;
}

function formatSignedAt(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

/**
 * Team board for business-account orders that need two approvals (#718).
 * The sign button is disabled — with the reason shown — when the member has
 * already signed, isn't a requested approver, or would be the creator
 * acting as sole approver.
 */
export function DualControlBoard({ entries, onSign }: DualControlBoardProps) {
  const { address } = useWallet();
  const { currencyId, rate } = useCurrency();
  const [signing, setSigning] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const inFlightRef = useRef(false);

  const groups = groupByStatus(entries);

  async function handleSign(orderId: string) {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setSigning(orderId);
    setErrors((prev) => {
      const next = { ...prev };
      delete next[orderId];
      return next;
    });
    try {
      await onSign(orderId);
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [orderId]: err instanceof Error ? err.message : "Signing failed. Please try again.",
      }));
    } finally {
      setSigning(null);
      inFlightRef.current = false;
    }
  }

  return (
    <div className="dual-control-board" aria-label="Team approval board">
      {DUAL_CONTROL_COLUMNS.map((column) => (
        <section
          key={column.status}
          className="dual-control-column"
          aria-labelledby={`dc-col-${column.status}`}
        >
          <h3 id={`dc-col-${column.status}`} className="dual-control-column-title">
            {column.title} <span className="stat-label">({groups[column.status].length})</span>
          </h3>
          {groups[column.status].length === 0 ? (
            <p className="stat-label">Nothing here.</p>
          ) : (
            groups[column.status].map((entry) => {
              const { order } = entry;
              const check = canSign(entry, address);
              const isPending =
                order.status === "pending_first" || order.status === "pending_second";
              const reasonId = `dc-reason-${order.orderId}`;
              return (
                <article key={order.orderId} className="dual-control-card">
                  <header className="dual-control-card-header">
                    <strong>{entry.merchantName ?? order.orderId}</strong>
                    <Amount
                      stroops={/^\d+$/.test(entry.totalStroops) ? BigInt(entry.totalStroops) : 0n}
                      currency={currencyId}
                      xlmUsdRate={rate?.xlmUsdRate}
                    />
                  </header>
                  <p className="stat-label" style={{ margin: 0 }}>
                    Order {order.orderId} · created by{" "}
                    {entry.createdBy === address ? "you" : shorten(entry.createdBy)}
                  </p>
                  <p style={{ margin: 0 }}>
                    <Badge
                      tone={
                        order.status === "fully_approved"
                          ? "success"
                          : order.status === "rejected"
                            ? "error"
                            : "warning"
                      }
                    >
                      {order.currentSigners.length} of {order.requiredApprovals} approvals
                    </Badge>
                  </p>

                  {order.currentSigners.length > 0 && (
                    <ul className="dual-control-signers">
                      {order.currentSigners.map((s) => (
                        <li key={s.signerAddress}>
                          ✓ {s.name ?? shorten(s.signerAddress)}
                          {s.signerAddress === address && " (you)"} ·{" "}
                          <span className="stat-label">{formatSignedAt(s.signedAt)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {isPending && order.pendingSigners.length > 0 && (
                    <p className="stat-label" style={{ margin: 0 }}>
                      Waiting on:{" "}
                      {order.pendingSigners
                        .map((a) => (a === address ? "you" : shorten(a)))
                        .join(", ")}
                    </p>
                  )}

                  {isPending && (
                    <>
                      <Button
                        variant="primary"
                        onClick={() => void handleSign(order.orderId)}
                        disabled={!check.allowed || signing !== null}
                        loading={signing === order.orderId}
                        aria-describedby={check.reason ? reasonId : undefined}
                      >
                        {signing === order.orderId ? "Signing…" : "Sign approval"}
                      </Button>
                      {check.reason && (
                        <p id={reasonId} className="stat-label" style={{ margin: 0 }}>
                          {check.reason}
                        </p>
                      )}
                    </>
                  )}
                  {errors[order.orderId] && (
                    <p role="alert" className="settings-status error" style={{ margin: 0 }}>
                      {errors[order.orderId]}
                    </p>
                  )}
                </article>
              );
            })
          )}
        </section>
      ))}
    </div>
  );
}
