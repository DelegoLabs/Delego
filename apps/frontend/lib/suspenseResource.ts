/**
 * Module-level promise cache for client-side Suspense (#625).
 *
 * Independent widgets call `getResource(key, fetcher)` and `use()` the
 * promise so each boundary can stream in as its own query resolves.
 * `startTransition` is used by callers when swapping a key (range change)
 * so the previous UI stays visible instead of flashing the skeleton.
 */

const cache = new Map<string, Promise<unknown>>();

export function getResource<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const existing = cache.get(key);
  if (existing) return existing as Promise<T>;
  const promise = fetcher();
  cache.set(key, promise);
  return promise;
}

export function clearResource(key?: string): void {
  if (key) cache.delete(key);
  else cache.clear();
}

/** Test helper: a promise that resolves after `ms` so a sibling can paint first. */
export function delayedResource<T>(
  key: string,
  fetcher: () => Promise<T>,
  ms: number
): Promise<T> {
  return getResource(key, () => new Promise<T>((resolve, reject) => {
    window.setTimeout(() => {
      fetcher().then(resolve, reject);
    }, ms);
  }));
}
