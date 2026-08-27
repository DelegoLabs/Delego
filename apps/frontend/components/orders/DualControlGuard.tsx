"use client";

import type { ReactNode } from "react";
import type { Order } from "@delegolabs/types";
import { canCountersign } from "../../lib/dualControl";

export interface DualControlRenderState {
  /** True once dual control applies and this signer may not act. */
  blocked: boolean;
  /** Explanation to show alongside a blocked action, e.g. the self-countersign message. */
  reason?: string;
  /** True whenever the order is currently waiting on a countersignature at all (whether or not this signer is blocked). */
  awaitingCountersign: boolean;
}

export interface DualControlGuardProps {
  order: Order;
  /** The current signer's identity (e.g. connected wallet address). */
  currentUserId: string;
  /**
   * Whether dual control is currently in effect for this order: the
   * DUAL_CONTROL_APPROVALS feature flag is on, the API advertises support
   * for it, and the order itself requires it. Callers compute this once
   * (`useFeatureFlag` + `useDualControlCapability`) and pass it down so
   * flag-off / capability-unavailable renders `children` completely
   * unblocked — identical to the pre-existing single-approval flow.
   */
  active: boolean;
  children: (state: DualControlRenderState) => ReactNode;
}

/**
 * Guards the approve action for a single order against dual-control rules
 * (#574): once dual control is `active` and a first approval is on record,
 * blocks the original approver from countersigning their own approval and
 * surfaces why; any other authorized delegate is let through.
 */
export function DualControlGuard({ order, currentUserId, active, children }: DualControlGuardProps) {
  const dualControl = order.dualControl;
  const awaitingCountersign = active && dualControl?.status === "awaiting_countersign";

  if (!awaitingCountersign || !dualControl) {
    return <>{children({ blocked: false, awaitingCountersign: false })}</>;
  }

  const check = canCountersign(dualControl, currentUserId);
  return <>{children({ blocked: !check.allowed, reason: check.reason, awaitingCountersign: true })}</>;
}
