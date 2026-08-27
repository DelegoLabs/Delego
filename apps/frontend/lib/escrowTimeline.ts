import type { ActivityTimelineEvent, ActivityTone } from "@delegolabs/ui";

/**
 * Append-only activity log for a single escrow, shared by the cancellation
 * grace flow (#580) and the extension-request flow (#577) so both can post
 * entries — including optimistic ones pending on-chain confirmation — to the
 * same timeline surfaced in the UI.
 */
export interface EscrowTimelineEntry {
  id: string;
  type: string;
  title: string;
  description?: string;
  /** ISO-8601 timestamp. */
  timestamp: string;
  /**
   * Lifecycle of the entry itself: `pending` while an optimistic entry is
   * awaiting confirmation (e.g. on-chain), `confirmed` once settled,
   * `failed` if the underlying action was rolled back.
   */
  status: "pending" | "confirmed" | "failed";
  tone?: ActivityTone;
}

const STORAGE_PREFIX = "delego:escrow-timeline:";

function storageKey(escrowId: string): string {
  return `${STORAGE_PREFIX}${escrowId}`;
}

/** Reads the persisted timeline for an escrow. Never throws (fails to `[]`). */
export function readTimelineEntries(escrowId: string): EscrowTimelineEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(escrowId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Persists the timeline for an escrow. Never throws (silently no-ops). */
export function writeTimelineEntries(
  escrowId: string,
  entries: EscrowTimelineEntry[]
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(escrowId), JSON.stringify(entries));
  } catch {
    // Storage unavailable (private mode, quota) — the timeline still works
    // in-memory for the current session, it just won't survive a reload.
  }
}

function toneForStatus(status: EscrowTimelineEntry["status"]): ActivityTone {
  if (status === "failed") return "failed";
  if (status === "pending") return "pending";
  return "success";
}

/** Maps persisted entries to the shape `<ActivityTimeline>` renders. */
export function toActivityTimelineEvents(
  entries: EscrowTimelineEntry[]
): ActivityTimelineEvent[] {
  return entries.map((entry) => ({
    id: entry.id,
    type: entry.type,
    title: entry.title,
    description: entry.description,
    timestamp: new Date(entry.timestamp),
    tone: entry.tone ?? toneForStatus(entry.status),
  }));
}
