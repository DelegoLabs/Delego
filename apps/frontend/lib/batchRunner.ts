/**
 * Shared batch execution utility (#582): runs an async action over a list of
 * items with a configurable concurrency cap, tracks per-item status, and
 * isolates failures so one item's error never aborts the rest of the batch.
 *
 * Used directly by the escrow multi-select batch actions
 * (`components/escrows/StickyActionBar.tsx`) and by `lib/bulkApprovals.ts`
 * for the approvals queue's bulk approve/reject — one implementation shared
 * by both call sites.
 */

export type BatchItemStatus = "success" | "error" | "skipped";

export interface BatchItemResult<T, R> {
  item: T;
  status: BatchItemStatus;
  result?: R;
  /** Failure message (status "error") or exclusion reason (status "skipped"). */
  error?: string;
}

export interface Eligibility {
  eligible: boolean;
  /** Inline reason shown next to an excluded item, e.g. "Not release-eligible". */
  reason?: string;
}

export interface BatchRunnerOptions<T, R> {
  /**
   * Max items processed at once. Defaults to 1 (strictly sequential — one
   * item completes before the next starts). Values above `items.length`
   * are clamped down to it.
   */
  concurrency?: number;
  /** Per-item eligibility gate. Ineligible items are marked "skipped" (with `reason`) and `fn` is never called for them. */
  isEligible?: (item: T) => Eligibility;
  /** Fired as each item settles (success, error, or skip) — useful for live per-item status UI. */
  onItemSettled?: (result: BatchItemResult<T, R>) => void;
}

/**
 * Runs `fn` over `items`, honoring `concurrency`, `isEligible` filtering,
 * and isolating per-item failures. Resolves once every item has settled,
 * with results in the same order as `items` regardless of completion order.
 */
export async function runBatch<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  options: BatchRunnerOptions<T, R> = {}
): Promise<BatchItemResult<T, R>[]> {
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 1, items.length || 1));
  const results: BatchItemResult<T, R>[] = new Array(items.length);

  let cursor = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      const item = items[index];

      if (options.isEligible) {
        const check = options.isEligible(item);
        if (!check.eligible) {
          const skipped: BatchItemResult<T, R> = {
            item,
            status: "skipped",
            error: check.reason,
          };
          results[index] = skipped;
          options.onItemSettled?.(skipped);
          continue;
        }
      }

      try {
        const result = await fn(item);
        const settled: BatchItemResult<T, R> = { item, status: "success", result };
        results[index] = settled;
        options.onItemSettled?.(settled);
      } catch (err) {
        // Error isolation: one item's failure is recorded and the worker
        // moves on to the next item rather than aborting the batch.
        const settled: BatchItemResult<T, R> = {
          item,
          status: "error",
          error: err instanceof Error ? err.message : "Unknown error",
        };
        results[index] = settled;
        options.onItemSettled?.(settled);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

/** Summary counts over a batch result set, for a completion toast/summary line. */
export function summarizeBatch<T, R>(results: BatchItemResult<T, R>[]) {
  return results.reduce(
    (acc, r) => {
      acc[r.status] += 1;
      return acc;
    },
    { success: 0, error: 0, skipped: 0 }
  );
}
