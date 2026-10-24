/**
 * Public merchant storefront (#695).
 */

import { parseStockDepletion, type StockDepletionInfo } from "./stockDepletion";
import type { CartItem } from "./cart";

import type { MerchantPolicyInfo } from "@delegolabs/types";

export const DEFAULT_MERCHANT_POLICY: MerchantPolicyInfo = {
  returnWindowDays: 30,
  restockingFeePercent: 0,
  freeShippingThresholdStroops: "100000000",
  escrowProtectionNotice:
    "Purchases are protected by Delego smart contract escrow. Funds are securely locked until delivery is confirmed.",
};

export interface MerchantProduct {
  id: string;
  name: string;
  description: string;
  priceStroops: string;
  assetCode?: CartItem["assetCode"];
  active: boolean;
  /** Product gallery URLs supplied by the storefront API, in display order. */
  images?: string[];
  stock?: StockDepletionInfo;
  policy?: MerchantPolicyInfo;
}

export type StoreAnnouncementType = "info" | "warning" | "promotion";

export interface StoreAnnouncement {
  text: string;
  linkUrl?: string;
  bannerType: StoreAnnouncementType;
  /** Merchant-controlled version marker; a change re-shows a dismissed banner. */
  updatedAt: string;
}

export interface StorefrontData {
  merchantId: string;
  storeName: string;
  description: string;
  stellarAddress: string;
  reputationScore: number;
  policy: MerchantPolicyInfo;
  products: MerchantProduct[];
  announcement: StoreAnnouncement | null;
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
  if (
    typeof value === "string" &&
    value.trim() &&
    Number.isFinite(Number(value))
  ) {
    return Number(value);
  }
  return 0;
}

function parseProduct(value: unknown): MerchantProduct | null {
  const record = asRecord(value);
  if (
    !record ||
    typeof record.id !== "string" ||
    typeof record.name !== "string"
  ) {
    return null;
  }
  const price = record.priceStroops ?? record.price_stroops ?? "0";
  const stock = parseStockDepletion(
    record.stock ?? {
      remainingStock:
        record.remainingStock ?? record.remaining_stock ?? record.stockQuantity,
      reservedStock: record.reservedStock ?? record.reserved_stock,
      allowBackorder: record.allowBackorder ?? record.allow_backorder,
      restockWaitlistCount:
        record.restockWaitlistCount ?? record.restock_waitlist_count,
    },
    record.id
  );
  const imageValues = Array.isArray(record.images)
    ? record.images
    : Array.isArray(record.imageUrls)
      ? record.imageUrls
      : Array.isArray(record.image_urls)
        ? record.image_urls
        : [record.imageUrl ?? record.image_url];
  const images = Array.from(
    new Set(
      imageValues.filter(
        (image): image is string =>
          typeof image === "string" && image.trim().length > 0
      )
    )
  );
  const assetCode = record.assetCode ?? record.asset_code;
  return {
    id: record.id,
    name: record.name,
    description:
      typeof record.description === "string" ? record.description : "",
    priceStroops:
      typeof price === "bigint" ? price.toString() : String(price ?? "0"),
    ...(assetCode === "USDC" || assetCode === "XLM" || assetCode === "EURC"
      ? { assetCode }
      : {}),
    active: record.active !== false,
    ...(images.length > 0 ? { images } : {}),
    ...(stock ? { stock } : {}),
  };
}

function parseAnnouncement(value: unknown): StoreAnnouncement | null {
  const record = asRecord(value);
  if (!record || typeof record.text !== "string" || !record.text.trim()) {
    return null;
  }

  const bannerType = record.bannerType ?? record.banner_type;
  if (
    bannerType !== "info" &&
    bannerType !== "warning" &&
    bannerType !== "promotion"
  ) {
    return null;
  }

  const rawLink = record.linkUrl ?? record.link_url;
  const linkUrl =
    typeof rawLink === "string" && isSafeAnnouncementLink(rawLink)
      ? rawLink
      : undefined;
  const updatedAt =
    typeof record.updatedAt === "string"
      ? record.updatedAt
      : typeof record.updated_at === "string"
        ? record.updated_at
        : "";

  return {
    text: record.text.trim(),
    bannerType,
    updatedAt,
    ...(linkUrl ? { linkUrl } : {}),
  };
}

/** Only same-site paths and http(s) links are rendered as announcement CTAs. */
function isSafeAnnouncementLink(value: string): boolean {
  const link = value.trim();
  if (!link) return false;
  if (link.startsWith("/") && !link.startsWith("//")) return true;
  return /^https?:\/\//i.test(link);
}

function parsePolicy(value: unknown): MerchantPolicyInfo | null {
  const record = asRecord(value);
  if (!record) return null;

  return {
    returnWindowDays: asNumber(
      record.returnWindowDays ?? record.return_window_days
    ),
    restockingFeePercent: asNumber(
      record.restockingFeePercent ?? record.restocking_fee_percent
    ),
    freeShippingThresholdStroops: String(
      record.freeShippingThresholdStroops ??
        record.free_shipping_threshold_stroops ??
        DEFAULT_MERCHANT_POLICY.freeShippingThresholdStroops
    ),
    escrowProtectionNotice:
      typeof record.escrowProtectionNotice === "string"
        ? record.escrowProtectionNotice
        : typeof record.escrow_protection_notice === "string"
          ? record.escrow_protection_notice
          : DEFAULT_MERCHANT_POLICY.escrowProtectionNotice,
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

  const announcement = parseAnnouncement(
    body.announcement ?? body.storeAnnouncement ?? body.store_announcement
  );

  return {
    merchantId:
      typeof body.merchantId === "string" ? body.merchantId : merchantId,
    storeName: body.storeName.trim(),
    description: typeof body.description === "string" ? body.description : "",
    stellarAddress:
      typeof body.stellarAddress === "string" ? body.stellarAddress : "",
    reputationScore: asNumber(body.reputationScore),
    policy: parsePolicy(body.policy) ?? DEFAULT_MERCHANT_POLICY,
    products,
    announcement,
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
