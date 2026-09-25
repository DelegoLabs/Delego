import { env } from "./env";
import { createRetryingFetch } from "./api";

export interface MerchantProduct {
  id: string;
  sku: string;
  title: string;
  priceStroops: string;
  assetCode: "USDC" | "XLM" | "EURC";
  stockQuantity: number;
  isListed: boolean;
  updatedAt: string;
}

const retryingFetch = createRetryingFetch();
export const CATALOG_PAGE_SIZE = 50;

interface ListProductsResponse {
  products: MerchantProduct[];
  total: number;
}

/**
 * Fetches a page of the merchant's product catalog. There is no
 * `listMerchantProducts` method on `@delegolabs/sdk` yet, so this calls the
 * REST endpoint directly (see `submitShipment` in `lib/shipments.ts` for the
 * same pattern and its auth caveat).
 */
export async function fetchMerchantCatalogPage(
  offset: number,
  limit: number = CATALOG_PAGE_SIZE
): Promise<ListProductsResponse> {
  const params = new URLSearchParams({ offset: String(offset), limit: String(limit) });
  const res = await retryingFetch(`${env.NEXT_PUBLIC_API_URL}/merchant/products?${params}`, {
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(`Failed to load catalog (${res.status}).`);
  }
  const json = (await res.json()) as Partial<ListProductsResponse>;
  return { products: json.products ?? [], total: json.total ?? 0 };
}

/**
 * Updates a product's listing state. There is no `updateProductListing`
 * method on `@delegolabs/sdk` yet, so this calls the REST endpoint directly.
 */
export async function setProductListed(productId: string, isListed: boolean): Promise<void> {
  const res = await retryingFetch(`${env.NEXT_PUBLIC_API_URL}/merchant/products/${productId}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isListed }),
  });
  if (!res.ok) {
    throw new Error(`Failed to update listing (${res.status}).`);
  }
}

export function priceDisplay(product: MerchantProduct): string {
  const value = Number(BigInt(product.priceStroops)) / 10_000_000;
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${product.assetCode}`;
}
