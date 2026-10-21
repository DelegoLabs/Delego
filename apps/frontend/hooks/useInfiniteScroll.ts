"use client";

import { useCallback, useEffect, useRef, useState, type RefCallback } from "react";

export interface UseInfiniteScrollOptions {
  hasMore: boolean;
  isLoading: boolean;
  onLoadMore: () => Promise<void> | void;
  /** Pause automatic attempts, for example while an error retry is shown. */
  disabled?: boolean;
  root?: Element | null;
  rootMargin?: string;
  threshold?: number | number[];
}

/**
 * Observes a sentinel near the end of a list and asks its owner to load one
 * more page. State is deliberately owned by the caller so the hook can be
 * used with both cursor and offset pagination APIs.
 */
export function useInfiniteScroll({
  hasMore,
  isLoading,
  onLoadMore,
  disabled = false,
  root = null,
  rootMargin = "320px 0px",
  threshold = 0,
}: UseInfiniteScrollOptions): RefCallback<Element> {
  const [target, setTarget] = useState<Element | null>(null);
  const requestInFlight = useRef(false);
  const latest = useRef({ hasMore, isLoading, onLoadMore, disabled });

  latest.current = { hasMore, isLoading, onLoadMore, disabled };

  const sentinelRef = useCallback<RefCallback<Element>>((element) => {
    setTarget(element);
  }, []);

  useEffect(() => {
    if (
      !target ||
      !hasMore ||
      isLoading ||
      disabled ||
      typeof IntersectionObserver === "undefined"
    ) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;

        const state = latest.current;
        if (
          requestInFlight.current ||
          !state.hasMore ||
          state.isLoading ||
          state.disabled
        ) {
          return;
        }

        requestInFlight.current = true;
        Promise.resolve(state.onLoadMore())
          // Loading errors belong to the catalog, which can render its retry
          // UI without producing an unhandled observer callback rejection.
          .catch(() => {})
          .finally(() => {
            requestInFlight.current = false;
          });
      },
      { root, rootMargin, threshold }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [disabled, hasMore, isLoading, root, rootMargin, target, threshold]);

  return sentinelRef;
}
