import { useCallback, useEffect, useRef, useState } from "react";

export type KycVerificationStatus = "pending" | "verified" | "rejected";

export interface KycVerificationState {
  documentId: string;
  merchantId: string;
  status: KycVerificationStatus;
  updatedAt: string;
  reason?: string;
}

export interface UseKycStatusOptions {
  /** Gateway API base URL. Defaults to a same-origin path. */
  apiBaseUrl?: string;
  /** Polling interval in milliseconds. Defaults to 5000. */
  intervalMs?: number;
  /** Whether to start polling immediately. Defaults to true. */
  enabled?: boolean;
}

export interface UseKycStatusReturn {
  state: KycVerificationState | null;
  isPolling: boolean;
  error: string | null;
  refresh: () => Promise<KycVerificationState | null>;
}

export function useKycStatus(
  documentId: string | null,
  options: UseKycStatusOptions = {},
): UseKycStatusReturn {
  const { apiBaseUrl = "/api", intervalMs = 5000, enabled = true } = options;
  const [state, setState] = useState<KycVerificationState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchStatus = useCallback(async (): Promise<KycVerificationState | null> => {
    if (!documentId) return null;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch(
        `${apiBaseUrl}/kyc/documents/${encodeURIComponent(documentId)}/status`,
        { credentials: "include", signal: controller.signal },
      );
      if (!response.ok) {
        throw new Error(`Unable to fetch KYC status (status ${response.status}).`);
      }
      const json = (await response.json()) as KycVerificationState;
      setState(json);
      setError(null);
      return json;
    } catch (err) {
      if ((err as DOMException).name === "AbortError") return null;
      setError(err instanceof Error ? err.message : "Unable to fetch KYC status.");
      return null;
    } finally {
      abortRef.current = null;
    }
  }, [apiBaseUrl, documentId]);

  useEffect(() => {
    if (!enabled || !documentId) {
      setIsPolling(false);
      return;
    }

    let cancelled = false;
    setIsPolling(true);

    const poll = async () => {
      const next = await fetchStatus();
      if (cancelled) return;
      if (next && next.status !== "pending") {
        setIsPolling(false);
        return;
      }
      timerRef.current = setTimeout(poll, intervalMs);
    };

    void poll();

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      abortRef.current?.abort();
      setIsPolling(false);
    };
  }, [documentId, enabled, intervalMs, fetchStatus]);

  return { state, isPolling, error, refresh: fetchStatus };
}
