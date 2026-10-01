"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createEmptyDisputeDraft,
  normalizeDisputeDraft,
  type DisputeDraft,
} from "../lib/disputeDraft";

const STORAGE_KEY_PREFIX = "delego_dispute_draft";

function storageKeyFor(escrowId: string | undefined): string | null {
  return escrowId ? `${STORAGE_KEY_PREFIX}:${escrowId}` : null;
}

/**
 * Persists the in-progress "open dispute" modal draft (reason, description,
 * evidence URLs) to sessionStorage, keyed by escrow id (#746), so a browser
 * refresh — or an accidental modal close — doesn't lose what the buyer typed.
 *
 * Mirrors hooks/useDelegationWizardDraft.ts: storage is only touched after
 * mount (sessionStorage doesn't exist during SSR, and reading it during render
 * would cause hydration drift), JSON parsing is guarded, and every access
 * runs inside try/catch so disabled/private-mode storage degrades to an
 * in-memory draft. Unlike the delegation wizard this restores silently on
 * mount rather than prompting — the modal is already on screen, so there's no
 * context switch for the user to confirm.
 */
export function useDisputeDraft(escrowId: string | undefined) {
  const storageKey = storageKeyFor(escrowId);
  const [draft, setDraft] = useState<DisputeDraft>(() =>
    createEmptyDisputeDraft()
  );
  const [hydrated, setHydrated] = useState(false);

  // Restore once after mount, and again whenever the escrow changes so a draft
  // never leaks from one escrow into another.
  useEffect(() => {
    if (!storageKey || typeof window === "undefined") {
      setDraft(createEmptyDisputeDraft());
      setHydrated(true);
      return;
    }
    let restored: DisputeDraft | null = null;
    try {
      const raw = window.sessionStorage.getItem(storageKey);
      if (raw) restored = normalizeDisputeDraft(JSON.parse(raw));
    } catch {
      // sessionStorage unavailable, or the stored value isn't JSON — start empty.
      restored = null;
    }
    setDraft(restored ?? createEmptyDisputeDraft());
    setHydrated(true);
  }, [storageKey]);

  const persist = useCallback(
    (next: DisputeDraft) => {
      if (!storageKey || typeof window === "undefined") return;
      try {
        window.sessionStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // Ignore persistence failures — the in-memory draft still updates.
      }
    },
    [storageKey]
  );

  const updateDraft = useCallback(
    (next: DisputeDraft) => {
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
        // Ignore — there's nothing left to clean up client-side either way.
      }
    }
    setDraft(createEmptyDisputeDraft());
  }, [storageKey]);

  return { draft, updateDraft, clearDraft, hydrated };
}
