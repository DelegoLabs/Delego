import { useId, useState, type CSSProperties, type ChangeEvent } from "react";

/** Liquidity pool reserves for calculating depth and price impact */
export interface LiquidityPoolReserves {
  sourceReserve: string;
  destinationReserve: string;
}

/** Live path-payment quote data schema */
export interface PathPaymentQuote {
  sourceToken: string;
  sourceAmount: string;
  destinationToken: string;
  destinationAmount: string;
  estimatedPriceImpactPercent: number;
  slippageTolerancePercent: number;
}

export interface PathPaymentSlippageSliderProps {
  /** Current slippage tolerance percent (e.g. 0.5 for 0.5%) */
  value?: number;
  /** Callback when slippage tolerance changes */
  onChange?: (slippagePercent: number) => void;
  /** Default slippage tolerance when uncontrolled (default: 0.5) */
  defaultValue?: number;
  /** Preset buttons to display (default: [0.1, 0.5, 1.0]) */
  presets?: number[];
  /** Minimum slider value (default: 0.05) */
  min?: number;
  /** Maximum slider value (default: 5.0) */
  max?: number;
  /** Slider step (default: 0.05) */
  step?: number;
  /** Estimated price impact percent (e.g. 2.4 for 2.4%) */
  estimatedPriceImpactPercent?: number;
  /** Threshold above which price impact shows a warning color (default: 2.0) */
  priceImpactWarningThresholdPercent?: number;
  /** Destination amount to dynamically calculate minimum received amount */
  destinationAmount?: string | number;
  /** Destination token symbol (e.g. "USDC") */
  destinationToken?: string;
  /** Source amount to dynamically calculate maximum sent amount */
  sourceAmount?: string | number;
  /** Source token symbol (e.g. "XLM") */
  sourceToken?: string;
  /** Optional liquidity pool reserves for displaying pool depth and deriving impact */
  reserves?: LiquidityPoolReserves | null;
  /** Disabled state */
  disabled?: boolean;
}

const DEFAULT_PRESETS = [0.1, 0.5, 1.0];
const DEFAULT_WARNING_THRESHOLD = 2.0;

/**
 * Dynamically calculates the guaranteed minimum received amount after slippage.
 * Formula: destinationAmount * (1 - slippagePercent / 100)
 */
export function calculateMinimumReceivedAmount(
  destinationAmount: string | number,
  slippageTolerancePercent: number,
  decimals: number = 7
): string {
  const amount = typeof destinationAmount === "string" ? parseFloat(destinationAmount) : destinationAmount;
  if (isNaN(amount) || amount <= 0) return "0";
  const slippage = Math.max(0, slippageTolerancePercent);
  const minAmount = Math.max(0, amount * (1 - slippage / 100));
  const fixed = minAmount.toFixed(decimals);
  return fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed;
}

/**
 * Dynamically calculates the maximum source amount required to pay.
 * Formula: sourceAmount * (1 + slippagePercent / 100)
 */
export function calculateMaxSourceAmount(
  sourceAmount: string | number,
  slippageTolerancePercent: number,
  decimals: number = 7
): string {
  const amount = typeof sourceAmount === "string" ? parseFloat(sourceAmount) : sourceAmount;
  if (isNaN(amount) || amount <= 0) return "0";
  const slippage = Math.max(0, slippageTolerancePercent);
  const maxAmount = amount * (1 + slippage / 100);
  const fixed = maxAmount.toFixed(decimals);
  return fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed;
}

/**
 * Calculates estimated price impact percentage against constant product pool reserves:
 * deltaX / (reserveX + deltaX) * 100
 */
export function calculatePriceImpactFromReserves(
  sourceAmount: string | number,
  sourceReserve: string | number
): number {
  const amt = typeof sourceAmount === "string" ? parseFloat(sourceAmount) : sourceAmount;
  const res = typeof sourceReserve === "string" ? parseFloat(sourceReserve) : sourceReserve;
  if (isNaN(amt) || isNaN(res) || res <= 0 || amt <= 0) return 0;
  const impact = (amt / (res + amt)) * 100;
  return Math.round(impact * 100) / 100;
}

/**
 * Interactive Path Payment Slippage Tolerance Slider with Reserves.
 * Allows buyers to configure slippage tolerance via presets or slider,
 * computes live minimum received amounts, and warns prominently if
 * price impact exceeds the 2% threshold.
 */
