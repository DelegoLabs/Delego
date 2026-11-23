/**
 * Subscription management types and utilities
 * Handles agent-automated recurring orders (e.g., coffee beans every 14 days)
 */

export interface SubscriptionPlan {
  subscriptionId: string;
  merchantName: string;
  itemTitle: string;
  intervalDays: number;
  amountStroops: string;
  /** Maximum price (in stroops) the agent may pay per execution */
  priceCeilingStroops?: string;
  nextExecutionDate: string;
  status: "active" | "paused" | "cancelled";
}

/**
 * Mock data for development - TODO: Replace with API calls
 */
export function getMockSubscriptions(): SubscriptionPlan[] {
  return [
    {
      subscriptionId: "sub_001",
      merchantName: "Coffee Roasters Co",
      itemTitle: "Premium Arabica Beans 500g",
      intervalDays: 14,
      amountStroops: "2500",
      nextExecutionDate: "2026-10-09",
      status: "active",
    },
    {
      subscriptionId: "sub_002",
      merchantName: "Fresh Produce Market",
      itemTitle: "Organic Vegetable Box",
      intervalDays: 7,
      amountStroops: "3200",
      nextExecutionDate: "2026-10-02",
      status: "active",
    },
  ];
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
