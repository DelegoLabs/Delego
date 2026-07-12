/**
 * Issue #190 — Delegation Policy Response Mapper
 *
 * Maps Sequelize models (DelegationPolicy + SpendLimit) into a
 * bigint-safe, stable DTO for API consumers.
 */

import type { DelegationPolicy } from "../models/DelegationPolicy.js";
import type { SpendLimit } from "../models/SpendLimit.js";

/**
 * Flat DTO returned by delegation policy endpoints.
 * All numeric fields that originate from BIGINT columns are
 * serialised as strings to avoid JSON precision loss.
 */
export interface DelegationPolicyResponse {
  delegationId: string;
  maxPerTransaction: string;
  maxTotal: string;
  allowedMerchants: string[];
  allowedCategories: string[];
  restrictedMerchants: string[];
  restrictedCategories: string[];
  expiresAt: string | null;
}

/**
 * Map a DelegationPolicy + SpendLimit pair into a stable, bigint-safe DTO.
 *
 * Both parameters are optional so callers don't have to null-check
 * before calling — the mapper returns sensible zero-value defaults.
 */
export function mapDelegationPolicy(
  policy: DelegationPolicy | null | undefined,
  spendLimit: SpendLimit | null | undefined,
  expiresAt?: string | Date | null
): DelegationPolicyResponse {
  const delegationId = policy?.delegationId ?? spendLimit?.delegationId ?? "";

  return {
    delegationId,
    maxPerTransaction: String(spendLimit?.limitPerTransaction ?? "0"),
    maxTotal: String(spendLimit?.limitLifetime ?? "0"),
    allowedMerchants: policy?.allowedMerchants ?? [],
    allowedCategories: policy?.allowedCategories ?? [],
    restrictedMerchants: policy?.restrictedMerchants ?? [],
    restrictedCategories: policy?.restrictedCategories ?? [],
    expiresAt: expiresAt instanceof Date
      ? expiresAt.toISOString()
      : expiresAt ?? null,
  };
}
