/**
 * Public merchant storefront (#695).
 */

export interface MerchantProduct {
  id: string;
  name: string;
  description: string;
  priceStroops: string;
  active: boolean;
}

export interface StorefrontData {
  merchantId: string;
  storeName: string;
  description: string;
  stellarAddress: string;
  reputationScore: number;
  products: MerchantProduct[];
}

export function isSafeMerchantId(id: string): boolean {
  return id.length > 0 && id.length <= 128 && !/[\s/\\]/.test(id);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return 0;
}

function parseProduct(value: unknown): MerchantProduct | null {
  const record = asRecord(value);
  if (!record || typeof record.id !== "string" || typeof record.name !== "string") {
    return null;
  }
  const price = record.priceStroops ?? record.price_stroops ?? "0";
  return {
    id: record.id,
    name: record.name,
    description: typeof record.description === "string" ? record.description : "",
    priceStroops:
      typeof price === "bigint" ? price.toString() : String(price ?? "0"),
    active: record.active !== false,
  };
}

export function parseStorefront(
  payload: unknown,
  merchantId: string
): StorefrontData | null {
  const root = asRecord(payload);
  if (!root) return null;
  const body = asRecord(root.data) ?? root;
  if (typeof body.storeName !== "string" || !body.storeName.trim()) return null;

  const products = Array.isArray(body.products)
    ? body.products
        .map(parseProduct)
        .filter((product): product is MerchantProduct => product !== null)
        .filter((product) => product.active)
    : [];

  return {
    merchantId: typeof body.merchantId === "string" ? body.merchantId : merchantId,
    storeName: body.storeName.trim(),
    description: typeof body.description === "string" ? body.description : "",
    stellarAddress:
      typeof body.stellarAddress === "string" ? body.stellarAddress : "",
    reputationScore: asNumber(body.reputationScore),
    products,
  };
}

export function filterStoreProducts(
  products: MerchantProduct[],
  query: string
): MerchantProduct[] {
  const term = query.trim().toLowerCase();
  if (!term) return products;
  return products.filter(
    (product) =>
      product.name.toLowerCase().includes(term) ||
      product.description.toLowerCase().includes(term)
  );
}

export async function fetchStorefront(
  merchantId: string
): Promise<StorefrontData | null> {
  if (!isSafeMerchantId(merchantId)) return null;
  const base = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
  if (!base) return null;

  try {
    const res = await fetch(
      `${base}/merchants/${encodeURIComponent(merchantId)}/storefront`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    return parseStorefront(await res.json(), merchantId);
  } catch {
    return null;
  }
}
