/**
 * Product duplicate / template cloning (#1012).
 *
 * Builds a draft listing from an existing catalog product so merchants can
 * spin up near-identical items (new colourway, bundle size, …) without
 * re-typing everything. The clone is deliberately conservative:
 * - the title gets " (Copy)" appended so it's obvious in the catalog,
 * - stock is reset to zero (inventory never carries over),
 * - it's created unlisted, and
 * - it must get a SKU that doesn't collide with any existing product or
 *   variant SKU.
 */

import type { MerchantProduct } from "./merchantCatalog";
import {
  catalogProductKey,
  type CatalogVariantRecord,
  type ProductVariant,
} from "./variantMatrix";

export interface DuplicateProductOptions {
  sourceProductId: string;
  newSku: string;
  copyImages: boolean;
  copyVariants: boolean;
}

export interface DuplicateProductDraft {
  sku: string;
  title: string;
  description: string;
  priceStroops: string;
  assetCode: MerchantProduct["assetCode"];
  category?: string;
  /** Always 0 — inventory is never cloned. */
  stockQuantity: 0;
  /** Clones are created unlisted so they can be reviewed first. */
  isListed: false;
  imageUrl?: string;
  /** Variant matrix re-keyed to the new SKU, with every variant's stock at 0. */
  variants: CatalogVariantRecord | null;
}

export const COPY_SUFFIX = " (Copy)";
export const MAX_SKU_LENGTH = 64;
const SKU_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** SKUs are compared case-insensitively and ignoring surrounding whitespace. */
export function normalizeSku(sku: string): string {
  return sku.trim().toUpperCase();
}

export function duplicateTitle(title: string): string {
  return `${title.trim()}${COPY_SUFFIX}`;
}

/** First free `<SKU>-COPY`, `<SKU>-COPY-2`, … that collides with nothing. */
export function suggestDuplicateSku(
  sourceSku: string,
  existingSkus: Iterable<string>
): string {
  const taken = new Set([...existingSkus].map(normalizeSku));
  const base = `${sourceSku.trim()}-COPY`.slice(0, MAX_SKU_LENGTH - 4);
  if (!taken.has(normalizeSku(base))) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base}-${n}`;
    if (!taken.has(normalizeSku(candidate))) return candidate;
  }
}

/** Returns an error message for an unusable SKU, or null when it's valid. */
export function validateDuplicateSku(
  sku: string,
  existingSkus: Iterable<string>
): string | null {
  const trimmed = sku.trim();
  if (!trimmed) return "SKU is required.";
  if (trimmed.length > MAX_SKU_LENGTH) {
    return `SKU must be ${MAX_SKU_LENGTH} characters or fewer.`;
  }
  if (!SKU_PATTERN.test(trimmed)) {
    return "SKU may only contain letters, numbers, dots, dashes and underscores.";
  }
  const wanted = normalizeSku(trimmed);
  for (const existing of existingSkus) {
    if (normalizeSku(existing) === wanted) {
      return `SKU "${trimmed}" is already used by another product.`;
    }
  }
  return null;
}

/**
 * Every SKU the clone must not reuse: the catalog's product SKUs plus any
 * variant SKUs stored for those products.
 */
export function collectTakenSkus(
  products: MerchantProduct[],
  variantRecords: Array<CatalogVariantRecord | null> = []
): string[] {
  const skus = products.map((p) => p.sku);
  for (const record of variantRecords) {
    if (!record) continue;
    for (const variant of record.variants) skus.push(variant.sku);
  }
  return skus;
}

/**
 * Re-keys variant SKUs onto the new base SKU. A variant SKU that starts with
 * the source SKU keeps its suffix (`TEE-RED-M` → `TEE2-RED-M`); anything else
 * is suffixed with its position so it's still unique.
 */
function cloneVariants(
  variants: ProductVariant[],
  sourceSku: string,
  newSku: string
): ProductVariant[] {
  const prefix = normalizeSku(sourceSku);
  const used = new Set<string>();
  return variants.map((variant, index) => {
    const upper = normalizeSku(variant.sku);
    let sku =
      prefix && upper.startsWith(prefix)
        ? `${newSku}${variant.sku.trim().slice(prefix.length)}`
        : `${newSku}-${index + 1}`;
    while (used.has(normalizeSku(sku))) sku = `${sku}-${index + 1}`;
    used.add(normalizeSku(sku));
    // Barcodes identify physical stock, so they never carry over.
    const { barcode: _barcode, ...rest } = variant;
    return { ...rest, sku, stockCount: 0 };
  });
}

/** Builds the clone draft that pre-populates the "Add product" form. */
export function buildDuplicateDraft(
  source: MerchantProduct,
  options: DuplicateProductOptions,
  sourceVariants: CatalogVariantRecord | null = null
): DuplicateProductDraft {
  if (options.sourceProductId !== source.id) {
    throw new Error("Duplicate options do not match the source product.");
  }
  const sku = options.newSku.trim();
  const title = duplicateTitle(source.title);

  const variants =
    options.copyVariants && sourceVariants && sourceVariants.variants.length > 0
      ? {
          productKey: catalogProductKey(title),
          attributes: sourceVariants.attributes.map((a) => ({
            name: a.name,
            values: [...a.values],
          })),
          variants: cloneVariants(sourceVariants.variants, source.sku, sku),
        }
      : null;

  return {
    sku,
    title,
    description: source.description ?? "",
    priceStroops: source.priceStroops,
    assetCode: source.assetCode,
    ...(source.category ? { category: source.category } : {}),
    stockQuantity: 0,
    isListed: false,
    ...(options.copyImages && source.imageUrl
      ? { imageUrl: source.imageUrl }
      : {}),
    variants,
  };
}

/**
 * Validates the final SKU set for a draft: the base SKU and every cloned
 * variant SKU must be unique against the catalog and against each other.
 */
export function validateDuplicateDraft(
  draft: DuplicateProductDraft,
  existingSkus: Iterable<string>
): string | null {
  const taken = [...existingSkus];
  const baseError = validateDuplicateSku(draft.sku, taken);
  if (baseError) return baseError;

  const seen = new Set([normalizeSku(draft.sku)]);
  const takenSet = new Set(taken.map(normalizeSku));
  for (const variant of draft.variants?.variants ?? []) {
    const key = normalizeSku(variant.sku);
    if (seen.has(key) || takenSet.has(key)) {
      return `Variant SKU "${variant.sku}" collides with an existing SKU.`;
    }
    seen.add(key);
  }
  return null;
}
