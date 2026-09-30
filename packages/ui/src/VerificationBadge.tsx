import { ReactNode } from "react";

export interface VerificationBadgeProps {
  tier: 'verified' | 'gold' | 'pro';
  reputationScoreBps: number;
  showTooltip?: boolean;
}

const TIER_LABELS: Record<VerificationBadgeProps['tier'], string> = {
  verified: "Verified Merchant",
  gold: "Top Rated",
  pro: "Fast Shipper"
};

// Simplified SVG icons for each tier
const TIER_ICONS: Record<VerificationBadgeProps['tier'], ReactNode> = {
  verified: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
      <polyline points="22 4 12 14.01 9 11.01"></polyline>
    </svg>
  ),
  gold: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
    </svg>
  ),
  pro: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
    </svg>
  )
};

const TIER_COLORS: Record<VerificationBadgeProps['tier'], { bg: string, text: string }> = {
  verified: { bg: "#dbeafe", text: "#1e40af" }, // blue
  gold: { bg: "#fef3c7", text: "#92400e" },    // yellow/gold
  pro: { bg: "#dcfce7", text: "#166534" }      // green
};

export function VerificationBadge({ tier, reputationScoreBps, showTooltip = true }: VerificationBadgeProps) {
  const label = TIER_LABELS[tier];
  const icon = TIER_ICONS[tier];
  const colors = TIER_COLORS[tier];
  
  // Calculate reputation percentage from bps (1 bps = 0.01%)
  const percentage = (reputationScoreBps / 100).toFixed(2);
  
  const tooltipText = showTooltip 
    ? `${label}: Requires a solid track record. Current reputation score is ${percentage}%.`
    : undefined;

  return (
    <span
      title={tooltipText}
      role="img"
      aria-label={tooltipText || label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.25rem",
        padding: "0.25rem 0.625rem",
        borderRadius: "9999px",
        fontSize: "0.75rem",
        fontWeight: 600,
        background: colors.bg,
        color: colors.text,
        whiteSpace: "nowrap",
        maxWidth: "100%",
        overflow: "hidden",
        textOverflow: "ellipsis"
      }}
      data-testid={`verification-badge-${tier}`}
    >
      <span style={{ display: "inline-flex", flexShrink: 0 }}>
        {icon}
      </span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
        {label}
      </span>
    </span>
  );
}
