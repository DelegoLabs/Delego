"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildGasFeeEstimate,
  fetchGasFeeEstimate,
  isFeeAboveUserLimit,
  type FeeEstimateSource,
  type GasFeeEstimate,
  type GasFeeEstimateResult,
} from "../lib/feeSurge";
import {
  DEFAULT_MAX_FEE_CAP_STROOPS,
  readMaxFeeCapStroops,
  writeMaxFeeCapStroops,
} from "../lib/maxFeeCap";
import { useNetwork } from "./useNetwork";

export interface FeeSurgeGuardState {
  /** The latest fee estimate, or null while the first load is in flight. */
  estimate: GasFeeEstimate | null;
  /** True while a fee estimate is being fetched. */
  loading: boolean;
  /** Where the current estimate came from. */
  source: FeeEstimateSource | "loading";
  /** The user's configured max-fee comfort limit, in stroops. */
  maxFeeStroops: string;
  /** True when the recommended network fee is above the user's limit. */
  isAboveLimit: boolean;
  /** Persists a new comfort limit. Returns false when the value is invalid. */
  setMaxFeeStroops: (value: string) => boolean;
  /** Re-fetches the fee estimate. */
  refresh: () => void;
  /**
   * Resolves with the current estimate, waiting for an in-flight fetch to
   * settle first. Callers that need a guaranteed answer (the transaction
   * flow deciding whether to warn) use this so a surge can't slip through
   * the guard while the stats request is still in flight.
   */
  whenReady: () => Promise<GasFeeEstimate | null>;
}

/**
 * Client-side gas fee surge guard (#1002).
 *
 * Combines two things: the user's own max-fee comfort limit (persisted in
 * localStorage) and the live network fee estimate published by Horizon's
 * fee-stats feed. `isAboveLimit` is the signal the transaction flow uses to
 * decide whether to ask the user before paying a surge fee.
 *
 * The estimate is advisory: a Horizon outage leaves the estimate at its
 * fallback and never prevents a transaction from being signed.
 */
export function useFeeSurgeGuard(): FeeSurgeGuardState {
  const { network } = useNetwork();
  const [maxFeeStroops, setMaxFeeStroopsState] = useState(
    DEFAULT_MAX_FEE_CAP_STROOPS
  );
  const [result, setResult] = useState<GasFeeEstimateResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshToken, setRefreshToken] = useState(0);

  // The in-flight request, so `whenReady` can await it.
  const pendingRef = useRef<Promise<void> | null>(null);
  const latestRef = useRef<GasFeeEstimateResult | null>(null);

  // Read the persisted ceiling after mount so the server and first client
  // render agree (same pattern as hooks/useNetwork.tsx).
  useEffect(() => {
    setMaxFeeStroopsState(readMaxFeeCapStroops());
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const pending = fetchGasFeeEstimate(
      network.horizonUrl,
      maxFeeStroops
    ).then((next) => {
      latestRef.current = next;
      if (cancelled) return;
      setResult(next);
      setLoading(false);
    });
    pendingRef.current = pending;
    return () => {
      cancelled = true;
    };
  }, [network.horizonUrl, maxFeeStroops, refreshToken]);

  /**
   * The estimate with the *current* comfort limit applied. The network fees
   * come from Horizon; the limit is local, so changing it re-derives the
   * estimate without another network round-trip.
   */
  const estimate = useMemo<GasFeeEstimate | null>(() => {
    if (!result) return null;
    return buildGasFeeEstimate({
      baseFeeStroops: result.estimate.baseFeeStroops,
      recommendedFeeStroops: result.estimate.recommendedFeeStroops,
      userConfiguredMaxFeeStroops: maxFeeStroops,
    });
  }, [result, maxFeeStroops]);

  const setMaxFeeStroops = useCallback((value: string) => {
    const stored = writeMaxFeeCapStroops(value);
    if (stored) {
      setMaxFeeStroopsState(readMaxFeeCapStroops());
    }
    return stored;
  }, []);

  const refresh = useCallback(() => {
    setRefreshToken((token) => token + 1);
  }, []);

  const isAboveLimit = useMemo(
    () => (estimate ? isFeeAboveUserLimit(estimate) : false),
    [estimate]
  );

  const whenReady = useCallback(async (): Promise<GasFeeEstimate | null> => {
    const current = latestRef.current;
    if (current) {
      return buildGasFeeEstimate({
        baseFeeStroops: current.estimate.baseFeeStroops,
        recommendedFeeStroops: current.estimate.recommendedFeeStroops,
        userConfiguredMaxFeeStroops: maxFeeStroops,
      });
    }
    const pending = pendingRef.current;
    if (!pending) return null;
    try {
      await pending;
    } catch {
      return null;
    }
    const latest = latestRef.current;
    if (!latest) return null;
    return buildGasFeeEstimate({
      baseFeeStroops: latest.estimate.baseFeeStroops,
      recommendedFeeStroops: latest.estimate.recommendedFeeStroops,
      userConfiguredMaxFeeStroops: maxFeeStroops,
    });
  }, [maxFeeStroops]);

  return {
    estimate,
    loading,
    source: result?.source ?? "loading",
    maxFeeStroops,
    isAboveLimit,
    setMaxFeeStroops,
    refresh,
    whenReady,
  };
}
