"use client";

import { useEffect, useMemo, useState } from "react";

/** One strict-receive route from Horizon, with slippage applied to the source cap. */
export interface PathPaymentRoute {
  sourceAsset: string;
  destinationAsset: string;
  sourceAmountMax: string;
  destinationAmount: string;
  path: string[];
  estimatedSlippagePercent: number;
  liquidityPoolFeeStroops: string;
}

export interface PathQuoteResponse {
  routes: PathPaymentRoute[];
  bestRouteIndex: number;
  expiresAt: number;
}

export interface SlippageCalculationResult {
  priceImpactPercentage: number;
  isZeroImpact: boolean;
  formattedSlippage: string;
}

/** Quotes stay usable for 30s before the hook asks Horizon again. */
export const PATH_QUOTE_TTL_MS = 30_000;

/** Warn when estimated price impact is above this percent (#901). */
export const PRICE_IMPACT_WARNING_PERCENT = 2.5;

const STROOPS_PER_UNIT = 10_000_000;
/** Stellar AMM pools charge 30 basis points per hop. */
const POOL_FEE_RATE = 0.003;
const POOL_FEE_IMPACT_PERCENT = 0.3;

export interface HorizonPathAsset {
  asset_type: string;
  asset_code?: string;
  asset_issuer?: string;
}

export interface HorizonStrictReceiveRecord {
  source_asset_type: string;
  source_asset_code?: string;
  source_asset_issuer?: string;
  source_amount: string;
  destination_asset_type: string;
  destination_asset_code?: string;
  destination_asset_issuer?: string;
  destination_amount: string;
  path?: HorizonPathAsset[];
}

interface RawRoute {
  sourceAsset: string;
  destinationAsset: string;
  sourceAmount: string;
  destinationAmount: string;
  path: string[];
}

export function assetLabel(assetType: string, assetCode?: string): string {
  if (assetType === "native") return "XLM";
  if (assetType === "liquidity_pool_shares") return "AMM pool";
  return assetCode ?? assetType;
}

export function maxSourceAmount(sourceAmount: string, slippagePercent: number): string {
  const amount = Number(sourceAmount);
  if (!Number.isFinite(amount) || amount < 0) return "0.0000000";
  const slip = Number.isFinite(slippagePercent) ? Math.max(0, slippagePercent) : 0;
  return (amount * (1 + slip / 100)).toFixed(7);
}

export function liquidityPoolFeeStroops(destinationAmount: string, hopCount: number): string {
  const destination = Number(destinationAmount);
  if (!Number.isFinite(destination) || destination <= 0 || hopCount <= 0) return "0";
  return Math.round(destination * POOL_FEE_RATE * hopCount * STROOPS_PER_UNIT).toString();
}

/**
 * Slippage/price-impact calculation that is safe against zero-fee routes and
 * 1:1 stablecoin pegs, where a naive division by zero would yield `NaN%`.
 */
export function calculateSlippage(
  sourceAmount: string | number,
  destinationAmount: string | number,
  hopCount = 0
): SlippageCalculationResult {
  const source = Number(sourceAmount);
  const destination = Number(destinationAmount);

  if (
    !Number.isFinite(source) ||
    !Number.isFinite(destination) ||
    source <= 0 ||
    destination <= 0
  ) {
    return { priceImpactPercentage: 0, isZeroImpact: true, formattedSlippage: "0.00%" };
  }

  const poolImpact = hopCount > 0 ? hopCount * POOL_FEE_IMPACT_PERCENT : 0;
  const deviation = ((source - destination) / destination) * 100;
  const rawImpact = Number.isFinite(deviation) ? Math.max(0, deviation) : 0;
  const priceImpactPercentage = Number(Math.max(rawImpact, poolImpact).toFixed(2));

  if (priceImpactPercentage === 0) {
    return { priceImpactPercentage: 0, isZeroImpact: true, formattedSlippage: "0.00%" };
  }

  const formattedSlippage =
    priceImpactPercentage < 0.01 ? "< 0.01%" : `${priceImpactPercentage.toFixed(2)}%`;

  return { priceImpactPercentage, isZeroImpact: false, formattedSlippage };
}

export function rawSourceAmount(route: PathPaymentRoute): number {
  const max = Number(route.sourceAmountMax);
  const divisor = 1 + route.estimatedSlippagePercent / 100;
  if (!Number.isFinite(max) || divisor <= 0) return 0;
  return max / divisor;
}

/**
 * Price impact of `routes[index]` against the cheapest route, floored by the
 * 30 bps AMM fee on each intermediate hop.
 */
export function priceImpactForRoute(routes: PathPaymentRoute[], index: number): number {
  const route = routes[index];
  if (!route) return 0;
  const sources = routes.map(rawSourceAmount);
  const best = Math.min(...sources);
  const selected = sources[index] ?? 0;
  const deviation = best > 0 ? Math.max(0, ((selected - best) / best) * 100) : 0;
  const poolImpact = route.path.length * POOL_FEE_IMPACT_PERCENT;
  return Number(Math.max(deviation, poolImpact).toFixed(2));
}

export function strictReceiveQuery(input: {
  sourceAssetParam: string;
  destinationAsset: string;
  destinationIssuer?: string | null;
  destinationAmount: string;
}): string {
  const params = new URLSearchParams();
  params.set("source_assets", input.sourceAssetParam);
  params.set("destination_amount", input.destinationAmount);
  if (input.destinationAsset === "XLM") {
    params.set("destination_asset_type", "native");
  } else {
    params.set(
      "destination_asset_type",
      input.destinationAsset.length <= 4 ? "credit_alphanum4" : "credit_alphanum12"
    );
    params.set("destination_asset_code", input.destinationAsset);
    if (input.destinationIssuer) {
      params.set("destination_asset_issuer", input.destinationIssuer);
    }
  }
  return params.toString();
}

