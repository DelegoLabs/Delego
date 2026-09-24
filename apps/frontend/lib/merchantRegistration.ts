import { env } from "./env";
import { createRetryingFetch } from "./api";

export interface MerchantRegistrationForm {
  storeName: string;
  description: string;
  contactEmail: string;
  stellarPayoutAddress: string;
  category: "electronics" | "clothing" | "services" | "digital" | "other";
  websiteUrl?: string;
}

export type OnboardingStep = "store_info" | "wallet_verify" | "contract_register" | "complete";

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
