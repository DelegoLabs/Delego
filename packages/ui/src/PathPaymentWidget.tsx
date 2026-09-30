import { useId, useState } from "react";
import {
  PathPaymentSlippageSlider,
  type LiquidityPoolReserves,
  type PathPaymentQuote,
} from "./PathPaymentSlippageSlider.js";

/** A live path-payment quote for paying in one asset while the destination receives another. */
export interface PathPaymentEstimate {
  sourceAsset: string;
  destinationAsset: string;
  sourceAmountMax: string;
  destinationAmount: string;
  estimatedRate: string;
  /** e.g. 0.5 for 0.5% */
  slippageTolerancePercent: number;
  path: string[];
}

export type { LiquidityPoolReserves, PathPaymentQuote };

export interface PathPaymentWidgetProps {
  /** Assets the user may pay with (e.g. ["XLM", "USDC"]). */
  sourceAssetOptions: string[];
  /** The fixed destination asset the escrow locks in (e.g. "USDC"). */
  destinationAsset: string;
  /** Amount (in destinationAsset units) the escrow requires. */
  destinationAmount: string;
  /** Currently selected source asset. */
  sourceAsset: string;
  onSourceAssetChange: (asset: string) => void;
  /** Live quote for the current sourceAsset/destinationAmount pair, or null while loading/unavailable. */
  estimate?: PathPaymentEstimate | null;
  /** Quote conforming to PathPaymentQuote schema */
  quote?: PathPaymentQuote | null;
  loading?: boolean;
  /** Market slippage above this percent shows a warning (default: 1.5). */
  slippageWarningThresholdPercent?: number;
  /** Selected slippage tolerance percent (controlled) */
  slippageTolerancePercent?: number;
  /** Callback fired when user changes slippage tolerance via presets or slider */
  onSlippageChange?: (slippagePercent: number) => void;
  /** Slippage presets to offer (default: [0.1, 0.5, 1.0]) */
  slippagePresets?: number[];
  /** Estimated price impact warning threshold percent (default: 2.0) */
  priceImpactWarningThresholdPercent?: number;
  /** Optional pool reserves for AMM depth */
  reserves?: LiquidityPoolReserves | null;
}

/**
 * Lets a payer choose to pay with a different asset (e.g. XLM) than the one
 * an escrow locks in (e.g. USDC), converted via a Stellar path payment.
 * Features an interactive slippage tolerance slider with presets (0.1%, 0.5%, 1.0%, custom),
 * dynamic minimum received calculation, liquidity pool reserves display,
 * and prominent price impact warnings when exceeding 2%.
 */
