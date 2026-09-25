/**
 * Release-eligibility getter (Issue 3).
 *
 * Queries the escrow contract's read-only `get_release_eligibility` method
 * via a simulated Soroban RPC call (no signing, no state change). Results
 * are cached per escrow ID with a configurable TTL and in-flight requests
 * are coalesced so rapid re-renders never issue duplicate RPC round-trips.
 *
 * Pattern mirrors services/receiptGetters.ts — same coalescing/caching
 * approach, same dummy source account for builder compatibility.
 */

import {
  Account,
  Contract,
  TransactionBuilder,
  scValToNative,
  nativeToScVal,
  rpc,
} from "@stellar/stellar-sdk";
import type { NetworkConfig } from "../lib/networks";

// ─── Return type from the contract ──────────────────────────────────────────

/**
 * Reason symbols returned by the contract's `get_release_eligibility` getter.
 * Keep in sync with Rust `symbol_short!` values in the escrow contract.
 */
export type ReleaseIneligibilityReason =
  | "timeout_not_reached"
  | "already_released"
  | "already_refunded"
  | "disputed"
  | "cancelled"
  | "not_funded"
  | "unauthorized";

export interface ReleaseEligibilityResult {
  eligible: boolean;
  /**
   * Populated when eligible is false.
   * Null when eligible is true (no reason needed).
   */
  reason: ReleaseIneligibilityReason | null;
  /**
   * When reason is "timeout_not_reached", the contract may return a
   * millisecond timestamp for when release unlocks.
   */
  unlocksAtMs?: number | null;
}

// ─── Human-readable reason labels ──────────────────────────────────────────

export const INELIGIBILITY_REASON_LABELS: Record<
  ReleaseIneligibilityReason,
  string
> = {
  timeout_not_reached: "Timeout not reached",
  already_released: "Already released",
  already_refunded: "Already refunded",
  disputed: "Under dispute — release paused",
  cancelled: "Order was cancelled",
  not_funded: "Escrow not yet funded",
  unauthorized: "You are not authorised to release this escrow",
};

/**
 * Builds a human-readable tooltip string for the disabled release CTA,
 * including a countdown when the reason is a timeout.
 *
 * Examples:
 *   "Timeout not reached — releases unlock in 2d 4h"
 *   "Under dispute — release paused"
 */
export function formatIneligibilityTooltip(
  result: ReleaseEligibilityResult,
  now: Date = new Date()
): string {
  if (result.eligible || !result.reason) return "";
  const base = INELIGIBILITY_REASON_LABELS[result.reason];

  if (
    result.reason === "timeout_not_reached" &&
    result.unlocksAtMs != null
  ) {
    const remainingMs = result.unlocksAtMs - now.getTime();
    if (remainingMs > 0) {
      const totalMinutes = Math.floor(remainingMs / 60_000);
      const days = Math.floor(totalMinutes / 1440);
      const hours = Math.floor((totalMinutes % 1440) / 60);
      const minutes = totalMinutes % 60;

      let countdown = "";
      if (days > 0) countdown = `${days}d ${hours}h`;
      else if (hours > 0) countdown = `${hours}h ${minutes}m`;
      else countdown = `${minutes}m`;

      return `${base} — releases unlock in ${countdown}`;
    }
  }
  return base;
}

// ─── RPC simulation ─────────────────────────────────────────────────────────

const SIMULATION_SOURCE =
  "GCKKRU2H27A4O3MR2IYLXR4RQY5EJFNIWN5VZGZIEG4UIKVE5RN4BPA7";

