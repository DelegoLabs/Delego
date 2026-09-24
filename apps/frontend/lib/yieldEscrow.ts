/**
 * Blend yield option for escrow checkout and delegation creation (#701).
 *
 * Projected earnings are simple interest on the escrowed principal for the
 * timeout window: principal * 4.5% * (days / 365). Integer stroop math only.
 */

export interface YieldEscrowOption {
  isEnabled: boolean;
  protocol: "blend";
  estimatedApyPercent: number;
  estimatedEarningsStroops: string;
}

export const BLEND_ESTIMATED_APY_PERCENT = 4.5;

export const YIELD_ESCROW_TOGGLE_LABEL =
  "Earn ~4.5% APY in Blend Protocol while funds are held in escrow";

export const BLEND_YIELD_RISK_DISCLAIMER =
  "Supplying escrowed funds to Blend uses a third-party Soroban smart contract. The rate is an estimate, yield is not guaranteed, and deposits can be delayed or lost if that contract fails.";

const APY_NUMERATOR = 45n;
const APY_DENOMINATOR = 1000n;
const DAYS_PER_YEAR = 365n;

export function parseStroopsAmount(value: unknown): bigint {
  if (typeof value === "bigint") return value > 0n ? value : 0n;
  if (typeof value === "number" && Number.isFinite(value)) {
    const truncated = Math.trunc(value);
    return truncated > 0 ? BigInt(truncated) : 0n;
  }
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
    const parsed = BigInt(value.trim());
    return parsed > 0n ? parsed : 0n;
  }
  return 0n;
}

export function parseTimeoutDays(value: string | number | undefined): number {
  if (value == null || value === "") return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.min(3650, Math.floor(parsed));
}

export function estimatedEarningsStroops(
  principal: bigint,
  timeoutDays: number
): string {
  if (principal <= 0n || timeoutDays <= 0) return "0";
  const days = BigInt(timeoutDays);
  return (
    (principal * APY_NUMERATOR * days) /
    (APY_DENOMINATOR * DAYS_PER_YEAR)
  ).toString();
}

export function buildYieldEscrowOption(
  isEnabled: boolean,
  principal: bigint,
  timeoutDays: number
): YieldEscrowOption {
  return {
    isEnabled,
    protocol: "blend",
    estimatedApyPercent: BLEND_ESTIMATED_APY_PERCENT,
    estimatedEarningsStroops: isEnabled
      ? estimatedEarningsStroops(principal, timeoutDays)
      : "0",
  };
}
