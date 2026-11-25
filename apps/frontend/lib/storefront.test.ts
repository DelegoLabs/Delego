import { describe, expect, it } from "vitest";
import {
  DEFAULT_MERCHANT_DELIVERY_SETTINGS,
  parseStorefront,
} from "./storefront";

const basePayload = {
  storeName: "Test Store",
  description: "A store",
  stellarAddress: "GABC123",
  reputationScore: 90,
  policy: {
    returnWindowDays: 30,
    restockingFeePercent: 0,
    freeShippingThresholdStroops: "100000000",
    escrowProtectionNotice: "Protected by escrow.",
  },
  products: [
    {
      id: "product-1",
      name: "Product 1",
      description: "A product",
      priceStroops: "10000000",
      active: true,
    },
  ],
  announcement: null,
};

describe("parseStorefront delivery settings", () => {
  it("parses storefront delivery settings from nested payloads", () => {
    const store = parseStorefront(
      {
        ...basePayload,
        delivery_estimate: {
          handling_days: "2",
          transit_days_min: 4,
          transit_days_max: 7,
          express_transit_days_min: 1,
          express_transit_days_max: 2,
        },
      },
      "merchant-1"
    );

    expect(store?.deliveryEstimate).toEqual({
      handlingDays: 2,
      transitDaysMin: 4,
      transitDaysMax: 7,
      expressTransitDaysMin: 1,
      expressTransitDaysMax: 2,
      expressAvailable: true,
    });
  });

  it("parses product-level delivery settings as an override", () => {
    const store = parseStorefront(
      {
        ...basePayload,
        deliveryEstimate: {
          handlingDays: 3,
          transitDaysMin: 5,
          transitDaysMax: 8,
        },
        products: [
          {
            ...basePayload.products[0],
            deliveryEstimate: {
              handlingDays: 0,
              transitDaysMin: 1,
              transitDaysMax: 1,
              expressAvailable: false,
            },
          },
        ],
      },
      "merchant-1"
    );

    expect(store?.deliveryEstimate?.handlingDays).toBe(3);
    expect(store?.products[0].deliveryEstimate).toEqual({
      handlingDays: 0,
      transitDaysMin: 1,
      transitDaysMax: 1,
      expressAvailable: false,
    });
  });

  it("falls back to defaults when settings are missing or invalid", () => {
    const store = parseStorefront(
      {
        ...basePayload,
        deliveryEstimate: {
          handlingDays: -3,
          transitDaysMin: "invalid",
          transitDaysMax: 2,
        },
      },
      "merchant-1"
    );

    expect(store?.deliveryEstimate).toEqual({
      ...DEFAULT_MERCHANT_DELIVERY_SETTINGS,
      transitDaysMax: 3,
      expressAvailable: false,
    });
  });
});
