"use client";

import { FAMILY_CONFIG, type QueryFamily } from "../../lib/readModelCache";

export interface StaleBadgeProps {
  family: QueryFamily;
  stale: boolean;
  cachedAt: number | null;
  ttlMs?: number;
}

function formatAge(cachedAt: number, now: number): string {
  const delta = Math.max(0, now - cachedAt);
  const minutes = Math.round(delta / 60_000);
  if (minutes < 1) return "just now";
  if (minutes === 1) return "1 min ago";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours === 1 ? "1 hr ago" : `${hours} hr ago`;
}

/**
 * Explicit staleness chip for a query family. Always prints the family TTL
 * so airplane-mode cold starts don't pretend the data is fresher than it is.
 */
export function StaleBadge({ family, stale, cachedAt, ttlMs }: StaleBadgeProps) {
  if (!stale && cachedAt === null) return null;
  const ttl = ttlMs ?? FAMILY_CONFIG[family].ttlMs;
  const ttlMinutes = Math.max(1, Math.round(ttl / 60_000));
  const age = cachedAt ? formatAge(cachedAt, Date.now()) : "unknown";
  const label = stale
    ? `Stale · cached ${age} · TTL ${ttlMinutes}m`
    : `Cached ${age} · TTL ${ttlMinutes}m`;

  return (
    <span
      className={`stale-badge${stale ? " stale-badge-stale" : ""}`}
      role="status"
      title={`${FAMILY_CONFIG[family].label} last-known-good. Family TTL is ${ttlMinutes} minute(s).`}
    >
      {label}
    </span>
  );
}
