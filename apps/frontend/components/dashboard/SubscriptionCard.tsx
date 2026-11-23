/**
 * SubscriptionCard Component
 * Dashboard card for managing agent-automated recurring orders
 *
 * TODO: Implement full functionality
 * - List active subscriptions
 * - Pause/Resume/Cancel actions
 */

import React, { useState } from "react";
import {
  validateIntervalDays,
  validatePriceCeilingStroops,
  MAX_INTERVAL_DAYS,
  MIN_INTERVAL_DAYS,
  type SubscriptionPlan,
} from "../../lib/subscriptions";
import { EditSubscriptionModal } from "./EditSubscriptionModal";

interface SubscriptionCardProps {
  subscriptions: SubscriptionPlan[];
  onUpdateInterval?: (subscriptionId: string, intervalDays: number) => void | Promise<void>;
  onUpdatePriceCeiling?: (subscriptionId: string, priceCeilingStroops: string) => void | Promise<void>;
}

type EditTarget = { kind: "interval" | "ceiling"; subscription: SubscriptionPlan };

export function SubscriptionCard({
  subscriptions,
  onUpdateInterval,
  onUpdatePriceCeiling,
}: SubscriptionCardProps) {
  const [editing, setEditing] = useState<EditTarget | null>(null);

  return (
    <div className="subscription-card">
      <h2>Recurring Orders</h2>
      <p>Manage your automated subscriptions</p>

      <div className="subscription-list">
        <p>Total active subscriptions: {subscriptions.filter(s => s.status === "active").length}</p>
        <ul>
          {subscriptions
            .filter((s) => s.status !== "cancelled")
            .map((s) => (
              <li key={s.subscriptionId}>
                <span>
                  {s.itemTitle} — every {s.intervalDays} days, ceiling{" "}
                  {s.priceCeilingStroops ?? s.amountStroops} stroops
                </span>{" "}
                <button type="button" onClick={() => setEditing({ kind: "interval", subscription: s })}>
                  Edit interval
                </button>{" "}
                <button type="button" onClick={() => setEditing({ kind: "ceiling", subscription: s })}>
                  Edit price ceiling
                </button>
              </li>
            ))}
        </ul>
      </div>

      {/* TODO: Add Pause, Resume, Cancel action buttons */}

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
