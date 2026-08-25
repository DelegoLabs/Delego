import type { SpendPreviewReason } from "@delego/types";

export type RemediationAction = "editLimits" | "editMerchants" | "resume" | "renew";

export interface Remediation {
  /** Plain-language name of the constraint that blocked the spend. */
  constraint: string;
  /** Call to action shown as the remediation link/button. */
  actionLabel: string;
  action: RemediationAction;
}

/**
 * Maps a preview_spend denial reason to plain-language copy and the
 * remediation action to offer. Returns null for reasons that aren't one of
 * the ticket's four constraint classes (cap, whitelist, pause, expiry) —
 * not_found/unauthorized are configuration/auth issues, not something a
 * remediation link can fix.
 */
export function remediationForReason(reason: SpendPreviewReason): Remediation | null {
  switch (reason) {
    case "per_tx_limit":
      return { constraint: "Per-transaction spending cap", actionLabel: "Edit limits", action: "editLimits" };
    case "total_limit":
      return { constraint: "Total spending cap", actionLabel: "Edit limits", action: "editLimits" };
    case "bad_merchant":
      return { constraint: "Merchant not on the allowed list", actionLabel: "Edit allowed merchants", action: "editMerchants" };
    case "paused":
      return { constraint: "Delegation is paused", actionLabel: "Resume delegation", action: "resume" };
    case "expired":
      return { constraint: "Delegation has expired", actionLabel: "Renew delegation", action: "renew" };
    default:
      return null;
  }
}