async function callEligibilityGetter(
  network: NetworkConfig,
  contractAddress: string,
  escrowId: string
): Promise<ReleaseEligibilityResult> {
  const server = new rpc.Server(network.sorobanRpcUrl, { allowHttp: false });
  const account = new Account(SIMULATION_SOURCE, "0");
  const contract = new Contract(contractAddress);

  const tx = new TransactionBuilder(account, {
    fee: "100",
    networkPassphrase: network.networkPassphrase,
  })
    .addOperation(
      contract.call(
        "get_release_eligibility",
        nativeToScVal(escrowId, { type: "string" })
      )
    )
    .setTimeout(30)
    .build();

  const simulated = await server.simulateTransaction(tx);

  if (rpc.Api.isSimulationError(simulated)) {
    throw new Error(simulated.error);
  }
  if (!simulated.result) {
    throw new Error("get_release_eligibility returned no result");
  }

  const native = scValToNative(simulated.result.retval);
  return parseEligibilityResult(native);
}

/**
 * Parses the raw decoded contract return value into a typed result.
 * Expected contract return shape (Rust Map → scValToNative):
 *   { eligible: bool, reason?: symbol, unlocks_at_ms?: i64 }
 */
function parseEligibilityResult(raw: unknown): ReleaseEligibilityResult {
  if (raw == null || typeof raw !== "object") {
    // Defensive: treat an opaque true/false as an eligible/ineligible signal.
    return { eligible: Boolean(raw), reason: null };
  }

  const r = raw as Record<string, unknown>;
  const eligible = Boolean(r.eligible);
  const reason =
    typeof r.reason === "string"
      ? (r.reason as ReleaseIneligibilityReason)
      : null;
  const unlocksAtMs =
    typeof r.unlocks_at_ms === "number"
      ? r.unlocks_at_ms
      : typeof r.unlocks_at_ms === "bigint"
        ? Number(r.unlocks_at_ms)
        : null;

  return { eligible, reason: eligible ? null : reason, unlocksAtMs };
}

// ─── Cache + in-flight coalescing ────────────────────────────────────────────

/**
 * TTL for cached eligibility results. Short enough to stay fresh after
 * escrow events; long enough to avoid hammering RPC on re-renders.
 */
export const ELIGIBILITY_CACHE_TTL_MS = 15_000;

interface CacheEntry {
  result: ReleaseEligibilityResult;
  fetchedAt: number;
}

// Module-level cache ensures coalescing works across multiple hook instances.
const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<ReleaseEligibilityResult>>();

function cacheKey(networkId: string, contractAddress: string, escrowId: string) {
  return `${networkId}:${contractAddress}:${escrowId}`;
}

/**
 * Fetches release eligibility, coalescing concurrent requests for the same
 * (networkId, contractAddress, escrowId) into a single in-flight RPC call
 * and caching the result for ELIGIBILITY_CACHE_TTL_MS afterward.
 *
 * @param bypassCache  Forces a fresh fetch — use after known escrow events.
 */
export async function fetchReleaseEligibility(
  network: NetworkConfig,
  networkId: string,
  contractAddress: string,
  escrowId: string,
  bypassCache = false
): Promise<ReleaseEligibilityResult> {
  const key = cacheKey(networkId, contractAddress, escrowId);

  if (!bypassCache) {
    const cached = cache.get(key);
    if (cached && Date.now() - cached.fetchedAt < ELIGIBILITY_CACHE_TTL_MS) {
      return cached.result;
    }
    const pending = inFlight.get(key);
    if (pending) return pending;
  }

  const promise = (async (): Promise<ReleaseEligibilityResult> => {
    try {
      const result = await callEligibilityGetter(
        network,
        contractAddress,
        escrowId
      );
      cache.set(key, { result, fetchedAt: Date.now() });
      return result;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, promise);
  return promise;
}

/** Invalidates the cache for a single escrow — call after release/dispute events. */
export function invalidateEligibilityCache(
  networkId: string,
  contractAddress: string,
  escrowId: string
): void {
  cache.delete(cacheKey(networkId, contractAddress, escrowId));
}

/** Clears the entire eligibility cache — exposed for tests. */
export function clearEligibilityCache(): void {
  cache.clear();
  inFlight.clear();
}
