"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Resolve the effective reduced-motion preference. The in-app override from
 * `useAccessibility` (`<html data-reduce-motion="on|off|system">`) wins;
 * otherwise fall back to the OS-level `prefers-reduced-motion: reduce` query.
 */
export function getPrefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  const override = document.documentElement.dataset.reduceMotion;
  if (override === "on") return true;
  if (override === "off") return false;
  if (typeof window.matchMedia !== "function") return false;
  return window.matchMedia(QUERY).matches;
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const media =
    typeof window.matchMedia === "function" ? window.matchMedia(QUERY) : null;
  media?.addEventListener?.("change", onChange);

  const observer =
    typeof MutationObserver === "function"
      ? new MutationObserver(onChange)
      : null;
  observer?.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-reduce-motion"],
  });

  return () => {
    media?.removeEventListener?.("change", onChange);
    observer?.disconnect();
  };
}

/**
 * Reactive reduced-motion preference. Returns `false` during SSR so markup is
 * stable, then tracks both the OS media query and the in-app override.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    getPrefersReducedMotion,
    () => false
  );
}

/** `ScrollBehavior` to use for programmatic scrolling given the preference. */
export function scrollBehaviorFor(
  reducedMotion: boolean
): "auto" | "smooth" {
  return reducedMotion ? "auto" : "smooth";
}
