"use client";

import { useRef } from "react";
import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const HOVER_PREFETCH_DELAY_MS = 100;

export interface HoverPrefetchLinkProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  href: string;
  children: ReactNode;
}

/**
 * Link for rows in a potentially-long list (order tables, delegation cards,
 * notification items) where Next.js's default viewport prefetch would fire
 * for every row simultaneously — wasting bandwidth on rows the user never
 * opens and risking a prefetch storm on list pages (#621).
 *
 * Prefetches only on hover/focus intent, after a short delay so a pointer
 * passing over several rows on its way elsewhere doesn't trigger a fetch per
 * row. `prefetch={false}` on the underlying Link is required — Next's
 * `prefetch` prop disables prefetch "even on hover" per its own types, so
 * hover-intent prefetch has to be done manually via `router.prefetch()`.
 */
export function HoverPrefetchLink({
  href,
  children,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  ...rest
}: HoverPrefetchLinkProps) {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function schedulePrefetch() {
    if (timerRef.current !== null) return;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      router.prefetch(href);
    }, HOVER_PREFETCH_DELAY_MS);
  }

  function cancelPrefetch() {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  return (
    <Link
      href={href}
      prefetch={false}
      onMouseEnter={(e: MouseEvent<HTMLAnchorElement>) => {
        schedulePrefetch();
        onMouseEnter?.(e);
      }}
      onMouseLeave={(e: MouseEvent<HTMLAnchorElement>) => {
        cancelPrefetch();
        onMouseLeave?.(e);
      }}
      onFocus={(e) => {
        // Focus (keyboard nav) signals intent immediately — no debounce delay.
        router.prefetch(href);
        onFocus?.(e);
      }}
      {...rest}
    >
      {children}
    </Link>
  );
}
