/**
 * On-chain receipt getters (#581).
 *
 * Fetches the buyer-facing / merchant-facing escrow receipt getters and the
 * permission receipt getter from their deployed Soroban contracts via
 * simulated (read-only) contract calls — no signing, no fee, no state
 * change. Calls are cached and coalesced per (network, contract, method,
 * key) so re-rendering the verification view (or multiple components
 * mounting it concurrently) never issues duplicate RPC round-trips.
 *
 * This is a read path only: it never constructs a transaction meant for
 * signing (contrast with `lib/decodeTransactionPreview.ts`, #585, which
 * decodes transactions on the write path).
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

export type ReceiptKind = "buyer" | "merchant" | "permission";

const RECEIPT_METHODS: Record<ReceiptKind, string> = {
  buyer: "get_buyer_receipt",
  merchant: "get_merchant_receipt",
  permission: "get_permission_receipt",
};

export interface ReceiptFetchResult {
  kind: ReceiptKind;
  /** Raw decoded contract return value, field-by-field. */
  data: Record<string, unknown>;
}

export type ReceiptFetchOutcome =
  { ok: true; result: ReceiptFetchResult } | { ok: false; error: string };

/**
 * A dummy, never-submitted source account used purely to satisfy
 * `TransactionBuilder`'s API for a simulate-only call — Soroban read
 * simulation doesn't require the source account to actually exist or
 * have a real sequence number, and this transaction is never signed
 * or sent to `sendTransaction`.
 */
const SIMULATION_SOURCE =
  "GCKKRU2H27A4O3MR2IYLXR4RQY5EJFNIWN5VZGZIEG4UIKVE5RN4BPA7";

async function simulateGetterCall(
  network: NetworkConfig,
  contractAddress: string,
  method: string,
  args: unknown[]
): Promise<unknown> {
  const server = new rpc.Server(network.sorobanRpcUrl, { allowHttp: false });
  const account = new Account(SIMULATION_SOURCE, "0");
  const contract = new Contract(contractAddress);

  // Receipt keys (escrow/permission IDs) are opaque string identifiers,
  // not Stellar addresses — encode as ScString, not ScAddress.
  const scArgs = args.map((arg) =>
    typeof arg === "string"
      ? nativeToScVal(arg, { type: "string" })
      : nativeToScVal(arg)
  );

  const tx = new TransactionBuilder(account, {
    fee: "100",
    networkPassphrase: network.networkPassphrase,
  })
    .addOperation(contract.call(method, ...scArgs))
    .setTimeout(30)
    .build();

  const simulated = await server.simulateTransaction(tx);

  if (rpc.Api.isSimulationError(simulated)) {
    throw new Error(simulated.error);
  }
  if (!simulated.result) {
    throw new Error(`Simulation for ${method} returned no result`);
  }

  return scValToNative(simulated.result.retval);
}

function toPlainRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    // Convert any bigint leaf values to strings so the result is always
    // JSON-serializable (needed for the raw-JSON toggle in the UI).
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        typeof v === "bigint" ? v.toString() : v,
      ])
    );
  }
  return { value: typeof value === "bigint" ? value.toString() : value };
}

// ─── Cache + coalescing ────────────────────────────────────────────────────

interface CacheEntry {
  outcome: ReceiptFetchOutcome;
  fetchedAt: number;
}

const CACHE_TTL_MS = 30_000;
const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<ReceiptFetchOutcome>>();

function cacheKey(
  networkId: string,
  contractAddress: string,
  kind: ReceiptKind,
  key: string
): string {
  return `${networkId}:${contractAddress}:${kind}:${key}`;
}

/**
 * Fetches a receipt getter, coalescing concurrent requests for the same
 * (network, contract, kind, key) into a single in-flight RPC call, and
 * serving from cache for `CACHE_TTL_MS` afterward.
 *
 * @param key - The identifier the getter is called with (e.g. escrow ID
 *   or permission ID) — becomes the sole positional argument to the
 *   contract method.
 * @param bypassCache - Forces a fresh fetch, e.g. for an explicit "Refresh" action.
 */
export async function fetchReceipt(
  network: NetworkConfig,
  networkId: string,
  contractAddress: string,
  kind: ReceiptKind,
  key: string,
  bypassCache = false
): Promise<ReceiptFetchOutcome> {
  const cacheK = cacheKey(networkId, contractAddress, kind, key);

  if (!bypassCache) {
    const cached = cache.get(cacheK);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.outcome;
    }

    const pending = inFlight.get(cacheK);
    if (pending) return pending;
  }

  const promise = (async (): Promise<ReceiptFetchOutcome> => {
    try {
      const raw = await simulateGetterCall(
        network,
        contractAddress,
        RECEIPT_METHODS[kind],
        [key]
      );
      const outcome: ReceiptFetchOutcome = {
        ok: true,
        result: { kind, data: toPlainRecord(raw) },
      };
      cache.set(cacheK, { outcome, fetchedAt: Date.now() });
      return outcome;
    } catch (err) {
      const outcome: ReceiptFetchOutcome = {
        ok: false,
        error: err instanceof Error ? err.message : "Failed to fetch receipt",
      };
      // Errors are not cached — a transient RPC failure shouldn't stick
      // around for CACHE_TTL_MS once the underlying issue clears.
      return outcome;
    } finally {
      inFlight.delete(cacheK);
    }
  })();

  inFlight.set(cacheK, promise);
  return promise;
}

/** Clears the receipt cache — exposed for tests and an explicit "Refresh all" action. */
export function clearReceiptCache(): void {
  cache.clear();
  inFlight.clear();
}