export function parseStrictReceiveRecords(records: HorizonStrictReceiveRecord[]): RawRoute[] {
  return records
    .filter((record) => Number(record.source_amount) > 0 && Number(record.destination_amount) > 0)
    .map((record) => ({
      sourceAsset: assetLabel(record.source_asset_type, record.source_asset_code),
      destinationAsset: assetLabel(record.destination_asset_type, record.destination_asset_code),
      sourceAmount: record.source_amount,
      destinationAmount: record.destination_amount,
      path: (record.path ?? []).map((hop) => assetLabel(hop.asset_type, hop.asset_code)),
    }));
}

export function toPathQuoteResponse(
  rawRoutes: RawRoute[],
  slippageTolerancePercent: number,
  now = Date.now()
): PathQuoteResponse | null {
  if (rawRoutes.length === 0) return null;
  const routes: PathPaymentRoute[] = rawRoutes.map((route) => ({
    sourceAsset: route.sourceAsset,
    destinationAsset: route.destinationAsset,
    sourceAmountMax: maxSourceAmount(route.sourceAmount, slippageTolerancePercent),
    destinationAmount: route.destinationAmount,
    path: route.path,
    estimatedSlippagePercent: slippageTolerancePercent,
    liquidityPoolFeeStroops: liquidityPoolFeeStroops(route.destinationAmount, route.path.length),
  }));
  let bestRouteIndex = 0;
  let bestSource = rawSourceAmount(routes[0]);
  for (let i = 1; i < routes.length; i += 1) {
    const source = rawSourceAmount(routes[i]);
    if (source < bestSource) {
      bestSource = source;
      bestRouteIndex = i;
    }
  }
  return {
    routes,
    bestRouteIndex,
    expiresAt: now + PATH_QUOTE_TTL_MS,
  };
}

export function stroopsToDecimal(stroops: string | number | bigint | null | undefined): string {
  if (stroops == null || stroops === "") return "0";
  try {
    const value = BigInt(stroops);
    if (value <= 0n) return "0";
    const whole = value / BigInt(STROOPS_PER_UNIT);
    const fraction = (value % BigInt(STROOPS_PER_UNIT)).toString().padStart(7, "0").replace(/0+$/, "");
    return fraction ? `${whole.toString()}.${fraction}` : whole.toString();
  } catch {
    return "0";
  }
}

export interface UsePathPaymentQuoteInput {
  horizonUrl: string;
  sourceAssetParam: string | null;
  destinationAsset: string;
  destinationIssuer?: string | null;
  destinationAmount: string;
  slippageTolerancePercent: number;
}

export function usePathPaymentQuote({
  horizonUrl,
  sourceAssetParam,
  destinationAsset,
  destinationIssuer,
  destinationAmount,
  slippageTolerancePercent,
}: UsePathPaymentQuoteInput): {
  quote: PathQuoteResponse | null;
  priceImpactPercent: number;
  loading: boolean;
  error: string | null;
} {
  const [rawRoutes, setRawRoutes] = useState<RawRoute[] | null>(null);
  const [fetchedAt, setFetchedAt] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const needsIssuer = destinationAsset !== "XLM" && !destinationIssuer;
  const amount = Number(destinationAmount);
  const canQuote =
    Boolean(sourceAssetParam) &&
    Boolean(horizonUrl) &&
    Number.isFinite(amount) &&
    amount > 0 &&
    !needsIssuer;

  useEffect(() => {
    if (!canQuote || !sourceAssetParam) {
      setRawRoutes(null);
      setLoading(false);
      setError(
        needsIssuer
          ? "Settlement asset issuer is required before a cross-asset quote can be loaded."
          : null
      );
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const query = strictReceiveQuery({
      sourceAssetParam,
      destinationAsset,
      destinationIssuer,
      destinationAmount,
    });

    fetch(`${horizonUrl.replace(/\/$/, "")}/paths/strict-receive?${query}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Horizon path quote failed (${res.status}).`);
        return (await res.json()) as { _embedded?: { records?: HorizonStrictReceiveRecord[] } };
      })
      .then((json) => {
        if (controller.signal.aborted) return;
        const parsed = parseStrictReceiveRecords(json._embedded?.records ?? []);
        setRawRoutes(parsed);
        setFetchedAt(Date.now());
        if (parsed.length === 0) {
          setError(`No path payment route available for this ${destinationAsset} invoice.`);
        }
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setRawRoutes(null);
        setError(err instanceof Error ? err.message : "Path quote failed.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [
    canQuote,
    needsIssuer,
    sourceAssetParam,
    destinationAsset,
    destinationIssuer,
    destinationAmount,
    horizonUrl,
    reloadKey,
  ]);

  const quote = useMemo(
    () => (rawRoutes ? toPathQuoteResponse(rawRoutes, slippageTolerancePercent, fetchedAt) : null),
    [rawRoutes, slippageTolerancePercent, fetchedAt]
  );

  useEffect(() => {
    if (!quote) return;
    const delay = Math.max(0, quote.expiresAt - Date.now());
    const timer = window.setTimeout(() => setReloadKey((key) => key + 1), delay);
    return () => window.clearTimeout(timer);
  }, [quote]);

  const priceImpactPercent = quote ? priceImpactForRoute(quote.routes, quote.bestRouteIndex) : 0;

  return { quote, priceImpactPercent, loading, error };
}
