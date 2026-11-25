import { describe, it, expect, afterEach, vi } from "vitest";
import {
  fetchMerchantDirectory,
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

describe("directory metadata", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("preserves valid metadata, delivery keys, and legacy rows", async () => {
    const rows = [
      {
        id: "a",
        name: "Acme",
        category: " Food ",
        description: " Fresh food ",
        verificationTier: "gold",
        reputationScore: 90,
        totalOrdersCompleted: 12,
        deliveryPublicKey: "key",
      },
      { id: "b", name: "Legacy" },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify(rows)))
    );
    const result = await fetchMerchantDirectory();
    expect(result.error).toBeNull();
    expect(result.merchants[0]).toMatchObject({
      ...rows[0],
      category: "Food",
      description: "Fresh food",
    });
    expect(result.merchants[1]).toMatchObject(rows[1]);
    expect(result.merchants[1].reputationScore).toBeUndefined();
  });

  it.each([-1, 101, "95", null])(
    "ignores invalid optional metadata (score %s)",
    async (score) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify([
              {
                id: "a",
                name: "Acme",
                category: 42,
                description: {},
                verificationTier: "admin",
                reputationScore: score,
                totalOrdersCompleted: -1,
              },
            ])
          )
        )
      );
      const { merchants } = await fetchMerchantDirectory();
      expect(merchants[0]).toMatchObject({ id: "a", name: "Acme" });
      for (const field of [
        "category",
        "description",
        "verificationTier",
        "reputationScore",
        "totalOrdersCompleted",
      ] as const) {
        expect(merchants[0][field]).toBeUndefined();
      }
    }
  );

  it("rejects invalid core rows", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify([{ id: "a" }])))
    );
    expect(await fetchMerchantDirectory()).toEqual({
      merchants: [],
      error: "Invalid merchant directory response",
    });
  });
});
