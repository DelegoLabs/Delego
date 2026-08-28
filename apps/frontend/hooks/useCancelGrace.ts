"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CancellationGrace } from "@delegolabs/types";
import {
  computeClockSkewMs,
  getGraceRemainingMs,
  reconcileGraceState,
} from "../lib/cancelGrace";
import {
  requestCancellation as apiRequestCancellation,
  undoCancellation as apiUndoCancellation,
  finalizeCancellation as apiFinalizeCancellation,
} from "../services/payments";
import { useEscrowTimeline } from "./useEscrowTimeline";
import { useNow } from "./useNow";

const STORAGE_PREFIX = "delego:cancel-grace:";

function storageKey(escrowId: string): string {
  return `${STORAGE_PREFIX}${escrowId}`;
}

function readStoredGrace(escrowId: string): CancellationGrace | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(escrowId));
    return raw ? (JSON.parse(raw) as CancellationGrace) : null;
  } catch {
    return null;
  }
}

function writeStoredGrace(escrowId: string, grace: CancellationGrace | null): void {
  if (typeof window === "undefined") return;
  try {
    if (grace) {
      window.localStorage.setItem(storageKey(escrowId), JSON.stringify(grace));
    } else {
      window.localStorage.removeItem(storageKey(escrowId));
    }
  } catch {
    // Storage unavailable — the banner still works for the current tab, it
    // just won't survive a reload.
  }
}

export interface UseCancelGraceOptions {
  escrowId: string;
  /**
   * The latest cancellation grace known from the server (e.g. embedded in
   * an escrow fetched by `useEscrows`). Pass `null`/`undefined` when the
   * escrow isn't cancelling. Whenever this identity changes, it's treated
   * as a fresh server payload and the clock-skew offset is recomputed.
   */
  serverGrace?: CancellationGrace | null;
  /** Called once the grace period elapses and the cancellation is finalized. */
  onFinalized?: (escrowId: string) => void;
  /** Called once an undo is confirmed by the server. */
  onRestored?: (escrowId: string) => void;
  /** Countdown tick interval, ms. Defaults to 1s. */
  tickMs?: number;
}

export interface UseCancelGraceResult {
  /** The grace state currently in effect (server-confirmed or optimistic), or null if not cancelling. */
  grace: CancellationGrace | null;
  /** Skew-corrected milliseconds remaining in the grace window. */
  remainingMs: number;
  /** True once remainingMs has hit 0 for the active grace (finalization in flight or done). */
  expired: boolean;
  undo: () => Promise<void>;
  undoing: boolean;
  finalizing: boolean;
  error: string | null;
}

/**
 * State machine for the cancel-within-grace-period undo flow (#580).
 *
 * - Countdown is computed strictly from the server's `graceExpiresAt` /
 *   `serverTimestamp`, corrected for the client/server clock offset — see
 *   `lib/cancelGrace.ts`.
 * - The active grace is persisted to localStorage per escrow id, so the
 *   banner survives a reload until the timer elapses or the user undoes.
 * - `undo()` restores optimistically (the banner clears immediately) while
 *   the request is in flight; if the server reports the cancellation had
 *   already finalized first, the optimistic restore is rolled back to the
 *   finalized state — the server is always the source of truth.
 * - When the countdown lapses without an undo, the cancellation is
 *   finalized and a permanent timeline event is appended.
 */
