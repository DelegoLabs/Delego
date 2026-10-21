"use client";

import { useEffect, useId, useMemo, useState } from "react";
import type { SlippageCalculationResult } from "../../hooks/usePathPaymentQuote";
import { useNetwork } from "../../hooks/useNetwork";
import { useWallet } from "../../hooks/useWallet";
import { useBalanceHistory, type HorizonBalance } from "../../hooks/useBalanceHistory";
import {
  PRICE_IMPACT_WARNING_PERCENT,
  priceImpactForRoute,
  usePathPaymentQuote,
  type PathPaymentRoute,
  type PathQuoteResponse,
} from "../../hooks/usePathPaymentQuote";

const SLIPPAGE_PRESETS = [0.1, 0.5, 1] as const;

export interface WalletSourceAsset {
  code: string;
  issuer?: string;
  /** Horizon `source_assets` token: `native` or `CODE:ISSUER`. */
  param: string;
  balance: string;
}

export function walletSourceAssets(balances: HorizonBalance[]): WalletSourceAsset[] {
  const assets: WalletSourceAsset[] = [];
  for (const balance of balances) {
    if (balance.asset_type === "native") {
      assets.push({ code: "XLM", param: "native", balance: balance.balance });
      continue;
    }
    if (!balance.asset_code || !balance.asset_issuer) continue;
    if (balance.asset_type !== "credit_alphanum4" && balance.asset_type !== "credit_alphanum12") {
      continue;
    }
    assets.push({
      code: balance.asset_code,
      issuer: balance.asset_issuer,
      param: `${balance.asset_code}:${balance.asset_issuer}`,
      balance: balance.balance,
    });
  }
  return assets;
}

export interface PathPaymentQuoteVisualizerProps {
  destinationAsset: string;
  destinationAmount: string;
  sourceAssets: WalletSourceAsset[];
  selectedParam: string;
  onSelectAsset: (param: string) => void;
  slippageTolerancePercent: number;
  onSlippageChange: (percent: number) => void;
  quote: PathQuoteResponse | null;
  loading?: boolean;
  error?: string | null;
}

function routeNodes(route: PathPaymentRoute): string[] {
  return [route.sourceAsset, ...route.path, route.destinationAsset];
}

/**
 * Formats a slippage percentage for display, guarding against NaN/undefined
 * values produced by zero-fee or 1:1 parity routes.
 */
export function formatSlippagePercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "0.00%";
  }
  if (value <= 0) return "0.00%";
  if (value < 0.01) return "< 0.01%";
  return `${value.toFixed(2)}%`;
}

/**
 * Computes slippage for a route, returning a safe result even when the
 * destination amount is zero (zero-fee AMM pools, 1:1 stablecoin pegs).
 */
export function calculateSlippage(
  sourceAmount: number,
  destinationAmount: number,
): SlippageCalculationResult {
  if (
    !Number.isFinite(sourceAmount) ||
    !Number.isFinite(destinationAmount) ||
    destinationAmount <= 0 ||
    sourceAmount <= 0
  ) {
    return { priceImpactPercentage: 0, isZeroImpact: true, formattedSlippage: "0.00%" };
  }
  const raw = ((sourceAmount - destinationAmount) / destinationAmount) * 100;
  if (!Number.isFinite(raw) || raw <= 0) {
    return { priceImpactPercentage: 0, isZeroImpact: true, formattedSlippage: "0.00%" };
  }
  return {
    priceImpactPercentage: raw,
    isZeroImpact: false,
    formattedSlippage: formatSlippagePercent(raw),
  };
}

/**
 * Buyer-facing strict-receive quote: wallet asset picker, hop graph, and
 * slippage control (#901).
 */
