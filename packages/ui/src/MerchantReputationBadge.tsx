export interface MerchantReputationProps {
  /** On-chain reputation score, 0 to 100. */
  score: number;
  totalOrdersCompleted: number;
  isVerified: boolean;
  size?: "sm" | "md" | "lg";
}

const SIZE_STYLES: Record<NonNullable<MerchantReputationProps["size"]>, { font: string; pad: string; dot: number }> = {
  sm: { font: "0.6875rem", pad: "0.125rem 0.5rem", dot: 5 },
  md: { font: "0.75rem", pad: "0.1875rem 0.625rem", dot: 6 },
  lg: { font: "0.875rem", pad: "0.25rem 0.75rem", dot: 7 },
};

/** Color tier for a reputation score, per the acceptance criteria thresholds. */
function scoreColor(score: number): { background: string; color: string } {
  if (score >= 90) return { background: "#dcfce7", color: "#166534" }; // green
  if (score >= 75) return { background: "#dbeafe", color: "#1e40af" }; // blue
  if (score >= 50) return { background: "#fef3c7", color: "#92400e" }; // yellow
  return { background: "#fee2e2", color: "#dc2626" }; // red
}

/**
 * Displays a merchant's tier and on-chain reputation score as a small
 * colour-coded badge (green ≥90, blue 75-89, yellow 50-74, red <50), with a
 * tooltip explaining how the score is derived.
 */
export function MerchantReputationBadge({
  score,
  totalOrdersCompleted,
  isVerified,
  size = "md",
}: MerchantReputationProps) {
  const clampedScore = Math.max(0, Math.min(100, score));
  const { background, color } = scoreColor(clampedScore);
  const { font, pad, dot } = SIZE_STYLES[size];
  const tooltip = `Reputation score ${clampedScore}/100, derived from ${totalOrdersCompleted} completed on-chain order${
    totalOrdersCompleted === 1 ? "" : "s"
  } (successful escrow releases, dispute history, and response time).${
    isVerified ? " Merchant identity is verified." : ""
  }`;

  return (
    <span
      title={tooltip}
      role="img"
      aria-label={tooltip}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.375rem",
        padding: pad,
        borderRadius: "9999px",
        fontSize: font,
        fontWeight: 600,
        background,
        color,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: "inline-block",
          width: dot,
          height: dot,
          borderRadius: "9999px",
          background: color,
        }}
      />
      {clampedScore}
      {isVerified && <span aria-hidden="true">✓</span>}
    </span>
  );
}
