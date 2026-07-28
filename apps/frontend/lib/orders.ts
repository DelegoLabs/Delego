import type { Order, OrderStatus } from "@delego/types";

/**
 * Pure helpers for working with orders in the web app: formatting, filtering,
 * sorting, pagination, and high-value classification. Kept side-effect free so
 * they can be unit tested and shared across the history, approval, and tracking
 * views.
 */

const STROOPS_PER_XLM = 10_000_000;

/** Format a stroops amount as a human-readable XLM string (2 decimal places). */
export function formatXlm(stroops: bigint): string {
  return (Number(stroops) / STROOPS_PER_XLM).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Human-friendly label for an order status (e.g. "pending_approval" -> "Pending approval"). */
export function orderStatusLabel(status: OrderStatus): string {
  const withSpaces = status.replace(/_/g, " ");
  return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
}

/**
 * Canonical order lifecycle in the order it progresses through. Terminal
 * failure states (cancelled, disputed) are not part of the happy path and are
 * handled separately by the tracking UI.
 */
export const ORDER_LIFECYCLE: readonly OrderStatus[] = [
  "draft",
  "pending_approval",
  "approved",
  "escrowed",
  "fulfilled",
  "settled",
] as const;

/** Statuses that represent an order that is no longer in flight. */
export const TERMINAL_STATUSES: ReadonlySet<OrderStatus> = new Set<OrderStatus>([
  "settled",
  "cancelled",
  "disputed",
]);

/** True when the order has reached a terminal state (no further updates expected). */
export function isTerminal(order: Order): boolean {
  return TERMINAL_STATUSES.has(order.status);
}

/**
 * Zero-based index of a status within the happy-path lifecycle, or -1 for
 * off-path states (cancelled, disputed). Used to render progress timelines.
 */
export function lifecycleIndex(status: OrderStatus): number {
  return ORDER_LIFECYCLE.indexOf(status);
}

/**
 * Orders at or above this total (in stroops) require explicit human approval
 * before they can proceed. 1,000 XLM by default.
 */
export const HIGH_VALUE_THRESHOLD_STROOPS = BigInt(1_000 * STROOPS_PER_XLM);

/** True when an order's total meets or exceeds the high-value threshold. */
export function isHighValue(
  order: Order,
  threshold: bigint = HIGH_VALUE_THRESHOLD_STROOPS
): boolean {
  return order.totalStroops >= threshold;
}

/**
 * Orders that need a human approval decision: awaiting approval and high-value.
 * This is the queue surfaced by the approval workflow UI.
 */
export function needsApproval(
  order: Order,
  threshold: bigint = HIGH_VALUE_THRESHOLD_STROOPS
): boolean {
  return order.status === "pending_approval" && isHighValue(order, threshold);
}

export interface OrderFilters {
  /** Restrict to these statuses; empty/undefined means all statuses. */
  statuses?: OrderStatus[];
  /** Case-insensitive match against order id, merchant id, or delegation id. */
  search?: string;
  /** Only include orders with a total at or above this many stroops. */
  minTotalStroops?: bigint;
  /** Only include orders with a total at or below this many stroops. */
  maxTotalStroops?: bigint;
}

/** Apply the given filters to an order list, preserving input order. */
export function filterOrders(orders: Order[], filters: OrderFilters): Order[] {
  const statuses = filters.statuses;
  const search = filters.search?.trim().toLowerCase();

  return orders.filter((order) => {
    if (statuses && statuses.length > 0 && !statuses.includes(order.status)) {
      return false;
    }
    if (
      filters.minTotalStroops !== undefined &&
      order.totalStroops < filters.minTotalStroops
    ) {
      return false;
    }
    if (
      filters.maxTotalStroops !== undefined &&
      order.totalStroops > filters.maxTotalStroops
    ) {
      return false;
    }
    if (search) {
      const haystack = [order.id, order.merchantId, order.delegationId]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(search)) {
        return false;
      }
    }
    return true;
  });
}

export type OrderSortField = "createdAt" | "updatedAt" | "totalStroops";
export type SortDirection = "asc" | "desc";

/** Return a new array sorted by the given field/direction (does not mutate input). */
export function sortOrders(
  orders: Order[],
  field: OrderSortField,
  direction: SortDirection = "desc"
): Order[] {
  const factor = direction === "asc" ? 1 : -1;
  return [...orders].sort((a, b) => {
    let delta: number;
    if (field === "totalStroops") {
      delta = a.totalStroops < b.totalStroops ? -1 : a.totalStroops > b.totalStroops ? 1 : 0;
    } else {
      delta = a[field].getTime() - b[field].getTime();
    }
    return delta * factor;
  });
}

export interface PageResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

/**
 * Slice a list into a single page. `page` is 1-based and clamped into range so
 * callers never render an empty page past the end of the data.
 */
export function paginate<T>(
  items: T[],
  page: number,
  pageSize: number
): PageResult<T> {
  const safeSize = Math.max(1, Math.floor(pageSize));
  const totalPages = Math.max(1, Math.ceil(items.length / safeSize));
  const safePage = Math.min(Math.max(1, Math.floor(page)), totalPages);
  const start = (safePage - 1) * safeSize;
  return {
    items: items.slice(start, start + safeSize),
    page: safePage,
    pageSize: safeSize,
    totalItems: items.length,
    totalPages,
  };
}

/** Sum the total of every order in the list (in stroops). */
export function sumOrderTotals(orders: Order[]): bigint {
  return orders.reduce((sum, order) => sum + order.totalStroops, 0n);
}
