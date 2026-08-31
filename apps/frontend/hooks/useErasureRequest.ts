"use client";

import { useCallback, useEffect, useState } from "react";
import type { ErasureRequest } from "@delegolabs/types";
import { requestDataErasure, cancelDataErasure } from "../services/erasure";

const STORAGE_KEY = "delego_erasure_request";

function readStored(): ErasureRequest | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ErasureRequest) : null;
  } catch {
    return null;
  }
}

function writeStored(request: ErasureRequest | null): void {
  if (typeof window === "undefined") return;
  try {
    if (request) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(request));
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Best effort — the UI still reflects the in-memory state for this tab.
  }
}

export interface UseErasureRequestResult {
  /** The last-known erasure request state, or null if none is pending/on record. */
  request: ErasureRequest | null;
  requesting: boolean;
  cancelling: boolean;
  error: string | null;
  /** Logs a new server-side erasure request. Server-confirmed only — never marks pending optimistically. */
  submit: () => Promise<void>;
  /** Cancels a pending request while still within its cooldown window. */
  cancel: () => Promise<void>;
}

/**
 * State for the server-side data-erasure request lifecycle (#610).
 *
 * Deliberately request/cancel-only, never destructive client-side: the
 * account isn't touched by anything in this hook. `request` only ever
 * reflects what the server most recently confirmed — a `submit()`/`cancel()`
 * call that fails leaves the prior confirmed state in place rather than
 * guessing at an optimistic update, since an erroneous optimistic "pending"
 * or "cancelled" here would misrepresent something the backend hasn't
 * actually agreed to. Persisted to localStorage so the pending state
 * survives a reload; the persisted copy is just a cache of the last
 * server answer, not a second source of truth.
 */
export function useErasureRequest(): UseErasureRequestResult {
  const [request, setRequest] = useState<ErasureRequest | null>(() => readStored());
  const [requesting, setRequesting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    writeStored(request);
  }, [request]);

  const submit = useCallback(async () => {
    setRequesting(true);
    setError(null);
    try {
      const res = await requestDataErasure();
      if (res.error) throw new Error(res.error.message);
      if (res.data) setRequest(res.data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to submit the erasure request."
      );
    } finally {
      setRequesting(false);
    }
  }, []);

  const cancel = useCallback(async () => {
    setCancelling(true);
    setError(null);
    try {
      const res = await cancelDataErasure();
      if (res.error) throw new Error(res.error.message);
      setRequest(res.data ?? null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to cancel the erasure request."
      );
    } finally {
      setCancelling(false);
    }
  }, []);

  return { request, requesting, cancelling, error, submit, cancel };
}
