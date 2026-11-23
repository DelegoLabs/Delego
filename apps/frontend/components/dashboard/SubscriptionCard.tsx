"use client";

/**
 * SubscriptionCard Component
 * Dashboard card for managing agent-automated recurring orders
 *
 * - List active subscriptions
 * - Pause/Resume/Cancel actions
 * - Edit interval modal
 * - Edit price ceiling modal
 */

import React, { useState } from "react";
import { Button } from "@delegolabs/ui";
import {
  formatInterval,
  formatStroopsAsXlm,
  validateIntervalDays,
  validatePriceCeilingStroops,
  MAX_INTERVAL_DAYS,
  MIN_INTERVAL_DAYS,
  type SubscriptionAction,
  type SubscriptionPlan,
  type SubscriptionStatus,
} from "../../lib/subscriptions";
import { EditSubscriptionModal } from "./EditSubscriptionModal";

interface SubscriptionCardProps {
  subscriptions: SubscriptionPlan[];
  loading?: boolean;
  error?: string | null;
  /** Subscription IDs with an in-flight action request. */
  pendingIds?: Set<string>;
  onAction?: (subscriptionId: string, action: SubscriptionAction) => Promise<boolean> | void;
  onUpdateInterval?: (subscriptionId: string, intervalDays: number) => void | Promise<void>;
  onUpdatePriceCeiling?: (subscriptionId: string, priceCeilingStroops: string) => void | Promise<void>;
}

type EditTarget = { kind: "interval" | "ceiling"; subscription: SubscriptionPlan };

const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  active: "Active",
  paused: "Paused",
  cancelled: "Cancelled",
};

const STATUS_COLORS: Record<SubscriptionStatus, { background: string; color: string }> = {
  active: { background: "#dcfce7", color: "#166534" },
  paused: { background: "#fef3c7", color: "#92400e" },
  cancelled: { background: "#fee2e2", color: "#991b1b" },
};

export function SubscriptionStatusBadge({ status }: { status: SubscriptionStatus }) {
  return (
    <span
      className={`subscription-status subscription-status--${status}`}
      style={{
        ...STATUS_COLORS[status],
        padding: "0.125rem 0.5rem",
        borderRadius: "9999px",
        fontSize: "0.75rem",
        fontWeight: 600,
      }}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

function formatDate(date: string): string {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function SubscriptionCard({
  subscriptions,
  loading = false,
  error = null,
  pendingIds,
  onAction,
  onUpdateInterval,
  onUpdatePriceCeiling,
}: SubscriptionCardProps) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditTarget | null>(null);

  async function run(subscriptionId: string, action: SubscriptionAction) {
    await onAction?.(subscriptionId, action);
    setConfirmingId(null);
  }

  const activeCount = subscriptions.filter((s) => s.status === "active").length;

  return (
    <div className="subscription-card">
      <h2>Recurring Orders</h2>
      <p>Manage your automated subscriptions</p>

      {error ? (
        <p className="stat-label" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="stat-label" role="status">
          Loading subscriptions…
        </p>
      ) : subscriptions.length === 0 ? (
        <p className="stat-label">No recurring orders yet.</p>
      ) : (
        <>
          <p className="stat-label">Total active subscriptions: {activeCount}</p>
          <ul className="subscription-list nav-list">
            {subscriptions.map((sub) => {
              const pending = pendingIds?.has(sub.subscriptionId) ?? false;
              const confirming = confirmingId === sub.subscriptionId;
              return (
                <li key={sub.subscriptionId} className="subscription-item">
                  <div>
                    <strong>{sub.itemTitle}</strong>{" "}
                    <SubscriptionStatusBadge status={sub.status} />
                  </div>
                  <div className="stat-label">{sub.merchantName}</div>
                  <dl className="subscription-meta">
                    <div>
                      <dt>Interval</dt>
                      <dd>{formatInterval(sub.intervalDays)}</dd>
                    </div>
                    <div>
                      <dt>Price ceiling</dt>
                      <dd>{formatStroopsAsXlm(sub.amountStroops)}</dd>
                    </div>
                    <div>
                      <dt>Next run</dt>
                      <dd>
                        {sub.status === "cancelled" ? "—" : formatDate(sub.nextExecutionDate)}
                      </dd>
                    </div>
                  </dl>

                  {sub.status !== "cancelled" ? (
                    confirming ? (
                      <div
                        className="subscription-confirm"
                        role="group"
                        aria-label={`Confirm cancelling ${sub.itemTitle}`}
                      >
                        <span>Cancel this subscription? This cannot be undone.</span>{" "}
                        <Button
                          variant="destructive"
                          disabled={pending}
                          onClick={() => void run(sub.subscriptionId, "cancel")}
                        >
                          {pending ? "Cancelling…" : "Yes, cancel"}
                        </Button>{" "}
                        <Button
                          variant="secondary"
                          disabled={pending}
                          onClick={() => setConfirmingId(null)}
                        >
                          Keep
                        </Button>
                      </div>
                    ) : (
                      <div className="subscription-actions">
                        <Button
                          variant="secondary"
                          disabled={pending}
                          onClick={() => setEditing({ kind: "interval", subscription: sub })}
                        >
                          Edit interval
                        </Button>{" "}
                        <Button
                          variant="secondary"
                          disabled={pending}
                          onClick={() => setEditing({ kind: "ceiling", subscription: sub })}
                        >
                          Edit price ceiling
                        </Button>{" "}
                        {sub.status === "active" ? (
                          <Button
                            variant="secondary"
                            disabled={pending}
                            ariaLabel={`Pause ${sub.itemTitle}`}
                            onClick={() => void run(sub.subscriptionId, "pause")}
                          >
                            {pending ? "Pausing…" : "Pause"}
                          </Button>
                        ) : (
                          <Button
                            variant="primary"
                            disabled={pending}
                            ariaLabel={`Resume ${sub.itemTitle}`}
                            onClick={() => void run(sub.subscriptionId, "resume")}
                          >
                            {pending ? "Resuming…" : "Resume"}
                          </Button>
                        )}{" "}
                        <Button
                          variant="destructive"
                          disabled={pending}
                          ariaLabel={`Cancel ${sub.itemTitle}`}
                          onClick={() => setConfirmingId(sub.subscriptionId)}
                        >
                          Cancel
                        </Button>
                      </div>
                    )
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {editing?.kind === "interval" && (
        <EditSubscriptionModal
          title="Edit interval"
          label="Interval (days)"
          hint={`Whole days, ${MIN_INTERVAL_DAYS}–${MAX_INTERVAL_DAYS}.`}
          initialValue={String(editing.subscription.intervalDays)}
          validate={validateIntervalDays}
          onSubmit={(v) => onUpdateInterval?.(editing.subscription.subscriptionId, Number(v))}
          onClose={() => setEditing(null)}
        />
      )}
      {editing?.kind === "ceiling" && (
        <EditSubscriptionModal
          title="Edit price ceiling"
          label="Maximum price (stroops)"
          hint="Whole number of stroops greater than zero."
          initialValue={editing.subscription.priceCeilingStroops ?? editing.subscription.amountStroops}
          validate={validatePriceCeilingStroops}
          onSubmit={(v) => onUpdatePriceCeiling?.(editing.subscription.subscriptionId, v)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