export function PathPaymentQuoteVisualizer({
  destinationAsset,
  destinationAmount,
  sourceAssets,
  selectedParam,
  onSelectAsset,
  slippageTolerancePercent,
  onSlippageChange,
  quote,
  loading = false,
  error = null,
}: PathPaymentQuoteVisualizerProps) {
  const selectId = useId();
  const customId = useId();
  const [routeIndex, setRouteIndex] = useState(0);
  const [activeHop, setActiveHop] = useState(0);
  const [customMode, setCustomMode] = useState(false);

  useEffect(() => {
    setRouteIndex(quote?.bestRouteIndex ?? 0);
    setActiveHop(0);
  }, [quote]);

  const route = quote?.routes[routeIndex] ?? quote?.routes[quote.bestRouteIndex] ?? null;
  const impact = quote && route ? priceImpactForRoute(quote.routes, routeIndex) : 0;
  const nodes = useMemo(() => (route ? routeNodes(route) : []), [route]);
  const slippageDisplay = useMemo(() => {
    if (!route) return "0.00%";
    return formatSlippagePercent(route.estimatedSlippagePercent);
  }, [route]);
  const presetSelected = (SLIPPAGE_PRESETS as readonly number[]).includes(slippageTolerancePercent);

  return (
    <section
      aria-label="Path payment quote"
      data-testid="path-payment-quote"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
        padding: "0.875rem",
        borderRadius: "0.75rem",
        border: "1px solid #e5e7eb",
        background: "#fff",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem" }}>
        <label htmlFor={selectId} style={{ fontSize: "0.8125rem", fontWeight: 600 }}>
          Pay invoice with
        </label>
        <select
          id={selectId}
          data-testid="path-payment-source-asset"
          value={selectedParam}
          onChange={(event) => onSelectAsset(event.target.value)}
          disabled={sourceAssets.length === 0}
        >
          {sourceAssets.length === 0 ? <option value="">No wallet balances</option> : null}
          {sourceAssets.map((asset) => (
            <option key={asset.param} value={asset.param}>
              {asset.code} · {asset.balance}
            </option>
          ))}
        </select>
      </div>

      <p style={{ margin: 0, fontSize: "0.75rem", color: "#6b7280" }}>
        Merchant receives {destinationAmount} {destinationAsset}
      </p>

      {loading ? <p style={{ margin: 0, fontSize: "0.75rem" }}>Fetching path quote…</p> : null}
      {error ? (
        <p role="alert" style={{ margin: 0, fontSize: "0.75rem", color: "#b91c1c" }}>
          {error}
        </p>
      ) : null}

      {route ? (
        <>
          {quote && quote.routes.length > 1 ? (
            <div role="group" aria-label="Discovered routes" style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap" }}>
              {quote.routes.map((candidate, index) => (
                <button
                  key={`${candidate.sourceAmountMax}-${index}`}
                  type="button"
                  aria-pressed={index === routeIndex}
                  onClick={() => setRouteIndex(index)}
                >
                  Route {index + 1}
                  {index === quote.bestRouteIndex ? " · best" : ""}
                </button>
              ))}
            </div>
          ) : null}

          <ol
            aria-label="Path payment hops"
            data-testid="path-payment-hops"
            style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap", listStyle: "none", margin: 0, padding: 0 }}
          >
            {nodes.map((node, index) => {
              const intermediate = index > 0 && index < nodes.length - 1;
              return (
                <li key={`${node}-${index}`}>
                  <button
                    type="button"
                    aria-pressed={activeHop === index}
                    onClick={() => setActiveHop(index)}
                    style={{
                      borderRadius: "999px",
                      border: activeHop === index ? "2px solid #2563eb" : "1px solid #d1d5db",
                      background: intermediate ? "#eff6ff" : "#f9fafb",
                      padding: "0.25rem 0.625rem",
                      fontSize: "0.75rem",
                    }}
                  >
                    {intermediate ? `AMM pool · ${node}` : node}
                  </button>
                </li>
              );
            })}
          </ol>

          <p data-testid="path-payment-source-max" style={{ margin: 0, fontSize: "0.875rem", fontWeight: 600 }}>
            Maximum source amount {route.sourceAmountMax} {route.sourceAsset}
          </p>
          <p style={{ margin: 0, fontSize: "0.75rem", color: "#6b7280" }}>
            Pool fee {route.liquidityPoolFeeStroops} stroops · slippage {slippageDisplay}
          </p>
        </>
      ) : null}

      <div>
        <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>Slippage tolerance</span>
        <div role="group" aria-label="Slippage presets" style={{ display: "flex", gap: "0.375rem", marginTop: "0.375rem" }}>
          {SLIPPAGE_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              aria-pressed={!customMode && slippageTolerancePercent === preset}
              onClick={() => {
                setCustomMode(false);
                onSlippageChange(preset);
              }}
            >
              {preset}%
            </button>
          ))}
          <button
            type="button"
            aria-pressed={customMode || !presetSelected}
            onClick={() => setCustomMode(true)}
          >
            Custom
          </button>
        </div>
        <input
          aria-label="Slippage tolerance"
          data-testid="path-payment-slippage"
          type="range"
          min={0.1}
          max={5}
          step={0.1}
          value={Math.min(5, Math.max(0.1, slippageTolerancePercent))}
          onChange={(event) => {
            setCustomMode(false);
            onSlippageChange(Number(event.target.value));
          }}
          style={{ width: "100%", marginTop: "0.5rem" }}
        />
        {customMode || !presetSelected ? (
          <label htmlFor={customId} style={{ display: "block", fontSize: "0.75rem", marginTop: "0.375rem" }}>
            Custom slippage %
            <input
              id={customId}
              data-testid="path-payment-slippage-custom"
              type="number"
              min={0}
              step={0.1}
              value={slippageTolerancePercent}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (Number.isFinite(next) && next >= 0) onSlippageChange(next);
              }}
              style={{ display: "block", marginTop: "0.25rem" }}
            />
          </label>
        ) : null}
      </div>

      {impact > PRICE_IMPACT_WARNING_PERCENT ? (
        <p role="alert" data-testid="path-payment-impact-warning" style={{ margin: 0, color: "#92400e", background: "#fef3c7", padding: "0.5rem", borderRadius: "0.5rem", fontSize: "0.75rem" }}>
          Estimated price impact is {formatSlippagePercent(impact)}, which exceeds {PRICE_IMPACT_WARNING_PERCENT}%. You may pay more than the best route.
        </p>
      ) : null}
    </section>
  );
}

