import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOW_STOCK_THRESHOLD,
  computeDepletedProductCount,
  computeDepletedProducts,
  evaluateInventoryStock,
  listDepletedInventory,
  normalizeThreshold,
} from "./inventoryStock";

const product = {
  productId: "p1",
  sku: "MUG-1",
  title: "Blue mug",
};

describe("evaluateInventoryStock", () => {
  it("flags zero stock as out of stock and not low stock", () => {
    const status = evaluateInventoryStock({
      ...product,
      currentStock: 0,
      threshold: 5,
    });
    expect(status.isOutOfStock).toBe(true);
    expect(status.isLowStock).toBe(false);
    expect(status.currentStock).toBe(0);
  });

  it("flags positive stock at or under the threshold as low stock", () => {
    expect(
      evaluateInventoryStock({ ...product, currentStock: 3, threshold: 5 })
        .isLowStock
    ).toBe(true);
    const atThreshold = evaluateInventoryStock({
      ...product,
      currentStock: 5,
      threshold: 5,
    });
    expect(atThreshold.isLowStock).toBe(true);
    expect(atThreshold.isOutOfStock).toBe(false);
  });

  it("leaves healthy stock unmarked", () => {
    const status = evaluateInventoryStock({
      ...product,
      currentStock: 6,
      threshold: 5,
    });
    expect(status.isLowStock).toBe(false);
    expect(status.isOutOfStock).toBe(false);
  });

  it("treats a zero threshold as disabled low-stock warnings", () => {
    const status = evaluateInventoryStock({
      ...product,
      currentStock: 1,
      threshold: 0,
    });
    expect(status.isLowStock).toBe(false);
    expect(status.isOutOfStock).toBe(false);
  });

  it("clamps negative and fractional counts to whole units", () => {
    expect(
      evaluateInventoryStock({ ...product, currentStock: -4, threshold: 5 })
        .isOutOfStock
    ).toBe(true);
    expect(
      evaluateInventoryStock({ ...product, currentStock: 2.9, threshold: 5 })
        .currentStock
    ).toBe(2);
  });

  it("falls back when the threshold is not a number", () => {
    expect(normalizeThreshold("nope")).toBe(DEFAULT_LOW_STOCK_THRESHOLD);
    expect(normalizeThreshold("")).toBe(DEFAULT_LOW_STOCK_THRESHOLD);
    expect(normalizeThreshold(-3)).toBe(0);
  });
});

describe("listDepletedInventory", () => {
  it("returns only low and out-of-stock rows, in catalog order", () => {
    const depleted = listDepletedInventory(
      [
        { id: "a", sku: "A", title: "Healthy", stockQuantity: 20 },
        { id: "b", sku: "B", title: "Low", stockQuantity: 2 },
        { id: "c", sku: "C", title: "Empty", stockQuantity: 0 },
      ],
      5
    );
    expect(depleted.map((row) => row.productId)).toEqual(["b", "c"]);
    expect(depleted[0].isLowStock).toBe(true);
    expect(depleted[1].isOutOfStock).toBe(true);
  });
});

describe("computeDepletedProducts", () => {
  it("computes depleted products for items with 0 or < 5 units remaining", () => {
    const catalog = [
      { id: "1", title: "Wireless Mouse", stockQuantity: 3, isListed: true },
      { id: "2", title: "Mechanical Keyboard", stockQuantity: 0, isListed: true },
      { id: "3", title: "Monitor Stand", stockQuantity: 10, isListed: true },
    ];

    const result = computeDepletedProducts(catalog);
    expect(result.depletedProductsCount).toBe(2);
    expect(result.criticalItemTitles).toEqual(["Wireless Mouse", "Mechanical Keyboard"]);
    expect(result.hasOutOfStock).toBe(true);
    expect(result.severity).toBe("red");
  });

  it("sets severity to amber when items have low stock (< 5) but none at 0", () => {
    const catalog = [
      { id: "1", title: "USB-C Cable", stockQuantity: 2, isListed: true },
      { id: "2", title: "Desk Mat", stockQuantity: 4, isListed: true },
      { id: "3", title: "Webcam", stockQuantity: 8, isListed: true },
    ];

    const result = computeDepletedProducts(catalog);
    expect(result.depletedProductsCount).toBe(2);
    expect(result.criticalItemTitles).toEqual(["USB-C Cable", "Desk Mat"]);
    expect(result.hasOutOfStock).toBe(false);
    expect(result.severity).toBe("amber");
  });

  it("filters out unlisted/inactive items from depleted count", () => {
    const catalog = [
      { id: "1", title: "Archived Product", stockQuantity: 0, isListed: false },
      { id: "2", title: "Active Product", stockQuantity: 12, isListed: true },
    ];

    const result = computeDepletedProducts(catalog);
    expect(result.depletedProductsCount).toBe(0);
    expect(result.criticalItemTitles).toEqual([]);
    expect(result.hasOutOfStock).toBe(false);
  });

  it("returns 0 count when all active catalog items have >= 5 items remaining", () => {
    const catalog = [
      { id: "1", title: "Laptop Stand", stockQuantity: 5, isListed: true },
      { id: "2", title: "Headphones", stockQuantity: 25, isListed: true },
    ];

    const result = computeDepletedProducts(catalog);
    expect(result.depletedProductsCount).toBe(0);
    expect(result.criticalItemTitles).toEqual([]);
  });

  it("computes count via computeDepletedProductCount", () => {
    const catalog = [
      { title: "Item A", stockQuantity: 1, isListed: true },
      { title: "Item B", stockQuantity: 0, isListed: true },
      { title: "Item C", stockQuantity: 6, isListed: true },
    ];

    expect(computeDepletedProductCount(catalog)).toBe(2);
  });
});
