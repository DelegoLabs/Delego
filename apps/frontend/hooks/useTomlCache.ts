/**
 * useTomlCache
 *
 * For each issuer account ID encountered in the asset table we need to resolve
 * a human-readable domain (e.g. "centre.io" for USDC). This is done by:
 *   1. Fetching https://<horizonUrl>/accounts/<issuerAccountId>
 *      to read the `home_domain` field from the account record.
 *   2. Confirming with the TOML at https://<home_domain>/.well-known/stellar.toml
 *      (light-touch: we only need the domain, not the TOML contents).
 *
 * A module-level Map acts as a cross-render cache so the same issuer is never
 * fetched twice within a page session. Concurrent callers for the same issuer
 * share a single in-flight Promise.
 *
 * Returns a synchronous `getIssuerDomain(accountId)` getter; it returns the
 * cached domain string, null while still loading, or the truncated account ID
 * as a fallback when resolution fails.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Module-level cache: `${horizonUrl}:${accountId}` → resolved domain (or null on failure)
const domainCache = new Map<string, Promise<string | null>>();

export function truncateAccountId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

async function resolveIssuerDomain(
  horizonUrl: string,
  accountId: string
): Promise<string | null> {
  try {
    const res = await fetch(
      `${horizonUrl}/accounts/${encodeURIComponent(accountId)}`
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { home_domain?: string };
    return data.home_domain ?? null;
  } catch {
    return null;
  }
}

export interface TomlCacheResult {
  /**
   * Synchronously returns the best available display string for an issuer:
   *  - Resolved home_domain while available (e.g. "centre.io")
   *  - Truncated account ID while loading or on failure
   */
  getIssuerDomain: (accountId: string) => string;
  /** True while any issuer is still being resolved */
  loading: boolean;
}

export function useTomlCache(
  issuerIds: string[],
  horizonUrl: string
): TomlCacheResult {
  // resolved: accountId → domain string (or truncated fallback)
  const [resolved, setResolved] = useState<Map<string, string>>(new Map());
  const pendingRef = useRef(new Set<string>());
  const [loading, setLoading] = useState(false);

  const resolve = useCallback(
    async (ids: string[]) => {
      const toFetch = ids.filter(
        (id) => id && !pendingRef.current.has(`${horizonUrl}:${id}`)
      );
      if (toFetch.length === 0) return;

      setLoading(true);
      for (const id of toFetch) {
        pendingRef.current.add(`${horizonUrl}:${id}`);
      }

      const promises = toFetch.map((id) => {
        const cacheKey = `${horizonUrl}:${id}`;
        if (!domainCache.has(cacheKey)) {
          domainCache.set(cacheKey, resolveIssuerDomain(horizonUrl, id));
        }
        return domainCache.get(cacheKey)!.then((domain) => ({ id, domain }));
      });

      const results = await Promise.allSettled(promises);

      setResolved((prev: Map<string, string>) => {
        const next = new Map(prev);
        for (const result of results) {
          if (result.status === "fulfilled") {
            const { id, domain } = result.value;
            next.set(id, domain ?? truncateAccountId(id));
            pendingRef.current.delete(`${horizonUrl}:${id}`);
          }
        }
        return next;
      });

      setLoading(pendingRef.current.size > 0);
    },
    [horizonUrl]
  );

  const issuerIdsStr = JSON.stringify(issuerIds);
  useEffect(() => {
    void resolve(JSON.parse(issuerIdsStr));
  }, [issuerIdsStr, horizonUrl, resolve]);

  const getIssuerDomain = useCallback(
    (accountId: string): string => {
      return resolved.get(accountId) ?? truncateAccountId(accountId);
    },
    [resolved]
  );

  return { getIssuerDomain, loading };
}