export interface PathPaymentQuotePanelProps {
  destinationAsset: string;
  destinationAmount: string;
  destinationIssuer?: string | null;
}

/** Connects wallet balances to the quote hook and visualizer. */
export function PathPaymentQuotePanel({
  destinationAsset,
  destinationAmount,
  destinationIssuer,
}: PathPaymentQuotePanelProps) {
  const { address, isConnected } = useWallet();
  const { network } = useNetwork();
  const { balances } = useBalanceHistory(address, network.horizonUrl, isConnected);
  const sourceAssets = useMemo(() => walletSourceAssets(balances), [balances]);
  const [selectedParam, setSelectedParam] = useState<string>("");
  const [slippage, setSlippage] = useState(0.5);

  useEffect(() => {
    if (!selectedParam && sourceAssets[0]) setSelectedParam(sourceAssets[0].param);
  }, [selectedParam, sourceAssets]);

  const selected = sourceAssets.find((asset) => asset.param === selectedParam) ?? null;
  const issuerFromWallet =
    destinationIssuer ||
    sourceAssets.find((asset) => asset.code === destinationAsset && asset.issuer)?.issuer ||
    null;

  const { quote, loading, error } = usePathPaymentQuote({
    horizonUrl: network.horizonUrl,
    sourceAssetParam: selected?.param ?? null,
    destinationAsset,
    destinationIssuer: issuerFromWallet,
    destinationAmount,
    slippageTolerancePercent: slippage,
  });

  if (!destinationAmount || Number(destinationAmount) <= 0) return null;

  return (
    <PathPaymentQuoteVisualizer
      destinationAsset={destinationAsset}
      destinationAmount={destinationAmount}
      sourceAssets={sourceAssets}
      selectedParam={selected?.param ?? ""}
      onSelectAsset={setSelectedParam}
      slippageTolerancePercent={slippage}
      onSlippageChange={setSlippage}
      quote={quote}
      loading={loading}
      error={isConnected ? error : "Connect a wallet to choose a settlement asset."}
    />
  );
}