export function PathPaymentSlippageSlider({
  value,
  onChange,
  defaultValue = 0.5,
  presets = DEFAULT_PRESETS,
  min = 0.05,
  max = 5.0,
  step = 0.05,
  estimatedPriceImpactPercent,
  priceImpactWarningThresholdPercent = DEFAULT_WARNING_THRESHOLD,
  destinationAmount,
  destinationToken = "",
  sourceAmount,
  sourceToken = "",
  reserves,
  disabled = false,
}: PathPaymentSlippageSliderProps) {
  const sliderId = useId();
  const customInputId = useId();
  const [internalValue, setInternalValue] = useState<number>(defaultValue);
  const [isCustomMode, setIsCustomMode] = useState<boolean>(() => {
    const initial = value !== undefined ? value : defaultValue;
    return !presets.includes(initial);
  });

  const slippage = value !== undefined ? value : internalValue;

  const updateSlippage = (newVal: number, fromCustom = false) => {
    const clamped = Math.max(0, Math.min(max * 2, Number(newVal.toFixed(2))));
    if (value === undefined) {
      setInternalValue(clamped);
    }
    setIsCustomMode(fromCustom || !presets.includes(clamped));
    onChange?.(clamped);
  };

  // Derive price impact from reserves if not provided directly
  const effectivePriceImpact =
    estimatedPriceImpactPercent !== undefined
      ? estimatedPriceImpactPercent
      : reserves && sourceAmount
      ? calculatePriceImpactFromReserves(sourceAmount, reserves.sourceReserve)
      : 0;

  const hasHighPriceImpact = effectivePriceImpact > priceImpactWarningThresholdPercent;
  const isSeverePriceImpact = effectivePriceImpact > 5.0;

  // Dynamic minimum received calculation
  const minimumReceived =
    destinationAmount !== undefined
      ? calculateMinimumReceivedAmount(destinationAmount, slippage)
      : null;

  // Dynamic maximum source to pay calculation
  const maxSourceToPay =
    sourceAmount !== undefined
      ? calculateMaxSourceAmount(sourceAmount, slippage)
      : null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
        padding: "0.75rem",
        borderRadius: "0.625rem",
        background: "#f9fafb",
        border: "1px solid #e5e7eb",
      }}
    >
      {/* Header with Title and Current Slippage */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#111827" }}>
          Slippage Tolerance
        </span>
        <span
          data-testid="current-slippage-badge"
          style={{
            fontSize: "0.8125rem",
            fontWeight: 700,
            color: "#2563eb",
            fontVariantNumeric: "tabular-nums",
            background: "#eff6ff",
            padding: "0.125rem 0.5rem",
            borderRadius: "0.375rem",
            border: "1px solid #bfdbfe",
          }}
        >
          {slippage}%
        </span>
      </div>

      {/* Preset Buttons & Custom Toggle */}
      <div
        role="group"
        aria-label="Slippage tolerance presets"
        style={{
          display: "flex",
          gap: "0.375rem",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        {presets.map((preset) => {
          const isSelected = !isCustomMode && Math.abs(slippage - preset) < 0.001;
          return (
            <button
              key={preset}
              type="button"
              disabled={disabled}
              onClick={() => updateSlippage(preset, false)}
              aria-pressed={isSelected}
              data-testid={`preset-${preset}`}
              style={{
                flex: "1 1 0px",
                minWidth: "3.25rem",
                padding: "0.375rem 0.5rem",
                borderRadius: "0.375rem",
                fontSize: "0.75rem",
                fontWeight: 600,
                border: isSelected ? "1px solid #2563eb" : "1px solid #d1d5db",
                background: isSelected ? "#2563eb" : "#ffffff",
                color: isSelected ? "#ffffff" : "#374151",
                cursor: disabled ? "not-allowed" : "pointer",
                transition: "all 0.15s ease",
              }}
            >
              {preset}%
            </button>
          );
        })}

        <button
          type="button"
          disabled={disabled}
          onClick={() => setIsCustomMode(true)}
          aria-pressed={isCustomMode}
          data-testid="preset-custom"
          style={{
            flex: "1 1 0px",
            minWidth: "3.5rem",
            padding: "0.375rem 0.5rem",
            borderRadius: "0.375rem",
            fontSize: "0.75rem",
            fontWeight: 600,
            border: isCustomMode ? "1px solid #2563eb" : "1px solid #d1d5db",
            background: isCustomMode ? "#2563eb" : "#ffffff",
            color: isCustomMode ? "#ffffff" : "#374151",
            cursor: disabled ? "not-allowed" : "pointer",
            transition: "all 0.15s ease",
          }}
        >
          Custom
        </button>
      </div>

      {/* Interactive Slippage Slider */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <input
            id={sliderId}
            type="range"
            min={min}
            max={max}
            step={step}
            value={Math.min(slippage, max)}
            disabled={disabled}
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              updateSlippage(parseFloat(e.target.value), false);
            }}
            aria-label="Slippage tolerance slider"
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuenow={slippage}
            aria-valuetext={`${slippage}%`}
            style={{
              flex: 1,
              cursor: disabled ? "not-allowed" : "pointer",
              accentColor: "#2563eb",
            }}
          />
          {isCustomMode && (
            <div style={{ display: "flex", alignItems: "center", position: "relative" }}>
              <input
                id={customInputId}
                type="number"
                min={0}
                max={50}
                step={0.1}
                value={slippage}
                disabled={disabled}
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val)) {
                    updateSlippage(val, true);
                  }
                }}
                aria-label="Custom slippage tolerance percent"
                style={{
                  width: "4.5rem",
                  padding: "0.25rem 1.25rem 0.25rem 0.375rem",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  borderRadius: "0.375rem",
                  border: "1px solid #2563eb",
                  background: "#ffffff",
                  textAlign: "right",
                }}
              />
              <span
                style={{
                  position: "absolute",
                  right: "0.375rem",
                  fontSize: "0.75rem",
                  color: "#6b7280",
                  pointerEvents: "none",
                }}
              >
                %
              </span>
            </div>
          )}
        </div>

        {/* Slider Min/Max Scale Labels */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: "0.6875rem",
            color: "#9ca3af",
          }}
        >
          <span>{min}%</span>
          <span>1.0%</span>
          <span>2.5%</span>
          <span>{max}%</span>
        </div>
      </div>

      {/* Reserves and Price Impact Information */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.375rem",
          padding: "0.5rem 0.625rem",
          borderRadius: "0.5rem",
          background: "#ffffff",
          border: "1px solid #f3f4f6",
          fontSize: "0.75rem",
        }}
      >
        {/* Dynamic Minimum Received Amount */}
        {minimumReceived !== null && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
            }}
          >
            <span style={{ color: "#4b5563" }}>Minimum received</span>
            <span
              data-testid="minimum-received-amount"
              style={{
                fontVariantNumeric: "tabular-nums",
                fontWeight: 600,
                color: "#111827",
              }}
            >
              {minimumReceived} {destinationToken}
            </span>
          </div>
        )}

        {/* Dynamic Maximum to Pay */}
        {maxSourceToPay !== null && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
            }}
          >
            <span style={{ color: "#4b5563" }}>Maximum to pay</span>
            <span
              data-testid="maximum-source-amount"
              style={{
                fontVariantNumeric: "tabular-nums",
                fontWeight: 600,
                color: "#111827",
              }}
            >
              {maxSourceToPay} {sourceToken}
            </span>
          </div>
        )}

        {/* Estimated Price Impact Display with Warning Colors */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ color: "#4b5563" }}>Estimated Price Impact</span>
          <span
            data-testid="price-impact-value"
            style={{
              fontVariantNumeric: "tabular-nums",
              fontWeight: 700,
              fontSize: "0.75rem",
              padding: "0.125rem 0.375rem",
              borderRadius: "0.25rem",
              color: isSeverePriceImpact
                ? "#b91c1c"
                : hasHighPriceImpact
                ? "#b45309"
                : "#15803d",
              background: isSeverePriceImpact
                ? "#fee2e2"
                : hasHighPriceImpact
                ? "#fef3c7"
                : "#f0fdf4",
              border: isSeverePriceImpact
                ? "1px solid #fca5a5"
                : hasHighPriceImpact
                ? "1px solid #fde68a"
                : "1px solid #bbf7d0",
            }}
          >
            {effectivePriceImpact.toFixed(2)}%
          </span>
        </div>

        {/* Optional Pool Reserves Display */}
        {reserves && (
          <div
            data-testid="pool-reserves-info"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              color: "#6b7280",
              fontSize: "0.6875rem",
              borderTop: "1px dashed #e5e7eb",
              paddingTop: "0.25rem",
              marginTop: "0.125rem",
            }}
          >
            <span>Pool Reserves</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>
              {reserves.sourceReserve} {sourceToken || "Source"} / {reserves.destinationReserve}{" "}
              {destinationToken || "Dest"}
            </span>
          </div>
        )}
      </div>

      {/* Prominent Price Impact Warning Banner if > 2% */}
      {hasHighPriceImpact && (
        <div
          role="alert"
          data-testid="price-impact-warning"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.25rem",
            padding: "0.625rem 0.75rem",
            borderRadius: "0.5rem",
            fontSize: "0.75rem",
            lineHeight: 1.35,
            background: isSeverePriceImpact ? "#fef2f2" : "#fffbeb",
            color: isSeverePriceImpact ? "#991b1b" : "#92400e",
            border: isSeverePriceImpact ? "1px solid #f87171" : "1px solid #f59e0b",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontWeight: 700 }}>
            <span>{isSeverePriceImpact ? "🚨" : "⚠️"}</span>
            <span>
              {isSeverePriceImpact ? "Excessive Price Impact Alert" : "High Price Impact Warning"}
            </span>
          </div>
          <div>
            Price impact is <strong>{effectivePriceImpact.toFixed(2)}%</strong> (exceeds{" "}
            {priceImpactWarningThresholdPercent}% safety threshold). Due to trade size relative to
            available pool reserves, you may receive substantially fewer tokens.
          </div>
        </div>
      )}
    </div>
  );
}
