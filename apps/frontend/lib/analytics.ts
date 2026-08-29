import type { Order } from "@delegolabs/types";
import { ORDER_LIFECYCLE, lifecycleIndex } from "./orders";

export type AnalyticsRange = "7d" | "30d" | "90d";

export const ANALYTICS_RANGES: readonly AnalyticsRange[] = ["7d", "30d", "90d"];
export const DEFAULT_ANALYTICS_RANGE: AnalyticsRange = "30d";

const RANGE_DAYS: Record<AnalyticsRange, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Narrows a URL search param into an AnalyticsRange, falling back to the default for anything else (missing, typo'd, tampered with). */
export function parseAnalyticsRange(value: string | null): AnalyticsRange {
  return (ANALYTICS_RANGES as readonly string[]).includes(value ?? "")
    ? (value as AnalyticsRange)
    : DEFAULT_ANALYTICS_RANGE;
}

/** 90D buckets by week (would otherwise be 90 bars); 7D/30D bucket by day. */
export function bucketUnitForRange(range: AnalyticsRange): "day" | "week" {
  return range === "90d" ? "week" : "day";
}

/** An order counts as spend once it's past pending_approval on the happy path — matches the "approved" half of the derived approval-decision logic in lib/export.ts. */
const SPEND_THRESHOLD_INDEX = ORDER_LIFECYCLE.indexOf("approved");
function isSpend(order: Order): boolean {
  const idx = lifecycleIndex(order.status);
  return idx >= SPEND_THRESHOLD_INDEX;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Monday-start week bucket. */
function startOfWeek(date: Date): Date {
  const d = startOfDay(date);
  const day = d.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  return d;
}

function bucketStart(date: Date, unit: "day" | "week"): Date {
  return unit === "week" ? startOfWeek(date) : startOfDay(date);
}

function advance(date: Date, unit: "day" | "week"): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + (unit === "week" ? 7 : 1));
  return d;
}

export interface SpendBucket {
  /** ISO date string identifying the bucket (day or week start), stable for use as a chart/key value. */
  bucketStart: string;
  /** Short display label, e.g. "Aug 18" or "Aug 18 – Aug 24". */
  label: string;
  totalStroops: bigint;
}

/**
 * Buckets order totals into per-day (7D/30D) or per-week (90D) spend,
 * zero-filling every bucket in range so gaps in activity don't create holes
 * in the chart. Only orders past `pending_approval` on the happy path count
 * as spend (see `isSpend`) — pending/draft/cancelled/disputed orders never
 * became real spend.
 *
 * `locale` follows the FE-039 convention used by `formatXlm` in
 * lib/orders.ts: pass `useLocale()`'s value to format bucket labels for the
 * active app language instead of the browser default.
 */
export function spendByRange(
  orders: Order[],
  range: AnalyticsRange,
  options: { now?: Date; locale?: string } = {}
): SpendBucket[] {
  const now = options.now ?? new Date();
  const unit = bucketUnitForRange(range);
  const rangeStart = bucketStart(
    new Date(now.getTime() - (RANGE_DAYS[range] - 1) * DAY_MS),
    unit
  );

  const totals = new Map<string, bigint>();
  for (let cursor = rangeStart; cursor <= now; cursor = advance(cursor, unit)) {
    totals.set(cursor.toISOString(), 0n);
  }

  for (const order of orders) {
    if (!isSpend(order)) continue;
    if (order.createdAt < rangeStart || order.createdAt > now) continue;
    const key = bucketStart(order.createdAt, unit).toISOString();
    // Orders can't predate the earliest bucket we seeded (checked above), so this is always present.
    totals.set(key, (totals.get(key) ?? 0n) + order.totalStroops);
  }

  const dayFormatter = new Intl.DateTimeFormat(options.locale, {
    month: "short",
    day: "numeric",
  });

  return Array.from(totals.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([iso, totalStroops]) => {
      const start = new Date(iso);
      let label = dayFormatter.format(start);
      if (unit === "week") {
        const weekEnd = new Date(start);
        weekEnd.setDate(weekEnd.getDate() + 6);
        label = `${dayFormatter.format(start)} – ${dayFormatter.format(weekEnd)}`;
      }
      return { bucketStart: iso, label, totalStroops };
    });
}

/** True when every bucket in the series is zero — drives the chart's empty-range state. */
export function isEmptySeries(buckets: SpendBucket[]): boolean {
  return buckets.every((bucket) => bucket.totalStroops === 0n);
}

// ─────────────────────────────────────────────────────────────────────────
// Telemetry emitter (#612)
//
// Product-analytics/marketing event emission, gated on user consent at a
// single choke point: `trackEvent`/`trackMarketingEvent` below. Every call
// site in the app funnels through one of these two functions — there is no
// other path that reaches `dispatch`, so gating here is sufficient to gate
// the whole app. Consent is read fresh on every call (not cached at
// startup), so a consent change from Settings -> Privacy applies
// immediately to the next event, including mid-session.
//
// Policy for events "emitted" before the user has made a first-run choice
// (`hasConsentChoice()` is false): DROPPED, not queued. Queuing implies a
// promise to deliver once consent is granted, which risks silently sending
// pre-consent interaction data the user never agreed to and adds a second
// state machine (a pending queue with its own retention/privacy rules) for
// a "protect the user's default" feature to get subtly wrong. Essential
// events are the one exception — see `trackEssentialEvent`.
// ─────────────────────────────────────────────────────────────────────────

import { getConsentPreferences, hasConsentChoice } from "./consent";

export interface AnalyticsEvent {
  name: string;
  properties?: Record<string, unknown>;
}

export type AnalyticsEmitter = (event: AnalyticsEvent) => void;

/**
 * The sink events are handed to once they clear the consent gate. Defaults
 * to a no-op so importing this module never has a side effect; call
 * `setAnalyticsEmitter` once at app startup (e.g. from AppProviders) to
 * wire up the real destination (console in dev, a vendor SDK in prod, etc).
 * Swappable per-test via the same setter.
 */
let dispatch: AnalyticsEmitter = () => {};

export function setAnalyticsEmitter(emitter: AnalyticsEmitter): void {
  dispatch = emitter;
}

/**
 * The single choke point every product-analytics event must pass through.
 * No-ops (and never calls `dispatch`) unless the user has explicitly
 * granted `productAnalytics` consent — this includes the pre-first-choice
 * state, where nothing is emitted at all (see the module doc comment on
 * the drop-vs-queue policy).
 */
export function trackEvent(name: string, properties?: Record<string, unknown>): void {
  if (!hasConsentChoice()) return;
  const prefs = getConsentPreferences();
  if (!prefs?.productAnalytics) return;
  dispatch({ name, properties });
}

/** Same choke point, gated on `marketing` consent instead of `productAnalytics`. */
export function trackMarketingEvent(name: string, properties?: Record<string, unknown>): void {
  if (!hasConsentChoice()) return;
  const prefs = getConsentPreferences();
  if (!prefs?.marketing) return;
  dispatch({ name, properties });
}

/**
 * For essential, non-tracking events only (error reporting, security
 * alerts) — never gated by consent, matching the "essential: always on,
 * non-tracking" tier definition. Kept as its own explicit function rather
 * than a bypass flag on `trackEvent` so "does this need consent?" is a
 * decision made once, at the call site, by which function is called.
 */
export function trackEssentialEvent(name: string, properties?: Record<string, unknown>): void {
  dispatch({ name, properties });
}
