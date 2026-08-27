import type { Escrow } from "@delegolabs/types";

/**
 * Resolves the identifier to use for an escrow: `escrowId` is what the API
 * and fixtures actually populate; `id` is kept only for older call sites
 * that may not have been migrated yet. Use this everywhere an escrow's
 * identity is needed (list keys, selection state, API calls) instead of
 * reading either field directly, so the two never silently diverge.
 */
export function escrowKey(escrow: Escrow): string {
  return escrow.escrowId ?? escrow.id ?? "";
}
