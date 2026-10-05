import type { PendingApprovalItem } from "./pendingApprovals";

/**
 * Shared cache for the pending secondary-signature queue (#780).
 *
 * The queue is read from two places in different subtrees — the approval
 * dashboard and the navigation badge — so a React context would force both
 * through a common provider and give every consumer its own copy. A tiny
 * module-level store (read via `useSyncExternalStore`) keeps one copy of the
 * data and lets the badge reflect a signature the moment the dashboard
 * records it, without either side re-fetching.
 *
 * Deliberately framework-free so it can be unit tested without rendering.
 */

let items: PendingApprovalItem[] = [];
let loaded = false;
let inFlight: Promise<PendingApprovalItem[]> | null = null;

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/** Current queue snapshot. Identity is stable between writes, as `useSyncExternalStore` requires. */
export function getPendingApprovalItems(): PendingApprovalItem[] {
  return items;
}

/** Whether a load has already completed — lets the badge skip a redundant request. */
export function arePendingApprovalsLoaded(): boolean {
  return loaded;
}

/** Replaces the queue and notifies subscribers. */
export function setPendingApprovalItems(next: PendingApprovalItem[]): void {
  items = next;
  loaded = true;
  inFlight = null;
  emit();
}

/** Removes one signed order from the queue (optimistic, post-success). */
export function removePendingApproval(orderId: string): void {
  setPendingApprovalItems(items.filter((item) => item.orderId !== orderId));
}

/** Subscribe to queue changes; returns the unsubscribe function. */
export function subscribeToPendingApprovals(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Loads the queue at most once at a time. Concurrent callers (badge on desktop
 * *and* mobile, plus the dashboard) share a single request instead of racing.
 */
export function loadPendingApprovalsOnce(
  loader: () => Promise<PendingApprovalItem[]>
): Promise<PendingApprovalItem[]> {
  if (inFlight) return inFlight;
  inFlight = loader()
    .then((next) => {
      setPendingApprovalItems(next);
      return next;
    })
    .catch((err) => {
      // A failed load must not leave a rejected promise cached forever, and
      // must not overwrite a previously good snapshot.
      inFlight = null;
      loaded = true;
      throw err;
    });
  return inFlight;
}

/** Test helper — clears the cache and every subscription. */
export function resetPendingApprovalStore(): void {
  items = [];
  loaded = false;
  inFlight = null;
  listeners.clear();
}
