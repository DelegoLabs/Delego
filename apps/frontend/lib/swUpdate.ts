/**
 * Service-worker update prompt helpers (#626).
 *
 * PWA updates used to `skipWaiting()` in `sw.js` the moment a new worker
 * installed, which surprise-reloaded users mid-task. The worker now stays
 * in `waiting` until this module tells it to activate.
 *
 * Tab-sleep quirks: `setTimeout` is frozen (or heavily throttled) in
 * background tabs. Deferral expiry is therefore always computed from wall
 * clock (`Date.now()`) on `visibilitychange` / `focus` / navigation — never
 * from a long-running timer. Documented here so a future change doesn't
 * re-introduce a sleeping-tab stall.
 */

export const SW_UPDATE_DEFERRED_AT_KEY = "delego-sw-update-deferred-at";
export const SW_UPDATE_MAX_DEFERRAL_MS = 7 * 24 * 60 * 60 * 1000;

export interface SwUpdateCopy {
  title: string;
  body: string;
  reloadLabel: string;
}

export function isDeferralExpired(
  deferredAt: number | null,
  now: number,
  maxMs: number = SW_UPDATE_MAX_DEFERRAL_MS
): boolean {
  if (deferredAt === null) return false;
  return now - deferredAt >= maxMs;
}

export function readDeferredAt(storage: Pick<Storage, "getItem">): number | null {
  try {
    const raw = storage.getItem(SW_UPDATE_DEFERRED_AT_KEY);
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeDeferredAt(
  storage: Pick<Storage, "setItem">,
  at: number
): void {
  try {
    storage.setItem(SW_UPDATE_DEFERRED_AT_KEY, String(at));
  } catch {
    // Quota / private mode — deferral just won't persist across reloads.
  }
}

export function clearDeferredAt(storage: Pick<Storage, "removeItem">): void {
  try {
    storage.removeItem(SW_UPDATE_DEFERRED_AT_KEY);
  } catch {
    // ignore
  }
}

/**
 * A reload must never fire while a modal or drawer is open — those surfaces
 * use `role="dialog"` throughout this app (approval drawer, pause confirm,
 * command palette, etc.).
 */
export function isBlockingOverlayOpen(root: ParentNode | null | undefined): boolean {
  if (!root) return false;
  return Boolean(root.querySelector('[role="dialog"]'));
}

export interface ShouldApplyUpdateInput {
  hasWaitingWorker: boolean;
  overlayOpen: boolean;
  deferred: boolean;
  expired: boolean;
  navigating: boolean;
}

/**
 * Apply the waiting worker only when:
 * - there is a waiting worker
 * - no modal/drawer is open
 * - either the user is navigating after a dismiss (deferred) or the 7-day
 *   cap has expired
 */
export function shouldApplyUpdate(input: ShouldApplyUpdateInput): boolean {
  if (!input.hasWaitingWorker) return false;
  if (input.overlayOpen) return false;
  if (input.expired) return true;
  return input.deferred && input.navigating;
}

export function updatePromptCopy(
  expired: boolean,
  changelog: string | null
): SwUpdateCopy {
  if (expired) {
    return {
      title: "Update required — Reload",
      body:
        changelog ??
        "This version has been waiting more than 7 days. Reload now to stay current.",
      reloadLabel: "Reload now",
    };
  }
  return {
    title: "New version ready — Reload",
    body: changelog ?? "A new version of Delego is ready.",
    reloadLabel: "Reload",
  };
}

/** Pick a changelog snippet from the fE-038 announcement feed. */
export function changelogFromAnnouncements(
  announcements: Array<{ version?: string; changelog?: string; message: string }>,
  cacheVersion?: string
): string | null {
  if (announcements.length === 0) return null;
  const matched = cacheVersion
    ? announcements.find((a) => a.version === cacheVersion)
    : undefined;
  const pick = matched ?? announcements[0];
  return pick.changelog ?? pick.message;
}
