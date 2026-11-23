/**
 * Subscription management types and API helpers
 * Handles agent-automated recurring orders (e.g., coffee beans every 14 days)
 */

import { apiFetch } from "./apiFetch";

export type SubscriptionStatus = "active" | "paused" | "cancelled";

export type SubscriptionAction = "pause" | "resume" | "cancel";

export interface SubscriptionPlan {
  subscriptionId: string;
  merchantName: string;
  itemTitle: string;
  intervalDays: number;
  /** Price ceiling per run, in stroops. */
  amountStroops: string;
  nextExecutionDate: string;
  status: SubscriptionStatus;
}

const STROOPS_PER_XLM = 10_000_000n;

/** Format a stroop amount as a human-readable XLM string (e.g. "0.00025 XLM"). */
export function formatStroopsAsXlm(stroops: string): string {
  let value: bigint;
  try {
    value = BigInt(stroops);
  } catch {
    return `${stroops} stroops`;
  }
  const whole = value / STROOPS_PER_XLM;
  const fraction = (value % STROOPS_PER_XLM)
    .toString()
    .padStart(7, "0")
    .replace(/0+$/, "");
  return `${whole}${fraction ? `.${fraction}` : ""} XLM`;
}

/** Format a subscription interval (e.g. 14 -> "Every 14 days"). */
export function formatInterval(intervalDays: number): string {
  if (intervalDays === 1) return "Every day";
  if (intervalDays === 7) return "Every week";
  return `Every ${intervalDays} days`;
}

/** Status a subscription moves to once an action succeeds. */
export function statusAfterAction(action: SubscriptionAction): SubscriptionStatus {
  switch (action) {
    case "pause":
      return "paused";
    case "resume":
      return "active";
    case "cancel":
      return "cancelled";
  }
}

/** Fetch the current user's subscriptions. */
export async function fetchSubscriptions(): Promise<SubscriptionPlan[]> {
  const res = await apiFetch<SubscriptionPlan[]>("/subscriptions");
  if (res.error) throw new Error(res.error.message);
  return res.data ?? [];
}

/** Pause, resume, or cancel a subscription. */
export async function updateSubscriptionStatus(
  subscriptionId: string,
  action: SubscriptionAction
): Promise<SubscriptionPlan | null> {
  const res = await apiFetch<SubscriptionPlan>(
    `/subscriptions/${encodeURIComponent(subscriptionId)}/${action}`,
    { method: "POST" }
  );
  if (res.error) throw new Error(res.error.message);
  return res.data ?? null;
}
