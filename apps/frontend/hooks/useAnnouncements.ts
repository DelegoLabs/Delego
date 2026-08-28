"use client";

import { useCallback, useEffect, useState } from "react";

export type AnnouncementSeverity = "info" | "success" | "warning";

export interface Announcement {
  id: string;
  message: string;
  /** Optional in-app link surfaced as a "Learn more" affordance */
  link?: string;
  severity: AnnouncementSeverity;
  /** App/SW cache version this announcement ships with (fE-038). */
  version?: string;
  /** Short changelog line reused by the SW update toast (#626). */
  changelog?: string;
}

export interface UseAnnouncementsResult {
  /** Announcements not yet dismissed by this browser, in feed order */
  announcements: Announcement[];
  loading: boolean;
  dismiss: (id: string) => void;
}

const STORAGE_KEY = "delego_dismissed_announcements";

/**
 * Source for the announcement feed. Defaults to a static JSON file bundled
 * under `public/`, but can be pointed at the gateway by setting
 * NEXT_PUBLIC_ANNOUNCEMENTS_URL (e.g. `${gatewayUrl}/announcements`).
 */
const ANNOUNCEMENTS_URL =
  process.env.NEXT_PUBLIC_ANNOUNCEMENTS_URL || "/announcements.json";

function isAnnouncement(value: unknown): value is Announcement {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.message === "string" &&
    (candidate.severity === "info" ||
      candidate.severity === "success" ||
      candidate.severity === "warning") &&
    (candidate.link === undefined || typeof candidate.link === "string") &&
    (candidate.version === undefined || typeof candidate.version === "string") &&
    (candidate.changelog === undefined || typeof candidate.changelog === "string")
  );
}

function loadDismissed(): Set<string> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string"));
  } catch {
    return new Set();
  }
}

function saveDismissed(ids: Set<string>): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // Ignore quota / availability errors — dismissal just won't persist.
  }
}

/**
 * Loads the announcement feed and filters out ids the user has already
 * dismissed. Dismissals persist in localStorage per id (never resurface)
 * and stay in sync across tabs; announcements with a new id always show.
 */
export function useAnnouncements(): UseAnnouncementsResult {
  const [all, setAll] = useState<Announcement[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setDismissed(loadDismissed());

    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(ANNOUNCEMENTS_URL, { cache: "no-store" });
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        const data: unknown = await res.json();
        if (!cancelled && Array.isArray(data)) {
          setAll(data.filter(isAnnouncement));
        }
      } catch {
        // Silently degrade — no banner if the feed is unavailable.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key === STORAGE_KEY) {
        setDismissed(loadDismissed());
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const dismiss = useCallback((id: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      saveDismissed(next);
      return next;
    });
  }, []);

  const announcements = all.filter((a) => !dismissed.has(a.id));

  return { announcements, loading, dismiss };
}
