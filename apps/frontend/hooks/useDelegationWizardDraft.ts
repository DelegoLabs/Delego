"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createEmptyDraft,
  normalizeDraft,
  DELEGATION_WIZARD_STEPS,
  type DelegationWizardDraft,
  type DelegationWizardStepId,
} from "../lib/delegationWizard";

const STORAGE_KEY = "delego_delegation_wizard_draft";

interface StoredDraft {
  draft: DelegationWizardDraft;
  stepIndex: number;
}

function isStoredDraft(value: unknown): value is StoredDraft {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<StoredDraft>;
  return (
    typeof candidate.draft === "object" &&
    candidate.draft !== null &&
    typeof candidate.stepIndex === "number" &&
    candidate.stepIndex >= 0 &&
    candidate.stepIndex < DELEGATION_WIZARD_STEPS.length
  );
}

/**
 * Persists the in-progress delegation wizard draft to localStorage (#523) so
 * a refresh or accidental navigation away doesn't lose the user's progress.
 * Mirrors hooks/useCurrency.tsx's try/catch + hydrated-flag idiom — reads are
 * deferred to a post-mount effect to avoid SSR hydration mismatches.
 */
export function useDelegationWizardDraft(defaultWalletId = "") {
  const [draft, setDraft] = useState<DelegationWizardDraft>(() =>
    createEmptyDraft(defaultWalletId)
  );
  const [stepIndex, setStepIndex] = useState(0);
  const [hasStoredDraft, setHasStoredDraft] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (isStoredDraft(parsed)) {
          setHasStoredDraft(true);
        }
      }
    } catch {
      // localStorage may be unavailable (private mode) — start with an empty draft.
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read once on mount only
  }, []);

  const persist = useCallback(
    (next: DelegationWizardDraft, nextStepIndex: number) => {
      try {
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            draft: next,
            stepIndex: nextStepIndex,
          } satisfies StoredDraft)
        );
      } catch {
        // Ignore persistence failures — the in-memory draft still updates.
      }
    },
    []
  );

  const updateDraft = useCallback(
    (next: DelegationWizardDraft) => {
      setDraft(next);
      persist(next, stepIndex);
    },
    [persist, stepIndex]
  );

  const goToStep = useCallback(
    (nextIndex: number) => {
      setStepIndex(nextIndex);
      persist(draft, nextIndex);
    },
    [draft, persist]
  );

  const resumeDraft = useCallback(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (isStoredDraft(parsed)) {
          setDraft(normalizeDraft(parsed.draft, defaultWalletId));
          setStepIndex(parsed.stepIndex);
        }
      }
    } catch {
      // Ignore — the current in-memory draft is left as-is.
    }
    setHasStoredDraft(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- defaultWalletId is read when the user resumes
  }, []);

  const discardDraft = useCallback(() => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore — nothing left to clean up client-side either way.
    }
    setDraft(createEmptyDraft(defaultWalletId));
    setStepIndex(0);
    setHasStoredDraft(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- defaultWalletId intentionally not tracked as a dep; re-reads happen via a fresh discard call
  }, []);

  const clearDraft = useCallback(() => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore — nothing left to clean up client-side either way.
    }
  }, []);

  const stepId: DelegationWizardStepId = DELEGATION_WIZARD_STEPS[stepIndex];

  return {
    draft,
    updateDraft,
    stepIndex,
    stepId,
    goToStep,
    hasStoredDraft,
    resumeDraft,
    discardDraft,
    clearDraft,
    hydrated,
  };
}
