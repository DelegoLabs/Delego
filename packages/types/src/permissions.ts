/**
 * SpendPreview types. Mirror the exact `Symbol` reason codes returned by
 * `preview_spend` in contracts/permissions/src/lib.rs — keep in sync with
 * that function's source.
 */
export type SpendPreviewReason =
  | "ok"
  | "not_found"
  | "expired"
  | "paused"
  | "unauthorized"
  | "per_tx_limit"
  | "total_limit"
  | "bad_merchant";

export interface SpendPreviewInput {
  owner: string;
  delegate: string;
  amountStroops: string;
  merchant: string;
}

export interface SpendPreview {
  allowed: boolean;
  reason: SpendPreviewReason;
  remainingAfterStroops: string;
}
