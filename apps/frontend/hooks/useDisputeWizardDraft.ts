"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createEmptyDisputeFormDraft,
  normalizeDisputeWizardPersistedDraft,
  toDisputeFormDraft,
  toPersistedDisputeDraft,
  type DisputeFormDraft,
} from "../lib/disputeWizard";

const STORAGE_KEY_PREFIX = "delego_dispute_wizard_draft";

function storageKeyFor(escrowId: string | undefined): string | null {
  return escrowId ? `${STORAGE_KEY_PREFIX}:${escrowId}` : null;
}

/**
 * Session-scoped persistence for the guided dispute wizard (#1227).
 *
 * The existing `useDisputeDraft` hook stores the single-step modal's evidence
 * URL list; the wizard holds `File` objects and a different reason vocabulary,
 * so it needs its own key and normalizer. Only serializable fields are stored,
 * and every write is stamped with `savedAt` for the subtle "Draft saved at"
 * indicator. Restoration happens after mount to avoid hydration drift and is
 * wrapped in try/catch so private-mode storage degrades to an in-memory draft.
 */
interface DisputeWizardDraftController {
  draft: DisputeFormDraft;
  savedAt: string | null;
  updateDraft: (next: DisputeFormDraft) => void;
  clearDraft: () => void;
  hydrated: boolean;
}

export function useDisputeWizardDraft(escrowId: string | undefined): DisputeWizardDraftController {
  const storageKey = storageKeyFor(escrowId);
  const [draft, setDraft] = useState(createEmptyDisputeFormDraft);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!storageKey || typeof window === "undefined") {
      setDraft(createEmptyDisputeFormDraft());
      setSavedAt(null);
      setHydrated(true);
      return;
    }

    let restored: ReturnType<typeof normalizeDisputeWizardPersistedDraft> = null;
    try {
      const raw = window.sessionStorage.getItem(storageKey);
      if (raw) restored = normalizeDisputeWizardPersistedDraft(JSON.parse(raw));
    } catch {
      restored = null;
    }

    setDraft(restored ? toDisputeFormDraft(restored) : createEmptyDisputeFormDraft());
    setSavedAt(restored?.savedAt ?? null);
    setHydrated(true);
  }, [storageKey]);

  const persist = useCallback(
    (next: Parameters<typeof toPersistedDisputeDraft>[0]) => {
      if (!storageKey || typeof window === "undefined") return;
      const timestamp = new Date().toISOString();
      try {
        window.sessionStorage.setItem(
          storageKey,
          JSON.stringify(toPersistedDisputeDraft(next, timestamp))
        );
        setSavedAt(timestamp);
      } catch {
        // Keep the in-memory draft working when storage is unavailable.
      }
    },
    [storageKey]
  );

  const updateDraft = useCallback(
    (next: DisputeFormDraft) => {
      setDraft(next);
      persist(next);
    },
    [persist]
  );

  const clearDraft = useCallback(() => {
    if (storageKey && typeof window !== "undefined") {
      try {
        window.sessionStorage.removeItem(storageKey);
      } catch {
        // Nothing else to clean up when storage is unavailable.
      }
    }
    setDraft(createEmptyDisputeFormDraft());
    setSavedAt(null);
  }, [storageKey]);

  return { draft, savedAt, updateDraft, clearDraft, hydrated };
}
