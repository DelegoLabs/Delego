import { describe, expect, it } from "vitest";
import type { MerchantProduct } from "./merchantCatalog";
import {
  buildDuplicateDraft,
  collectTakenSkus,
  duplicateTitle,
  suggestDuplicateSku,
  validateDuplicateDraft,
  validateDuplicateSku,
} from "./productDuplicate";
import type { CatalogVariantRecord } from "./variantMatrix";

const SOURCE: MerchantProduct = {
  id: "prod-1",
  sku: "TEE",
  title: "Organic Tee",
  description: "Soft cotton tee",
  priceStroops: "250000000",
  assetCode: "USDC",
  stockQuantity: 42,
  isListed: true,
  updatedAt: "2026-10-01T00:00:00Z",
  category: "Clothing",
  imageUrl: "https://cdn.example.com/tee.png",
};

const VARIANTS: CatalogVariantRecord = {
  productKey: "organic tee",
  attributes: [{ name: "Size", values: ["S", "M"] }],
  variants: [
    { sku: "TEE-S", attributes: { Size: "S" }, priceStroops: "250000000", stockCount: 7, barcode: "0001" },
    { sku: "TEE-M", attributes: { Size: "M" }, priceStroops: "260000000", stockCount: 3 },
  ],
};

const options = (overrides = {}) => ({
  sourceProductId: "prod-1",
  newSku: "TEE-2",
  copyImages: true,
  copyVariants: true,
  ...overrides,
});

describe("duplicateTitle", () => {
  it("appends (Copy)", () => {
    expect(duplicateTitle("  Organic Tee ")).toBe("Organic Tee (Copy)");
  });
});

describe("suggestDuplicateSku", () => {
  it("suggests the first free -COPY suffix, case-insensitively", () => {
    expect(suggestDuplicateSku("TEE", ["TEE"])).toBe("TEE-COPY");
    expect(suggestDuplicateSku("TEE", ["TEE", "tee-copy"])).toBe("TEE-COPY-2");
    expect(suggestDuplicateSku("TEE", ["TEE", "TEE-COPY", "TEE-COPY-2"])).toBe("TEE-COPY-3");
  });
});

describe("validateDuplicateSku", () => {
  it("rejects empty, malformed and colliding SKUs", () => {
    expect(validateDuplicateSku("  ", [])).toMatch(/required/);
    expect(validateDuplicateSku("TEE 2", [])).toMatch(/only contain/);
    expect(validateDuplicateSku("x".repeat(65), [])).toMatch(/64 characters/);
    expect(validateDuplicateSku("tee", ["TEE"])).toMatch(/already used/);
    expect(validateDuplicateSku(" TEE ", ["TEE"])).toMatch(/already used/);
  });

  it("accepts a fresh SKU", () => {
    expect(validateDuplicateSku("TEE-2", ["TEE", "TEE-S"])).toBeNull();
  });
});

describe("buildDuplicateDraft", () => {
  it("copies attributes, appends (Copy), zeroes stock and creates it unlisted", () => {
    const draft = buildDuplicateDraft(SOURCE, options(), VARIANTS);
    expect(draft).toMatchObject({
      sku: "TEE-2",
      title: "Organic Tee (Copy)",
      description: "Soft cotton tee",
      priceStroops: "250000000",
      assetCode: "USDC",
      category: "Clothing",
      stockQuantity: 0,
      isListed: false,
      imageUrl: "https://cdn.example.com/tee.png",
    });
  });

  it("re-keys variants to the new SKU with zero stock and no barcodes", () => {
    const draft = buildDuplicateDraft(SOURCE, options(), VARIANTS);
    expect(draft.variants?.productKey).toBe("organic tee (copy)");
    expect(draft.variants?.variants).toEqual([
      { sku: "TEE-2-S", attributes: { Size: "S" }, priceStroops: "250000000", stockCount: 0 },
      { sku: "TEE-2-M", attributes: { Size: "M" }, priceStroops: "260000000", stockCount: 0 },
    ]);
    // The source record is untouched.
    expect(VARIANTS.variants[0]?.stockCount).toBe(7);
  });

  it("skips images and variants when not requested", () => {
    const draft = buildDuplicateDraft(
      SOURCE,
      options({ copyImages: false, copyVariants: false }),
      VARIANTS
    );
    expect(draft.imageUrl).toBeUndefined();
    expect(draft.variants).toBeNull();
  });

  it("refuses options for a different product", () => {
    expect(() =>
      buildDuplicateDraft(SOURCE, options({ sourceProductId: "other" }))
    ).toThrow(/do not match/);
  });
});

describe("validateDuplicateDraft", () => {
  it("catches variant SKUs that collide with the catalog", () => {
    const draft = buildDuplicateDraft(SOURCE, options(), VARIANTS);
    const taken = collectTakenSkus([SOURCE], [VARIANTS]);
    expect(validateDuplicateDraft(draft, taken)).toBeNull();
    expect(validateDuplicateDraft(draft, [...taken, "tee-2-m"])).toMatch(
      /Variant SKU "TEE-2-M"/
    );
  });

  it("catches a base SKU collision", () => {
    const draft = buildDuplicateDraft(SOURCE, options({ newSku: "TEE-S" }));
    expect(validateDuplicateDraft(draft, collectTakenSkus([SOURCE], [VARIANTS]))).toMatch(
      /already used/
    );
  });
});
