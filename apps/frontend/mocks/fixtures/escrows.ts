import type { ApiResponse, Escrow } from "@delegolabs/types";
import { createSeededRandom, pick, seededId, seededStellarAddress } from "./faker-lite";

/**
 * Escrow status strings as consumed by `ESCROW_STATUS_META` (see
 * components/escrows/EscrowCard.tsx), confirmed against the fixtures in
 * tests/EscrowCard.test.tsx.
 */
const STATUSES: Escrow["status"][] = ["Funded", "Released", "Refunded", "Disputed"];

export function buildEscrow(seed: number, overrides: Partial<Escrow> = {}): Escrow {
  const rand = createSeededRandom(seed);
  const now = new Date("2026-01-01T00:00:00.000Z");
  const amountStroops = BigInt(Math.floor(rand() * 2000) + 1) * 10_000_000n;

  return {
    escrowId: seededId("escrow", rand),
    orderId: seededId("order", rand),
    amount: amountStroops.toString(),
    buyer: seededStellarAddress(rand),
    seller: seededStellarAddress(rand),
    token: seededId("token", rand),
    status: pick(STATUSES, rand),
    timeoutLedger: 1_000_000 + Math.floor(rand() * 10_000),
    currentLedger: 1_000_000,
    createdAt: now.toISOString(),
    ...overrides,
  };
}

export function buildEscrowList(count = 5): Escrow[] {
  return Array.from({ length: count }, (_, i) => buildEscrow(i + 1));
}

export function okResponse<T>(data: T): ApiResponse<T> {
  return { data, error: null };
}

export function errorResponse<T>(message: string, code = "internal_error"): ApiResponse<T> {
  return { data: null, error: { code, message } };
}
