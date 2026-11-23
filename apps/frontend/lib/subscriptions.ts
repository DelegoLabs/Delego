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
  /** Maximum price (in stroops) the agent may pay per execution */
  priceCeilingStroops?: string;
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

export const MIN_INTERVAL_DAYS = 1;
export const MAX_INTERVAL_DAYS = 365;

/** Validates a recurrence interval (whole days). Returns an error message or null. */
export function validateIntervalDays(raw: string): string | null {
  const value = raw.trim();
  if (value === "") return "Interval is required.";
  if (!/^\d+$/.test(value)) return "Interval must be a whole number of days.";
  const days = Number(value);
  if (days < MIN_INTERVAL_DAYS || days > MAX_INTERVAL_DAYS) {
    return `Interval must be between ${MIN_INTERVAL_DAYS} and ${MAX_INTERVAL_DAYS} days.`;
  }
  return null;
}

/** Validates a price ceiling in stroops. Returns an error message or null. */
export function validatePriceCeilingStroops(raw: string): string | null {
  const value = raw.trim();
  if (value === "") return "Price ceiling is required.";
  if (!/^\d+$/.test(value)) return "Price ceiling must be a whole number of stroops.";
  if (BigInt(value) <= BigInt(0)) return "Price ceiling must be greater than zero.";
  return null;
}
