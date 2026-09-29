import { env } from "./env";
import { createRetryingFetch } from "./api";
import type { NetworkConfig } from "./networks";
import { validatePayoutAddressOnNetwork } from "./payoutAddress";
import type { CatalogImportRow } from "./catalogCsv";

export interface MerchantRegistrationForm {
  storeName: string;
  description: string;
  contactEmail: string;
  stellarPayoutAddress: string;
  category: "electronics" | "clothing" | "services" | "digital" | "other";
  websiteUrl?: string;
  /** Parsed catalog rows from the optional CSV import step (#791). */
  catalogRows?: CatalogImportRow[];
}

export type OnboardingStep = "store_info" | "catalog_import" | "wallet_verify" | "contract_register" | "complete";

export const MERCHANT_CATEGORIES: MerchantRegistrationForm["category"][] = [
  "electronics",
  "clothing",
  "services",
  "digital",
  "other",
];

const retryingFetch = createRetryingFetch();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidContactEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

/**
 * Format-and-network validation for the store's payout address, run before
 * advancing past the store-info step (#791). Delegates to
 * `lib/payoutAddress.ts`; kept as a thin re-export here so callers only need
 * to import from this module.
 */
export async function validateStorePayoutAddress(
  address: string,
  network: Pick<NetworkConfig, "sorobanRpcUrl" | "label">
) {
  return validatePayoutAddressOnNetwork(address, network);
}

/**
 * Registers the merchant in the `delego-marketplace` contract. There is no
 * dedicated marketplace contract client vendored in this repo yet, so
 * registration is submitted to the backend (which owns the actual Soroban
 * `InvokeHostFunction` call) after the wallet-ownership proof from step 2 —
 * mirroring `submitShipment` in `lib/shipments.ts` for the same
 * direct-REST-call pattern and its auth caveat. The backend returns the
 * Soroban transaction hash once registration lands on-chain.
 */
export async function registerMerchant(
  form: MerchantRegistrationForm,
  walletProof: { signerAddress: string; signedMessage: string }
): Promise<{ transactionHash: string }> {
  const res = await retryingFetch(`${env.NEXT_PUBLIC_API_URL}/merchant/register`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...form, walletProof }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? `Registration failed (${res.status}).`);
  }
  const json = (await res.json()) as { transactionHash?: string };
  if (!json.transactionHash) {
    throw new Error("Registration succeeded but no transaction hash was returned.");
  }
  return { transactionHash: json.transactionHash };
}

/**
 * Imports the parsed catalog rows for the newly registered merchant (#791).
 * There is no dedicated catalog-import endpoint on `@delegolabs/sdk` yet, so
 * this calls the REST endpoint directly, same pattern as `registerMerchant`
 * and `lib/merchantCatalog.ts`. Returns how many rows were accepted.
 */
export async function importMerchantCatalog(
  rows: CatalogImportRow[]
): Promise<{ imported: number }> {
  const res = await retryingFetch(`${env.NEXT_PUBLIC_API_URL}/merchant/catalog/import`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rows }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? `Catalog import failed (${res.status}).`);
  }
  const json = (await res.json()) as { imported?: number };
  return { imported: json.imported ?? rows.length };
}
