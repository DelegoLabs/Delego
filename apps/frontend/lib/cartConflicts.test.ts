import { describe, expect, it } from "vitest";
import type { CartItem } from "./cart";
import {
  applyConflictResolution,
  detectCartConflicts,
  loadCartSnapshot,
  saveCartSnapshot,
  type ServerProductSnapshot,
} from "./cartConflicts";

function item(overrides: Partial<CartItem> = {}): CartItem {
  return {
    productId: "p1",
    merchantId: "m1",
    merchantName: "Merchant",
    payoutAddress: "GDEST",
    title: "Widget",
    priceStroops: "10000000",
    quantity: 2,
    maxStock: 10,
    ...overrides,
  };
}

function live(overrides: Partial<ServerProductSnapshot> = {}): ServerProductSnapshot {
  return { productId: "p1", priceStroops: "10000000", availableStock: 10, ...overrides };
}

describe("detectCartConflicts", () => {
  it("reports nothing when the server agrees with the cache", () => {
    expect(detectCartConflicts([item()], [live()])).toEqual([]);
  });

  it("flags a price change made while offline", () => {
    const [conflict] = detectCartConflicts([item()], [live({ priceStroops: "12000000" })]);
    expect(conflict).toMatchObject({
      productId: "p1",
      conflictType: "price_changed",
      cachedPriceStroops: "10000000",
      serverPriceStroops: "12000000",
    });
  });

  it("flags lines that sold out or were delisted", () => {
    expect(detectCartConflicts([item()], [live({ availableStock: 0 })])[0]?.conflictType).toBe(
      "out_of_stock"
    );
    expect(detectCartConflicts([item()], [])[0]?.conflictType).toBe("out_of_stock");
  });

  it("prefers a stock shortfall over a price change", () => {
    const [conflict] = detectCartConflicts(
      [item({ quantity: 5 })],
      [live({ availableStock: 3, priceStroops: "9000000" })]
    );
    expect(conflict).toMatchObject({
      conflictType: "insufficient_quantity",
      cachedQuantity: 5,
      availableStock: 3,
    });
  });
});

describe("applyConflictResolution", () => {
  it("accepting a new price updates the line", () => {
    const [conflict] = detectCartConflicts([item()], [live({ priceStroops: "12000000" })]);
    const next = applyConflictResolution([item()], conflict!, "accept");
    expect(next[0]).toMatchObject({ priceStroops: "12000000", quantity: 2 });
  });

  it("accepting a shortfall clamps quantity to available stock", () => {
    const cart = [item({ quantity: 5 })];
    const [conflict] = detectCartConflicts(cart, [live({ availableStock: 3 })]);
    const next = applyConflictResolution(cart, conflict!, "accept");
    expect(next[0]).toMatchObject({ quantity: 3, maxStock: 3 });
  });

  it("removing (or accepting an out-of-stock line) drops it", () => {
    const cart = [item(), item({ productId: "p2" })];
    const [conflict] = detectCartConflicts([cart[0]!], [live({ availableStock: 0 })]);
    expect(applyConflictResolution(cart, conflict!, "remove").map((i) => i.productId)).toEqual([
      "p2",
    ]);
    expect(applyConflictResolution(cart, conflict!, "accept").map((i) => i.productId)).toEqual([
      "p2",
    ]);
  });
});

describe("IndexedDB cart snapshot", () => {
  it("round-trips the cached cart and drops malformed rows", async () => {
    await saveCartSnapshot([item(), { bogus: true } as unknown as CartItem]);
    expect(await loadCartSnapshot()).toEqual([item()]);
  });
});
