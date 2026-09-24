import { useId, useState, type CSSProperties } from "react";

/** Priority fee tier. Standard is p50, Fast is p95, Urgent is p99. */
export type FeeTier = "standard" | "fast" | "urgent";

/** One selectable tier with the live fee quote and an inclusion estimate. */
export interface FeeTierOption {
  tier: FeeTier;
  label: string;
  /** Fee in stroops, as a decimal string. */
  feeStroops: string;
  estimatedSeconds: number;
}

export interface FeeSelectorProps {
  selectedTier: FeeTier;
  onChange: (tier: FeeTier) => void;
  /**
   * Live percentile quotes. When omitted, the three tiers still render and
   * Fast stays marked as the recommended default.
   */
  options?: FeeTierOption[];
}

const TIERS: readonly { tier: FeeTier; label: string }[] = [
  { tier: "standard", label: "Standard (p50)" },
  { tier: "fast", label: "Fast (p95)" },
  { tier: "urgent", label: "Urgent (p99)" },
];

const RECOMMENDED_TIER: FeeTier = "fast";

/**
 * Segmented slider for choosing a Stellar priority fee tier.
 * Callers should pass `selectedTier="fast"` initially — Fast (p95) is the
 * recommended default.
 */
export function FeeSelector({ selectedTier, onChange, options }: FeeSelectorProps) {
  const name = useId();
  const [focused, setFocused] = useState<FeeTier | null>(null);

  return (
    <div role="radiogroup" aria-label="Priority fee tier">
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: "0.25rem",
          padding: "0.25rem",
          borderRadius: "0.75rem",
          background: "#f3f4f6",
        }}
      >
        {TIERS.map((tier) => {
          const option = options?.find((item) => item.tier === tier.tier);
          const checked = selectedTier === tier.tier;
          const recommended = tier.tier === RECOMMENDED_TIER;
          return (
            <label
              key={tier.tier}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                gap: "0.125rem",
                margin: 0,
                padding: "0.5rem 0.625rem",
                borderRadius: "0.5rem",
                cursor: "pointer",
                background: checked ? "#2563eb" : "transparent",
                color: checked ? "#ffffff" : "#111827",
                transition: "background 0.18s ease, color 0.18s ease",
                outline: focused === tier.tier ? "2px solid #1d4ed8" : "none",
                outlineOffset: "2px",
              }}
            >
              <input
                type="radio"
                name={name}
                value={tier.tier}
                checked={checked}
                onChange={() => onChange(tier.tier)}
                onFocus={() => setFocused(tier.tier)}
                onBlur={() => setFocused(null)}
                style={visuallyHidden}
              />
              <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>
                {option?.label || tier.label}
              </span>
              {recommended && (
                <span style={{ fontSize: "0.6875rem", fontWeight: 600 }}>
                  Recommended
                </span>
              )}
              {option && (
                <span style={{ fontSize: "0.75rem", fontVariantNumeric: "tabular-nums" }}>
                  {option.feeStroops} stroops · ~{option.estimatedSeconds}s
                </span>
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}

const visuallyHidden: CSSProperties = {
  position: "absolute",
  width: "1px",
  height: "1px",
  padding: 0,
  margin: "-1px",
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
};
