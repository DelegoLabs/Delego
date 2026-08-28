"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchReceipt,
  type ReceiptKind,
  type ReceiptFetchResult,
} from "../services/receiptGetters";
import {
  compareReceiptFields,
  type ReceiptComparisonResult,
} from "../lib/receiptMismatch";
import { useNetwork } from "./useNetwork";

export interface UseReceiptVerificationResult {
  status: "idle" | "loading" | "loaded" | "error";
  receipt: ReceiptFetchResult | null;
  comparison: ReceiptComparisonResult | null;
  error: string | null;
  /** Re-fetches bypassing the cache — for an explicit "Refresh" action. */
  refresh: () => void;
}

/**
 * Fetches an on-chain receipt getter for `key` and compares it against
 * `localData` over `compareFields` (#581). `contractAddress` may be null
 * while the network's contract config hasn't loaded — the hook stays
 * `idle` until it's available rather than issuing a doomed RPC call.
 */
export function useReceiptVerification(
  kind: ReceiptKind,
  key: string,
  contractAddress: string | null,
  localData: Record<string, unknown>,
  compareFields: readonly string[]
): UseReceiptVerificationResult {
  const { network, networkId } = useNetwork();
  const [status, setStatus] =
    useState<UseReceiptVerificationResult["status"]>("idle");
  const [receipt, setReceipt] = useState<ReceiptFetchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (bypassCache: boolean) => {
      if (!contractAddress) {
        setStatus("idle");
        return;
      }

      setStatus("loading");
      setError(null);

      const outcome = await fetchReceipt(
        network,
        networkId,
        contractAddress,
        kind,
        key,
        bypassCache
      );

      if (outcome.ok) {
        setReceipt(outcome.result);
        setStatus("loaded");
      } else {
        setError(outcome.error);
        setStatus("error");
      }
    },
    [network, networkId, contractAddress, kind, key]
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  const refresh = useCallback(() => {
    void load(true);
  }, [load]);

  const comparison = receipt
    ? compareReceiptFields(localData, receipt.data, compareFields)
    : null;

  return { status, receipt, comparison, error, refresh };
}