export function PathPaymentWidget({
  sourceAssetOptions,
  destinationAsset,
  destinationAmount,
  sourceAsset,
  onSourceAssetChange,
  estimate,
  quote,
  loading = false,
  slippageWarningThresholdPercent = 1.5,
  slippageTolerancePercent: controlledSlippage,
  onSlippageChange,
  slippagePresets = [0.1, 0.5, 1.0],
  priceImpactWarningThresholdPercent = 2.0,
  reserves,
}: PathPaymentWidgetProps) {
  const selectId = useId();
  const [dismissedWarning, setDismissedWarning] = useState(false);
  const [internalSlippage, setInternalSlippage] = useState<number>(() => {
    return quote?.slippageTolerancePercent ?? estimate?.slippageTolerancePercent ?? 0.5;
  });

  const activeSlippage =
    controlledSlippage !== undefined
      ? controlledSlippage
      : internalSlippage;

  const handleSlippageChange = (newSlippage: number) => {
    if (controlledSlippage === undefined) {
      setInternalSlippage(newSlippage);
    }
    onSlippageChange?.(newSlippage);
  };

  // Derive unified quote data whether caller passes `quote` or legacy `estimate`
  const effectiveQuote: PathPaymentQuote | null = quote
    ? quote
    : estimate
    ? {
        sourceToken: estimate.sourceAsset,
        sourceAmount: estimate.sourceAmountMax,
        destinationToken: estimate.destinationAsset,
        destinationAmount: estimate.destinationAmount,
        estimatedPriceImpactPercent: 0,
        slippageTolerancePercent: activeSlippage,
      }
    : null;

  const showLegacySlippageWarning =
    !dismissedWarning &&
    estimate != null &&
    activeSlippage > slippageWarningThresholdPercent;

  const isCrossAsset = sourceAsset !== destinationAsset;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
        padding: "0.875rem",
        borderRadius: "0.75rem",
        border: "1px solid #e5e7eb",
        background: "#ffffff",
      }}
    >
      {/* Asset Selector */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <label htmlFor={selectId} style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#111827" }}>
          Pay with
        </label>
        <select
          id={selectId}
          value={sourceAsset}
          onChange={(e) => {
            setDismissedWarning(false);
            onSourceAssetChange(e.target.value);
          }}
          style={{
            padding: "0.375rem 0.5rem",
            borderRadius: "0.5rem",
            border: "1px solid #d1d5db",
            fontSize: "0.8125rem",
            background: "#ffffff",
            color: "#111827",
          }}
        >
          {sourceAssetOptions.map((asset) => (
            <option key={asset} value={asset}>
              {asset}
            </option>
          ))}
        </select>
      </div>

      {/* Escrow Requirement */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          fontSize: "0.75rem",
          color: "#6b7280",
        }}
      >
        <span>Escrow requires</span>
        <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600, color: "#111827" }}>
          {destinationAmount} {destinationAsset}
        </span>
      </div>

      {loading && (
        <p style={{ fontSize: "0.75rem", color: "#6b7280", margin: 0 }}>Fetching live quote…</p>
      )}

      {/* Route & Rates Breakdown */}
      {!loading && (estimate || quote) && isCrossAsset && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.375rem",
            fontSize: "0.75rem",
            color: "#374151",
            padding: "0.5rem 0.625rem",
            borderRadius: "0.5rem",
            background: "#f9fafb",
            border: "1px solid #f3f4f6",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>You pay (estimated)</span>
            <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
              {effectiveQuote?.sourceAmount} {sourceAsset}
            </span>
          </div>

          {estimate && (
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Rate</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>
                1 {estimate.sourceAsset} ≈ {estimate.estimatedRate} {estimate.destinationAsset}
              </span>
            </div>
          )}

          {estimate && estimate.path.length > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Route</span>
              <span>{[estimate.sourceAsset, ...estimate.path, estimate.destinationAsset].join(" → ")}</span>
            </div>
          )}
        </div>
      )}

      {/* Interactive Slippage Slider with Presets & Reserves */}
      {!loading && (estimate || quote) && isCrossAsset && (
        <PathPaymentSlippageSlider
          value={activeSlippage}
          onChange={handleSlippageChange}
          presets={slippagePresets}
          estimatedPriceImpactPercent={effectiveQuote?.estimatedPriceImpactPercent}
          priceImpactWarningThresholdPercent={priceImpactWarningThresholdPercent}
          destinationAmount={destinationAmount}
          destinationToken={destinationAsset}
          sourceAmount={effectiveQuote?.sourceAmount}
          sourceToken={sourceAsset}
          reserves={reserves}
        />
      )}

      {/* Error state if no path exists */}
      {!loading && !estimate && !quote && isCrossAsset && (
        <p style={{ fontSize: "0.75rem", color: "#dc2626", margin: 0 }} role="alert">
          No path payment route available for {sourceAsset} → {destinationAsset}.
        </p>
      )}

      {/* Legacy Market Slippage Warning (dismissible) */}
      {showLegacySlippageWarning && estimate && (
        <div
          role="alert"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.5rem",
            padding: "0.5rem 0.625rem",
            borderRadius: "0.5rem",
            background: "#fef3c7",
            color: "#92400e",
            fontSize: "0.75rem",
          }}
        >
          <span>
            Market slippage ({activeSlippage}%) exceeds the recommended{" "}
            {slippageWarningThresholdPercent}% — you may pay more than expected.
          </span>
          <button
            type="button"
            onClick={() => setDismissedWarning(true)}
            aria-label="Dismiss slippage warning"
            style={{ border: "none", background: "transparent", color: "#92400e", cursor: "pointer" }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