export function useCancelGrace(options: UseCancelGraceOptions): UseCancelGraceResult {
  const { escrowId, serverGrace, onFinalized, onRestored, tickMs = 1_000 } = options;
  const timeline = useEscrowTimeline(escrowId);

  const [grace, setGrace] = useState<CancellationGrace | null>(
    () => serverGrace ?? readStoredGrace(escrowId)
  );
  const [skewMs, setSkewMs] = useState(0);
  const [undoing, setUndoing] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const graceRef = useRef(grace);
  graceRef.current = grace;
  const finalizingRef = useRef(false);

  // A fresh `serverGrace` payload: adopt it, recompute skew against "now" at
  // the moment it was received, and persist it.
  useEffect(() => {
    if (serverGrace === undefined) return; // caller hasn't loaded escrow data yet
    setGrace(serverGrace);
    writeStoredGrace(escrowId, serverGrace);
    if (serverGrace) {
      setSkewMs(computeClockSkewMs(serverGrace.serverTimestamp, new Date()));
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [escrowId, serverGrace]);

  const now = useNow(tickMs);
  const remainingMs = grace ? getGraceRemainingMs(grace, now, skewMs) : 0;
  const expired = grace !== null && remainingMs <= 0;

  // Countdown lapsed without an undo: finalize and append the permanent
  // timeline event. Guarded by `finalizingRef` so a re-render mid-flight
  // (e.g. the tick interval) doesn't fire a second finalize call.
  useEffect(() => {
    if (!grace || remainingMs > 0 || finalizingRef.current) return;
    finalizingRef.current = true;
    setFinalizing(true);

    apiFinalizeCancellation(escrowId)
      .catch(() => null) // the grace window has server-verified elapsed either way
      .finally(() => {
        writeStoredGrace(escrowId, null);
        setGrace(null);
        timeline.append({
          type: "cancel_finalized",
          title: "Cancellation finalized",
          description: "The grace period elapsed without an undo.",
          timestamp: new Date().toISOString(),
          status: "confirmed",
          tone: "failed",
        });
        finalizingRef.current = false;
        setFinalizing(false);
        onFinalized?.(escrowId);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingMs, grace, escrowId]);

  const undo = useCallback(async () => {
    const previousGrace = graceRef.current;
    if (!previousGrace || undoing) return;

    setUndoing(true);
    setError(null);
    // Optimistic restore: clear the banner immediately.
    setGrace(null);
    writeStoredGrace(escrowId, null);

    try {
      const res = await apiUndoCancellation(escrowId);
      if (res.error) throw new Error(res.error.message);

      const action = reconcileGraceState(
        res.data?.status ?? "funded",
        res.data?.cancellation
      );

      if (action === "finalize") {
        // Lost the race: the server had already finalized before the undo
        // request landed. The server is the source of truth — keep it
        // cancelled and surface why, rather than trusting the optimistic
        // restore.
        setError("This cancellation already finalized before the undo could be applied.");
        timeline.append({
          type: "cancel_finalized",
          title: "Cancellation finalized",
          description: "Undo arrived after the grace period had already elapsed.",
          timestamp: new Date().toISOString(),
          status: "confirmed",
          tone: "failed",
        });
        onFinalized?.(escrowId);
      } else if (action === "keep_cancelling" && res.data?.cancellation) {
        // Server still reports an active window — trust it over the
        // optimistic restore.
        setGrace(res.data.cancellation);
        writeStoredGrace(escrowId, res.data.cancellation);
        setSkewMs(computeClockSkewMs(res.data.cancellation.serverTimestamp, new Date()));
      } else {
        timeline.append({
          type: "cancel_undone",
          title: "Cancellation undone",
          timestamp: new Date().toISOString(),
          status: "confirmed",
          tone: "success",
        });
        onRestored?.(escrowId);
      }
    } catch (err) {
      // Roll back the optimistic restore so the banner reappears and the
      // user can retry the undo.
      setGrace(previousGrace);
      writeStoredGrace(escrowId, previousGrace);
      setError(err instanceof Error ? err.message : "Failed to undo cancellation.");
    } finally {
      setUndoing(false);
    }
  }, [escrowId, undoing, onFinalized, onRestored, timeline]);

  return { grace, remainingMs, expired, undo, undoing, finalizing, error };
}

/** Kicks off a new cancellation for an escrow, entering the grace period (#580). */
export async function startCancelGrace(escrowId: string) {
  const res = await apiRequestCancellation(escrowId);
  if (!res.error && res.data) {
    writeStoredGrace(escrowId, res.data.cancellation);
  }
  return res;
}
