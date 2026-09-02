/**
 * Spend Simulator domain types and helpers.
 *
 * The simulator calls the gateway's read-only SpendPreview dry-run endpoint —
 * it never touches any mutation call site (no transfer, no approval, no
 * escrow creation). Proofs of read-only-ness are in the type signatures: the
 * API call is a GET, the result type carries no transaction hash, and the hook
 * only exports simulate / result state (no mutate variants).
 */

// ─── Denial reasons ──────────────────────────────────────────────────────────

/**
 * Constraint classes the contract can report when denying a simulated spend.
 * Keep in sync with the gateway's SpendDenialReason enum.
 */
export type SpendDenialReason =
  | "cap_exceeded"          // transaction cap or cumulative cap hit
  | "merchant_not_whitelisted" // merchant not in the allowedMerchants list
  | "delegation_paused"     // delegation is paused by the owner
  | "delegation_expired"    // delegation.policy.expiresAt is in the past
  | "delegation_revoked"    // delegation status === "revoked"
  | "insufficient_balance"  // wallet balance < requested amount
  | "unknown";

/** Human-readable explanation for each denial reason. */
export const DENIAL_REASON_LABELS: Record<SpendDenialReason, string> = {
  cap_exceeded: "Amount exceeds your spending cap",
  merchant_not_whitelisted: "This merchant is not on your allowed list",
  delegation_paused: "This delegation is currently paused",
  delegation_expired: "This delegation has expired",
  delegation_revoked: "This delegation has been revoked",
  insufficient_balance: "Wallet balance is too low",
  unknown: "Spend not allowed",
};

// ─── Remediation links ───────────────────────────────────────────────────────

/**
 * Each denial reason maps to a specific remediation path so the user can fix
 * the underlying constraint directly from the result card.
 */
export interface RemediationLink {
  label: string;
  /** Relative href within the app. */
  href: string;
}

export function getRemediationLink(
  reason: SpendDenialReason,
  delegationId: string
): RemediationLink | null {
  switch (reason) {
    case "cap_exceeded":
      return {
        label: "Raise spending cap",
        href: `/delegations/${encodeURIComponent(delegationId)}#edit-limits`,
      };
    case "merchant_not_whitelisted":
      return {
        label: "Add merchant to allowlist",
        href: `/delegations/${encodeURIComponent(delegationId)}#edit-merchants`,
      };
    case "delegation_paused":
      return {
        label: "Resume delegation",
        href: `/delegations/${encodeURIComponent(delegationId)}`,
      };
    case "delegation_expired":
      return {
        label: "Renew delegation",
        href: `/delegations/${encodeURIComponent(delegationId)}#renew`,
      };
    case "delegation_revoked":
      return {
        label: "Create a new delegation",
        href: "/delegations",
      };
    case "insufficient_balance":
      return {
        label: "Top up wallet",
        href: "/wallet",
      };
    case "unknown":
      return null;
  }
}

// ─── API types ───────────────────────────────────────────────────────────────

/** Parameters passed to the read-only SpendPreview gateway endpoint. */
export interface SpendPreviewParams {
  delegationId: string;
  /** Amount to simulate, in stroops. */
  amountStroops: bigint;
  /** Optional merchant ID. Empty string means "any merchant". */
  merchantId?: string;
}

/** Result returned by the gateway's SpendPreview dry-run. */
export interface SpendPreviewResult {
  allowed: boolean;
  /** Remaining cap after the simulated spend (null when denied before cap check). */
  remainingAfterStroops: bigint | null;
  /**
   * Which constraint bound the decision. Present when denied; may also be
   * present when allowed (e.g., "cap_exceeded" won't appear, but the binding
   * constraint that *would* deny a higher amount is surfaced for context).
   */
  bindingConstraint: SpendDenialReason | null;
}
