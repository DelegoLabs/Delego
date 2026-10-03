"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { User, UserPreferences } from "@delegolabs/types";
import { buildAccountExport, type ExportProgress } from "../lib/export";
import { downloadBlob } from "../lib/download";
import type { SessionKeyWorkerMessage } from "../workers/sessionKeyWorker";
import { initSessionKeyWorker } from "../lib/session/sessionKeyClient";

export type ExportStatus = "idle" | "running" | "done" | "cancelled" | "error";

export interface UseAccountExportResult {
  status: ExportStatus;
  progress: ExportProgress | null;
  error: string | null;
  start: (user: User, preferences: UserPreferences) => void;
  cancel: () => void;
}

/** Orchestrates the whole-account export: kicks off buildAccountExport, tracks progress, and triggers the download when it resolves. */
export function useAccountExport(): UseAccountExportResult {
  const [status, setStatus] = useState<ExportStatus>("idle");
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const workerRef = useRef<Worker | null>(null);

  const start = useCallback((user: User, preferences: UserPreferences) => {
    // Ephemeral session signing keys live only inside the worker; never in localStorage.
    if (typeof window !== "undefined" && !workerRef.current) {
      workerRef.current = initSessionKeyWorker();
      const init: SessionKeyWorkerMessage = { type: "INIT_KEY" };
      workerRef.current.postMessage(init);
    }
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setStatus("running");
    setError(null);
    setProgress(null);

    buildAccountExport(user, preferences, {
      signal: controller.signal,
      onProgress: setProgress,
    })
      .then((blob) => {
        if (controller.signal.aborted) return;
        downloadBlob(`delego-account-export-${Date.now()}.json`, blob);
        setStatus("done");
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") {
          setStatus("cancelled");
          return;
        }
        setStatus("error");
        setError(err instanceof Error ? err.message : "Export failed");
      });
  }, []);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  useEffect(
    () => () => {
      controllerRef.current?.abort();
      // Wipe ephemeral key memory on unmount / page close.
      if (workerRef.current) {
        const clear: SessionKeyWorkerMessage = { type: "CLEAR_KEY" };
        workerRef.current.postMessage(clear);
        workerRef.current.terminate();
        workerRef.current = null;
      }
    },
    [],
  );

  return { status, progress, error, start, cancel };
}
