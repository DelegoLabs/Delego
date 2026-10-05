/**
 * Multi-sig dual-control approval queue (#780).
 *
 * Enterprise/team managers get a dashboard of transactions that already carry
 * one signature and are waiting on a *secondary* one. Everything in this
 * module is pure — the server stays the source of truth for what actually
 * executes; these helpers only decide what the queue shows, how urgently, and
 * whether the connected signer may act — so the rules are unit testable
 * without a network round trip.
 *
 * This is the team-queue sibling of `dualControl.ts` (per-order state machine)
 * and `dualControlBoard.ts` (kanban board): it deals in *items awaiting a
 * signature* rather than in order lifecycle transitions.
 */

/** One transaction awaiting a secondary signature. */
export interface PendingApprovalItem {
  orderId: string;
  requestedBy: string;
  amountStroops: bigint;
  recipient: string;
  expiresAt: Date;
}

/**
 * Wire shape as returned by the API: stroops travel as a decimal string and
 * the expiry as an ISO-8601 timestamp (bigint/Date don't survive JSON).
 */
export interface PendingApprovalDto {
  orderId: string;
  requestedBy: string;
  amountStroops: string;
  recipient: string;
  expiresAt: string;
}

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;

/** Below this the request is about to lapse — surfaced as "critical". */
export const CRITICAL_WINDOW_MS = HOUR_MS;
/** Below this it is "soon"; anything further out is unremarkable. */
export const WARNING_WINDOW_MS = 24 * HOUR_MS;

/** Shown when the wallet that raised the request tries to sign it itself. */
export const SELF_SIGN_BLOCKED_MESSAGE =
  "You raised this request — a second team member must sign it.";
/** Shown when no wallet is connected. */
export const WALLET_REQUIRED_MESSAGE = "Connect your wallet to sign.";
/** Shown once the signature window has closed. */
export const EXPIRED_MESSAGE = "This request expired and can no longer be signed.";

export type PendingApprovalUrgency = "expired" | "critical" | "warning" | "normal";

export interface PendingSignCheck {
  allowed: boolean;
  reason?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Parses a stroop amount, tolerating both the string and number wire forms. */
function parseStroops(value: unknown): bigint | null {
  if (typeof value === "bigint") return value >= 0n ? value : null;
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? BigInt(Math.floor(value)) : null;
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return BigInt(value.trim());
  }
  return null;
}

/**
 * Adapts one wire record into the domain shape, or returns `null` when the
 * payload is unusable. A malformed row must not be able to take the whole
 * dashboard down, so unparseable amounts/expiries drop the row instead.
 */
export function adaptPendingApproval(raw: unknown): PendingApprovalItem | null {
  if (!isRecord(raw)) return null;
  const { orderId, requestedBy, recipient, expiresAt } = raw;
  if (
    typeof orderId !== "string" ||
    !orderId ||
    typeof requestedBy !== "string" ||
    !requestedBy ||
    typeof recipient !== "string" ||
    !recipient ||
    typeof expiresAt !== "string"
  ) {
    return null;
  }
  const amountStroops = parseStroops(raw.amountStroops);
  const expiry = new Date(expiresAt);
  if (amountStroops === null || Number.isNaN(expiry.getTime())) return null;
  return { orderId, requestedBy, recipient, amountStroops, expiresAt: expiry };
}

/** Adapts a list payload, silently dropping unusable rows. */
export function adaptPendingApprovals(raw: unknown): PendingApprovalItem[] {
  if (!Array.isArray(raw)) return [];
  const items: PendingApprovalItem[] = [];
  for (const entry of raw) {
    const item = adaptPendingApproval(entry);
    if (item) items.push(item);
  }
  return items;
}

/** Milliseconds until the signature window closes; negative once expired. */
export function msUntilExpiry(item: PendingApprovalItem, now: Date = new Date()): number {
  return item.expiresAt.getTime() - now.getTime();
}

/** Whether the signature window has closed. */
export function isPendingApprovalExpired(
  item: PendingApprovalItem,
  now: Date = new Date()
): boolean {
  return msUntilExpiry(item, now) <= 0;
}

/** Buckets an item by how close it is to lapsing — drives the row's badge tone. */
export function pendingApprovalUrgency(
  item: PendingApprovalItem,
  now: Date = new Date()
): PendingApprovalUrgency {
  const remaining = msUntilExpiry(item, now);
  if (remaining <= 0) return "expired";
  if (remaining <= CRITICAL_WINDOW_MS) return "critical";
  if (remaining <= WARNING_WINDOW_MS) return "warning";
  return "normal";
}

/**
 * Queue ordering: most urgent first (soonest expiry), then largest amount, then
 * order id — the last key only exists so the order is deterministic for rows
 * that tie on both money and time.
 */
export function sortPendingApprovals(items: PendingApprovalItem[]): PendingApprovalItem[] {
  return [...items].sort((a, b) => {
    const byExpiry = a.expiresAt.getTime() - b.expiresAt.getTime();
    if (byExpiry !== 0) return byExpiry;
    if (a.amountStroops !== b.amountStroops) {
      return a.amountStroops > b.amountStroops ? -1 : 1;
    }
    return a.orderId.localeCompare(b.orderId);
  });
}

/** Drops expired rows — a lapsed signature window is no longer actionable. */
export function activePendingApprovals(
  items: PendingApprovalItem[],
  now: Date = new Date()
): PendingApprovalItem[] {
  return items.filter((item) => !isPendingApprovalExpired(item, now));
}

/** Value still awaiting a signature — the dashboard's headline number. */
export function totalPendingAmountStroops(items: PendingApprovalItem[]): bigint {
  return items.reduce((total, item) => total + item.amountStroops, 0n);
}

/**
 * The count behind the navigation badge (#780). Expired rows are excluded so
 * the badge doesn't strand a manager on a queue they can no longer act on.
 */
export function pendingApprovalCount(
  items: PendingApprovalItem[],
  now: Date = new Date()
): number {
  return activePendingApprovals(items, now).length;
}

/**
 * Whether `signerAddress` may provide the secondary signature for `item`:
 * a wallet must be connected, the window must still be open, and the person
 * who raised the request can't be the second signer — that's the whole point
 * of dual control.
 */
export function canSignPendingApproval(
  item: PendingApprovalItem,
  signerAddress: string | null,
  now: Date = new Date()
): PendingSignCheck {
  if (!signerAddress) return { allowed: false, reason: WALLET_REQUIRED_MESSAGE };
  if (isPendingApprovalExpired(item, now)) {
    return { allowed: false, reason: EXPIRED_MESSAGE };
  }
  if (item.requestedBy === signerAddress) {
    return { allowed: false, reason: SELF_SIGN_BLOCKED_MESSAGE };
  }
  return { allowed: true };
}

/** `1d 2h`, `2h 15m`, `45m` — the largest two non-zero units of a duration. */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / MINUTE_MS));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 && parts.length < 2) parts.push(`${minutes}m`);
  return parts.length > 0 ? parts.join(" ") : "under a minute";
}

/** Human countdown for the row's expiry badge. */
export function formatExpiryLabel(item: PendingApprovalItem, now: Date = new Date()): string {
  const remaining = msUntilExpiry(item, now);
  if (remaining <= 0) return "Expired";
  return `Expires in ${formatDuration(remaining)}`;
}
