/**
 * Merchant directory lookup for the whitelist picker (#524).
 *
 * The Permissions contract already supports bounded merchant whitelists
 * (#61, #104, #370); this is the frontend's read side, backed by the
 * gateway's merchant directory endpoint. `@delegolabs/sdk`'s `DelegoClient`
 * is an external package this workspace can't resolve/typecheck against
 * locally, so the request is issued as a plain fetch against the same base
 * URL the SDK uses, keeping the same `ApiResponse<T>` shape the rest of the
 * app expects from `api.*` calls.
 */

import { env } from "./env";

export interface DirectoryMerchant {
  id: string;
  name: string;
  /**
   * Public key the merchant publishes for encrypted delivery instructions
   * (#1005): base64 SPKI (or PEM) RSA-OAEP key, SHA-256, at least 2048 bits.
   * Optional; checkout disables the delivery instructions field without it.
   */
  deliveryPublicKey?: string;
}

export interface MerchantDirectoryResult {
  merchants: DirectoryMerchant[];
  error: string | null;
}

/** Fetch the gateway's merchant directory, used to populate the whitelist picker. */
export async function fetchMerchantDirectory(
  signal?: AbortSignal
): Promise<MerchantDirectoryResult> {
  try {
    const res = await fetch(`${env.NEXT_PUBLIC_API_URL}/merchants/directory`, {
      signal,
      credentials: "include",
    });
    if (!res.ok) {
      return {
        merchants: [],
        error: `Failed to load merchant directory (${res.status})`,
      };
    }
    const data: unknown = await res.json();
    if (!isDirectoryMerchantArray(data)) {
      return { merchants: [], error: "Invalid merchant directory response" };
    }
    return { merchants: data, error: null };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { merchants: [], error: null };
    }
    return { merchants: [], error: "Failed to load merchant directory" };
  }
}

function isDirectoryMerchantArray(data: unknown): data is DirectoryMerchant[] {
  if (!Array.isArray(data)) return false;
  return data.every(
    (item) =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as DirectoryMerchant).id === "string" &&
      typeof (item as DirectoryMerchant).name === "string"
  );
}

/**
 * Delivery key for `merchantId`, or `undefined` when the merchant is unknown
 * or has not published a usable key. Malformed values are ignored rather
 * than rejecting the whole directory response.
 */
export function merchantDeliveryKey(
  merchants: DirectoryMerchant[],
  merchantId: string | undefined
): string | undefined {
  if (!merchantId) return undefined;
  const key = merchants.find((m) => m.id === merchantId)?.deliveryPublicKey;
  return typeof key === "string" && key.trim() ? key : undefined;
}

/** Case-insensitive substring filter over the directory, for the picker's search box. */
export function filterMerchants(
  merchants: DirectoryMerchant[],
  search: string
): DirectoryMerchant[] {
  const query = search.trim().toLowerCase();
  if (!query) return merchants;
  return merchants.filter(
    (m) =>
      m.id.toLowerCase().includes(query) || m.name.toLowerCase().includes(query)
  );
}
