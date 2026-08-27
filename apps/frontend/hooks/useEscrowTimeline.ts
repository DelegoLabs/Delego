"use client";

import { useCallback, useState } from "react";
import type { ActivityTimelineEvent } from "@delegolabs/ui";
import {
  readTimelineEntries,
  writeTimelineEntries,
  toActivityTimelineEvents,
  type EscrowTimelineEntry,
} from "../lib/escrowTimeline";

export interface UseEscrowTimelineResult {
  entries: EscrowTimelineEntry[];
  events: ActivityTimelineEvent[];
  /** Appends a new entry (assigns an id if none is given) and persists it. Returns the id. */
  append: (
    entry: Omit<EscrowTimelineEntry, "id"> & { id?: string }
  ) => string;
  /** Patches an existing entry in place (e.g. pending → confirmed/failed). */
  update: (id: string, patch: Partial<EscrowTimelineEntry>) => void;
  /** Removes an entry outright — used to roll back an optimistic insert. */
  remove: (id: string) => void;
}

let nextId = 0;

/** Per-escrow activity timeline, persisted across reloads (#580, #577). */
export function useEscrowTimeline(escrowId: string): UseEscrowTimelineResult {
  const [entries, setEntries] = useState<EscrowTimelineEntry[]>(() =>
    readTimelineEntries(escrowId)
  );

  const append = useCallback(
    (entry: Omit<EscrowTimelineEntry, "id"> & { id?: string }) => {
      const id = entry.id ?? `${entry.type}-${Date.now()}-${nextId++}`;
      const full: EscrowTimelineEntry = { ...entry, id };
      setEntries((prev) => {
        const next = [...prev, full];
        writeTimelineEntries(escrowId, next);
        return next;
      });
      return id;
    },
    [escrowId]
  );

  const update = useCallback(
    (id: string, patch: Partial<EscrowTimelineEntry>) => {
      setEntries((prev) => {
        const next = prev.map((e) => (e.id === id ? { ...e, ...patch } : e));
        writeTimelineEntries(escrowId, next);
        return next;
      });
    },
    [escrowId]
  );

  const remove = useCallback(
    (id: string) => {
      setEntries((prev) => {
        const next = prev.filter((e) => e.id !== id);
        writeTimelineEntries(escrowId, next);
        return next;
      });
    },
    [escrowId]
  );

  return { entries, events: toActivityTimelineEvents(entries), append, update, remove };
}
