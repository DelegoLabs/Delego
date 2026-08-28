"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** A value that can be synced to a URL query string via `useQueryParamState`. */
export interface QueryParamCodec<T> {
  /** Serialize a state value to a query string value. Return `null` to omit the param entirely. */
  encode: (value: T) => string | null;
  /** Parse a raw query string value back into state. Return `null` on invalid input to fall back to the default. */
  decode: (raw: string) => T | null;
}

/**
 * Plain-string codec — keeps the query param human-readable (`?decision=approved`
 * rather than the JSON codec's `?decision=%22approved%22`). An empty string is
 * treated as "param absent".
 */
export function stringParamCodec(): QueryParamCodec<string> {
  return {
    encode: (value) => (value === "" ? null : value),
    decode: (raw) => raw,
  };
}

/** JSON-stringify based codec — works for any JSON-serializable state shape. */
export function jsonParamCodec<T>(): QueryParamCodec<T> {
  return {
    encode: (value) => JSON.stringify(value),
    decode: (raw) => {
      try {
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    },
  };
}

export interface UseQueryParamStateOptions<T> {
  /** The query string param name to sync this state under. */
  key: string;
  /** State to use before the client has read the URL, and whenever the param is absent or invalid. */
  defaultValue: T;
  /** How to encode/decode the value. Defaults to JSON stringify/parse. */
  codec?: QueryParamCodec<T>;
}

/**
 * Syncs a piece of state to a URL query string param via the App Router, so
 * filters survive a refresh, back/forward navigation, and can be shared as a
 * link (#510). Reads the URL only after mount to avoid hydration mismatches —
 * `hydrated` reports when that initial read has completed.
 *
 * Invalid or unparseable param values fall back to `defaultValue` silently
 * (no error is surfaced to the user).
 */
export function useQueryParamState<T>({
  key,
  defaultValue,
  codec,
}: UseQueryParamStateOptions<T>): [
  T,
  (value: T) => void,
  { hydrated: boolean },
] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const resolvedCodec = useMemo(() => codec ?? jsonParamCodec<T>(), [codec]);

  const [hydrated, setHydrated] = useState(false);
  const [value, setValue] = useState<T>(defaultValue);

  // Read the URL only after mount so server- and first-client-render markup
  // match exactly, then re-sync whenever the URL changes underneath us
  // (back/forward navigation, or another hook instance writing the same key).
  useEffect(() => {
    const raw = searchParams.get(key);
    if (raw === null) {
      setValue(defaultValue);
    } else {
      const decoded = resolvedCodec.decode(raw);
      setValue(decoded === null ? defaultValue : decoded);
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- defaultValue/codec are expected to be stable per call site
  }, [searchParams, key]);

  const setParam = useCallback(
    (next: T) => {
      setValue(next);
      const params = new URLSearchParams(searchParams.toString());
      const encoded = resolvedCodec.encode(next);
      if (encoded === null) {
        params.delete(key);
      } else {
        params.set(key, encoded);
      }
      const query = params.toString();
      router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [key, pathname, router, searchParams, resolvedCodec]
  );

  return [value, setParam, { hydrated }];
}
