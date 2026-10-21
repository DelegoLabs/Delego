import { env } from "./env";
import { createRetryingFetch } from "./api";
import type { NetworkConfig } from "./networks";
import { validatePayoutAddressOnNetwork } from "./payoutAddress";
import type { CatalogImportRow } from "./catalogCsv";
import type { DomainVerificationResult } from "./merchantDomainVerification";

export interface MerchantRegistrationForm {
  storeName: string;
  storeSlug: string;
  description: string;
  contactEmail: string;
  stellarPayoutAddress: string;
  category: string;
  websiteUrl: string;
  payoutAddress?: string;
  domainName?: string;
  isDomainVerified?: boolean;
  acceptedCurrencies?: string[];
  catalogRows?: CatalogImportRow[];
}

export interface MerchantOnboardingData {
  storeName: string;
  storeSlug: string;
  description: string;
  contactEmail: string;
  payoutAddress: string;
  domainName: string;
  isDomainVerified: boolean;
  acceptedCurrencies: string[];
}

export type OnboardingStep =
  | "store_info"
  | "catalog_import"
  | "wallet_verify"
  | "contract_register"
  | "complete"
  | "store_details"
  | "payout_address"
  | "contract_binding"
  | "verification";

export const MERCHANT_CATEGORIES = ["XLM", "USD", "EUR", "GBP", "JPY"] as const;

const retryingFetch = createRetryingFetch();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidContactEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

export function isValidStoreSlug(slug: string): boolean {
  if (!slug || slug.length === 0) return false;
  if (slug.length > 64) return false;
  return SLUG_RE.test(slug.toLowerCase());
}

export function generateStoreSlug(storeName: string): string {
  return storeName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
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
 * Validates domain format without network access.
 */
export function validateDomainFormat(domain: string): {
  valid: boolean;
  error?: string;
} {
  if (!domain || domain.trim().length === 0) {
    return { valid: false, error: "Domain name is required." };
  }
  const trimmed = domain.trim();
  if (trimmed.length > 253) {
    return { valid: false, error: "Domain name is too long (max 253 characters)." };
  }
  if (!/^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$/.test(trimmed)) {
    return { valid: false, error: "Enter a valid domain name (e.g., example.com)." };
  }
  return { valid: true };
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

/**
 * Loads persisted onboarding state from localStorage.
 */
export function loadOnboardingState(): MerchantOnboardingData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem("delego_merchant_onboarding");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed as MerchantOnboardingData;
  } catch {
    return null;
  }
}

/**
 * Saves onboarding state to localStorage for persistence across navigation.
 */
export function saveOnboardingState(data: MerchantOnboardingData): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem("delego_merchant_onboarding", JSON.stringify(data));
  } catch {
    // Storage unavailable - continue anyway
  }
}

/**
 * Clears onboarding state (used when registration is complete or user cancels).
 */
export function clearOnboardingState(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem("delego_merchant_onboarding");
  } catch {
    // Ignore cleanup failures
  }
}