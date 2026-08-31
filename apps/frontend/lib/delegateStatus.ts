import type { Delegation } from "@delegolabs/types";

/**
 * Health/status chip model for delegations (#594).
 *
 * The authoritative delegate state lives on-chain and is surfaced by the
 * `DelegateStatusView` in the contracts/backend repos. This module is the
 * frontend projection of that state: it derives the chip a card should show
 * and provides a batched, coalesced, TTL-cached fetch layer so a list of
 * cards resolves status in a single request rather than N+1 per card.
 */

export type DelegateChipStatus =
  | "active"
  | "paused"
  | "expired"
  | "threshold-reached"
  | "revoked"
  | "pending";

export interface DelegateChip {
  status: DelegateChipStatus;
  /** Short human label, e.g. "Threshold reached". */
  label: string;
  /** Tooltip detail explaining what the status means. */
  tooltip: string;
  /** Expired delegations offer a renew affordance. */
  canRenew: boolean;
  /** Paused delegations offer a resume affordance. */
  canResume: boolean;
}

const LABELS: Record<DelegateChipStatus, string> = {
  active: "Active",
  paused: "Paused",
  expired: "Expired",
  "threshold-reached": "Threshold reached",
  revoked: "Revoked",
  pending: "Pending",
};

const TOOLTIPS: Record<DelegateChipStatus, string> = {
  active: "This agent can transact within its policy.",
  paused: "Spends are blocked until you resume this delegation.",
  expired: "This delegation has passed its expiry and no longer authorizes spends.",
  "threshold-reached":
    "This agent has reached its total spend limit for the period.",
  revoked: "This delegation was revoked and cannot be used.",
  pending: "This delegation is still being confirmed on-chain.",
};

function isExpiredByDate(delegation: Delegation, now: Date): boolean {
  const exp = delegation.policy?.expiresAt;
  if (!exp) return false;
  const d = new Date(exp as string | number | Date);
  return !isNaN(d.getTime()) && d.getTime() <= now.getTime();
}

/**
 * Derive the chip to show for a delegation. Optional `spent`/`cap` let the
 * caller flag the `threshold-reached` state; without them the chip falls back
 * to the delegation's own lifecycle status.
 *
 * Precedence (most to least specific): revoked → expired → paused →
 * threshold-reached → pending → active. Explicit lifecycle states win over the
 * derived threshold state so the resume/renew affordances stay coherent.
 */
export function deriveDelegateChip(
  delegation: Delegation,
  opts: { spent?: bigint | number; cap?: bigint | number; now?: Date } = {}
): DelegateChip {
  const now = opts.now ?? new Date();
  let status: DelegateChipStatus;

  if (delegation.status === "revoked") {
    status = "revoked";
  } else if (delegation.status === "expired" || isExpiredByDate(delegation, now)) {
    status = "expired";
  } else if (delegation.status === "paused") {
    status = "paused";
  } else if (isThresholdReached(opts.spent, opts.cap)) {
    status = "threshold-reached";
  } else if (delegation.status === "pending") {
    status = "pending";
  } else {
    status = "active";
  }

  return {
    status,
    label: LABELS[status],
    tooltip: TOOLTIPS[status],
    canRenew: status === "expired",
    canResume: status === "paused",
  };
}

function isThresholdReached(
  spent?: bigint | number,
  cap?: bigint | number
): boolean {
  if (spent == null || cap == null) return false;
  const s = typeof spent === "bigint" ? spent : BigInt(Math.max(0, Math.floor(spent)));
  const c = typeof cap === "bigint" ? cap : BigInt(Math.max(0, Math.floor(cap)));
  return c > 0n && s >= c;
}

/** Format a subtle "as of X min ago" suffix for stale-tolerant rendering. */
export function formatStaleness(fetchedAt: number, now: number = Date.now()): string {
  const diffMs = Math.max(0, now - fetchedAt);
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "as of just now";
  if (mins === 1) return "as of 1 min ago";
  if (mins < 60) return `as of ${mins} min ago`;
  const hours = Math.floor(mins / 60);
  return hours === 1 ? "as of 1 hour ago" : `as of ${hours} hours ago`;
}

export interface DelegateStatusRecord {
  status: DelegateChipStatus;
  /** epoch ms when this record was fetched — drives staleness display. */
  fetchedAt: number;
}

export type DelegateStatusFetcher = (
  ids: string[]
) => Promise<Record<string, DelegateChipStatus>>;

export interface DelegateStatusStore {
  /** Resolve status for the given ids, coalescing concurrent calls into one fetch. */
  get(ids: string[]): Promise<Record<string, DelegateStatusRecord>>;
  /** Synchronously read the last-known (possibly stale) record for an id. */
  peek(id: string): DelegateStatusRecord | undefined;
  clear(): void;
}

/**
 * Build a status store that batches every id requested within the same tick
 * into a single `fetcher` call (no N+1), caches results for `ttlMs`, and keeps
 * the last-known record when a fetch fails (stale-tolerant).
 */
export function createDelegateStatusStore(
  fetcher: DelegateStatusFetcher,
  ttlMs = 30_000,
  clock: () => number = () => Date.now()
): DelegateStatusStore {
  const cache = new Map<string, DelegateStatusRecord>();
  let pending = new Set<string>();
  let flush: Promise<Record<string, DelegateChipStatus>> | null = null;

  const isFresh = (rec: DelegateStatusRecord) => clock() - rec.fetchedAt < ttlMs;

  function scheduleFlush(): Promise<Record<string, DelegateChipStatus>> {
    if (flush) return flush;
    flush = Promise.resolve().then(async () => {
      const ids = [...pending];
      pending = new Set();
      flush = null;
      if (ids.length === 0) return {};
      try {
        const res = await fetcher(ids);
        const at = clock();
        for (const id of ids) {
          if (res[id]) cache.set(id, { status: res[id], fetchedAt: at });
        }
        return res;
      } catch {
        // Stale-tolerant: keep whatever we already have in cache.
        return {};
      }
    });
    return flush;
  }

  return {
    async get(ids: string[]) {
      const missing = ids.filter((id) => {
        const rec = cache.get(id);
        return !rec || !isFresh(rec);
      });
      if (missing.length > 0) {
        missing.forEach((id) => pending.add(id));
        await scheduleFlush();
      }
      const out: Record<string, DelegateStatusRecord> = {};
      for (const id of ids) {
        const rec = cache.get(id);
        if (rec) out[id] = rec;
      }
      return out;
    },
    peek(id) {
      return cache.get(id);
    },
    clear() {
      cache.clear();
      pending = new Set();
      flush = null;
    },
  };
}
