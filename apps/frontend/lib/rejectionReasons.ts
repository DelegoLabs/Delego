import type { RejectionReasonCode } from "@delegolabs/types";

/**
 * Human-readable labels for structured rejection reasons (#567), shared by
 * every reject surface (approvals list, drawer, decision history).
 */
export const REJECTION_REASON_OPTIONS: { value: RejectionReasonCode; label: string }[] = [
  { value: "too_expensive", label: "Too expensive" },
  { value: "wrong_item", label: "Wrong item" },
  { value: "wrong_merchant", label: "Wrong merchant" },
  { value: "wrong_time", label: "Wrong time" },
  { value: "other", label: "Other" },
];

const LABEL_BY_CODE: Record<RejectionReasonCode, string> = Object.fromEntries(
  REJECTION_REASON_OPTIONS.map((option) => [option.value, option.label])
) as Record<RejectionReasonCode, string>;

/** Human-readable label for a stored reason code, or the code itself if unrecognized. */
export function rejectionReasonLabel(code: RejectionReasonCode | null | undefined): string | null {
  if (!code) return null;
  return LABEL_BY_CODE[code] ?? code;
}
