import { useId, useState } from "react";

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
  estimate: PathPaymentEstimate | null;
  loading?: boolean;
  /** Market slippage above this percent shows a warning (per acceptance criteria: 1.5). */
  slippageWarningThresholdPercent?: number;
}

/**
 * Lets a payer choose to pay with a different asset (e.g. XLM) than the one
 * an escrow locks in (e.g. USDC), converted via a Stellar path payment. This
 * component is presentational only — callers fetch the live quote (Horizon
 * `/paths/strict-receive` or equivalent) and pass it in as `estimate`.
 */
export function PathPaymentWidget({
  sourceAssetOptions,
  destinationAsset,
  destinationAmount,
  sourceAsset,
  onSourceAssetChange,
  estimate,
  loading = false,
  slippageWarningThresholdPercent = 1.5,
}: PathPaymentWidgetProps) {
  const selectId = useId();
  const [dismissedWarning, setDismissedWarning] = useState(false);

  const showSlippageWarning =
    !dismissedWarning &&
    estimate != null &&
    estimate.slippageTolerancePercent > slippageWarningThresholdPercent;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
        padding: "0.875rem",
        borderRadius: "0.75rem",
        border: "1px solid #e5e7eb",
      }}
    >
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
          }}
        >
          {sourceAssetOptions.map((asset) => (
            <option key={asset} value={asset}>
              {asset}
            </option>
          ))}
        </select>
      </div>

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

      {!loading && estimate && sourceAsset !== destinationAsset && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.375rem",
            fontSize: "0.75rem",
            color: "#374151",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>You pay (max)</span>
            <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
              {estimate.sourceAmountMax} {estimate.sourceAsset}
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Rate</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>
              1 {estimate.sourceAsset} ≈ {estimate.estimatedRate} {estimate.destinationAsset}
            </span>
          </div>
          {estimate.path.length > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Route</span>
              <span>{[estimate.sourceAsset, ...estimate.path, estimate.destinationAsset].join(" → ")}</span>
            </div>
          )}
        </div>
      )}

      {!loading && !estimate && sourceAsset !== destinationAsset && (
        <p style={{ fontSize: "0.75rem", color: "#dc2626", margin: 0 }} role="alert">
          No path payment route available for {sourceAsset} → {destinationAsset}.
        </p>
      )}

      {showSlippageWarning && estimate && (
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
            Market slippage ({estimate.slippageTolerancePercent}%) exceeds the recommended{" "}
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
