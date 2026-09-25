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
