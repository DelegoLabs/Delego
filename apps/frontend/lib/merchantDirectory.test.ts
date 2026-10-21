import { describe, it, expect } from "vitest";
import {
  filterMerchants,
  merchantDeliveryKey,
  type DirectoryMerchant,
} from "./merchantDirectory";

const MERCHANTS: DirectoryMerchant[] = [
  { id: "merchant-a", name: "Acme Groceries" },
  { id: "merchant-b", name: "Bolt Electronics" },
  { id: "merchant-c", name: "Corner Cafe" },
];

describe("filterMerchants", () => {
  it("returns every merchant when the search is empty", () => {
    expect(filterMerchants(MERCHANTS, "")).toEqual(MERCHANTS);
    expect(filterMerchants(MERCHANTS, "   ")).toEqual(MERCHANTS);
  });

  it("matches case-insensitively against the merchant name", () => {
    expect(filterMerchants(MERCHANTS, "acme")).toEqual([MERCHANTS[0]]);
  });

  it("matches against the merchant id", () => {
    expect(filterMerchants(MERCHANTS, "merchant-b")).toEqual([MERCHANTS[1]]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(filterMerchants(MERCHANTS, "nonexistent")).toEqual([]);
  });
});

describe("merchantDeliveryKey (#1005)", () => {
  const directory: DirectoryMerchant[] = [
    { id: "merchant-a", name: "Acme Groceries", deliveryPublicKey: "MIIBIjAN" },
    { id: "merchant-b", name: "Bolt Electronics" },
    { id: "merchant-c", name: "Corner Cafe", deliveryPublicKey: "   " },
  ];

  it("returns the key the merchant published", () => {
    expect(merchantDeliveryKey(directory, "merchant-a")).toBe("MIIBIjAN");
  });

  it("returns undefined for an unknown merchant or a missing or blank key", () => {
    expect(merchantDeliveryKey(directory, undefined)).toBeUndefined();
    expect(merchantDeliveryKey(directory, "merchant-z")).toBeUndefined();
    expect(merchantDeliveryKey(directory, "merchant-b")).toBeUndefined();
    expect(merchantDeliveryKey(directory, "merchant-c")).toBeUndefined();
  });

  it("ignores a key that is not a string", () => {
    const malformed = [
      { id: "merchant-d", name: "Delta", deliveryPublicKey: 42 },
    ] as unknown as DirectoryMerchant[];
    expect(merchantDeliveryKey(malformed, "merchant-d")).toBeUndefined();
  });
});
