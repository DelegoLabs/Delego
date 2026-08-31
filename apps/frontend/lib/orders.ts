import type { Order, OrderStatus } from "@delegolabs/types";
import {
  formatAmount,
  type FormatAmountContext,
  type ActivityTimelineEvent,
} from "@delegolabs/ui";

/**
 * Pure helpers for working with orders in the web app: formatting, filtering,
 * sorting, pagination, and high-value classification. Kept side-effect free so
 * they can be unit tested and shared across the history, approval, and tracking
 * views.
 */

const STROOPS_PER_XLM = 10_000_000;

/**
 * Format a stroops amount as a human-readable XLM string (2 decimal places).
 * Pass the active app locale (from `useLocale()`) to format per the user's
 * selected language instead of the browser default — see lib/intl.ts.
 *
 * Thin wrapper over the canonical `formatAmount` (FE-039, packages/ui) kept
 * for call-site compatibility; prefer `formatAmount`/`<Amount>` directly for
 * any new call site that needs the display-currency preference (useCurrency).
 */
export function formatXlm(stroops: bigint, locale?: string): string {
  return formatAmount(stroops, { locale } satisfies FormatAmountContext).value;
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
export const TERMINAL_STATUSES: ReadonlySet<OrderStatus> = new Set<OrderStatus>(
  ["settled", "cancelled", "disputed"]
);

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
  return (order.totalStroops ?? 0n) >= threshold;
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
      (order.totalStroops ?? 0n) < filters.minTotalStroops
    ) {
      return false;
    }
    if (
      filters.maxTotalStroops !== undefined &&
      (order.totalStroops ?? 0n) > filters.maxTotalStroops
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
      const aStroops = a.totalStroops ?? 0n;
      const bStroops = b.totalStroops ?? 0n;
      delta = aStroops < bStroops ? -1 : aStroops > bStroops ? 1 : 0;
    } else {
      const aTime = a[field] ? new Date(a[field] as any).getTime() : 0;
      const bTime = b[field] ? new Date(b[field] as any).getTime() : 0;
      delta = aTime - bTime;
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
  return orders.reduce((sum, order) => sum + (order.totalStroops ?? 0n), 0n);
}

/**
 * Build the normalized events an `ActivityTimeline` renders for an order.
 *
 * Orders only carry `createdAt` and `updatedAt` (no per-transition history),
 * so completed steps are timestamped at `createdAt` and the current step at
 * `updatedAt` — the best approximation available from the current data model.
 */
export function orderToTimelineEvents(order: Order): ActivityTimelineEvent[] {
  const currentIndex = lifecycleIndex(order.status);

  if (currentIndex === -1) {
    // Off-path terminal states (cancelled, disputed) aren't part of the
    // happy-path lifecycle: show the order's creation plus the terminal event.
    return [
      {
        id: `${order.id}-created`,
        type: "draft",
        title: orderStatusLabel("draft"),
        timestamp: order.createdAt ? new Date(order.createdAt) : new Date(),
        tone: "success",
      },
      {
        id: `${order.id}-${order.status}`,
        type: order.status as any,
        title: orderStatusLabel(order.status),
        timestamp: order.updatedAt ? new Date(order.updatedAt) : new Date(),
        tone: "failed",
      },
    ];
  }

  const lifecycleEvents: ActivityTimelineEvent[] = ORDER_LIFECYCLE.slice(
    0,
    currentIndex + 1
  ).map((step, index) => {
    const isCurrent = index === currentIndex;
    const ts = isCurrent ? order.updatedAt : order.createdAt;
    return {
      id: `${order.id}-${step}`,
      type: step as any,
      title: orderStatusLabel(step),
      timestamp: ts ? new Date(ts) : new Date(),
      tone: isCurrent && !isTerminal(order) ? "pending" : "success",
    };
  });

  // Approve-with-note (#573): surfaced as its own step, right after the
  // approval it belongs to, with a distinct "note" tone rather than folded
  // into the approval event's description.
  if (order.approvalNote) {
    lifecycleEvents.push({
      id: `${order.id}-approval-note`,
      type: "approval_note",
      title: "Note added",
      description: order.approvalNote,
      timestamp: order.updatedAt,
      tone: "note",
      icon: "📝",
    });
  }

  return lifecycleEvents;
}
