import { describe, expect, it, vi } from "vitest";
import {
  normalizeCarrier,
  parseBulkFulfillmentCsv,
  runBulkFulfillment,
  validateBulkFulfillment,
  withOptimisticShipments,
} from "./bulkFulfillment";
import type { MerchantEscrowOrder } from "./merchantEscrowOrders";


const FEDEX = "123456789012";
const UPS = "1Z999AA10123456784";
const SELECTED = ["ord-1", "ord-2", "ord-3"];

function order(orderId: string, status: MerchantEscrowOrder["status"] = "funded"): MerchantEscrowOrder {
  return {
    orderId,
    escrowId: `esc-${orderId}`,
    buyerAddress: "GBUYER",
    amountStroops: "10000000",
    currency: "USDC",
    status,
    shippingAddress: "1 Main St",
    fundedAt: "2026-03-01T00:00:00Z",
    deadline: "2026-03-08T00:00:00Z",
  };
}

describe("normalizeCarrier", () => {
  it("accepts carrier codes and labels case-insensitively", () => {
    expect(normalizeCarrier("fedex")).toBe("fedex");
    expect(normalizeCarrier(" FedEx ")).toBe("fedex");
    expect(normalizeCarrier("UPS")).toBe("ups");
    expect(normalizeCarrier("Royal Mail")).toBeNull();
  });
});

describe("validateBulkFulfillment", () => {
  it("normalizes valid items and keeps each tracking number on its own order", () => {
    const result = validateBulkFulfillment(
      [
        { orderId: "ord-1", carrier: "FedEx", trackingNumber: ` ${FEDEX} ` },
        { orderId: "ord-2", carrier: "ups", trackingNumber: UPS },
      ],
      SELECTED
    );
    expect(result.errors).toEqual([]);
    expect(result.items).toEqual([
      { orderId: "ord-1", carrier: "fedex", trackingNumber: FEDEX },
      { orderId: "ord-2", carrier: "ups", trackingNumber: UPS },
    ]);
  });

  it("rejects unselected, duplicate, unknown-carrier and malformed rows", () => {
    const result = validateBulkFulfillment(
      [
        { orderId: "ord-9", carrier: "fedex", trackingNumber: FEDEX },
        { orderId: "ord-1", carrier: "fedex", trackingNumber: FEDEX },
        { orderId: "ord-1", carrier: "fedex", trackingNumber: FEDEX },
        { orderId: "ord-2", carrier: "pigeon", trackingNumber: FEDEX },
        { orderId: "ord-3", carrier: "ups", trackingNumber: FEDEX },
      ],
      SELECTED
    );
    expect(result.errors.map((e) => [e.orderId, e.code])).toEqual([
      ["ord-9", "unknownOrder"],
      ["ord-1", "duplicateOrder"],
      ["ord-2", "invalidCarrier"],
      ["ord-3", "invalidTracking"],
    ]);
    expect(result.items.map((i) => i.orderId)).toEqual(["ord-1"]);
  });

  it("flags empty fields", () => {
    expect(
      validateBulkFulfillment([{ orderId: "ord-1", carrier: "fedex", trackingNumber: "" }], SELECTED).errors
    ).toEqual([{ orderId: "ord-1", code: "missingFields", line: undefined }]);
  });
});

describe("parseBulkFulfillmentCsv", () => {
  it("maps rows by header name in any column order, with quoted fields", () => {
    const csv = [
      "trackingNumber,OrderId,carrier",
      `${UPS},ord-2,UPS`,
      `"${FEDEX}","ord-1","FedEx"`,
      "",
    ].join("\r\n");
    expect(parseBulkFulfillmentCsv(csv, SELECTED)).toEqual({
      items: [
        { orderId: "ord-2", carrier: "ups", trackingNumber: UPS },
        { orderId: "ord-1", carrier: "fedex", trackingNumber: FEDEX },
      ],
      errors: [],
    });
  });

  it("reports errors with their CSV line numbers", () => {
    const csv = ["orderId,carrier,trackingNumber", `ord-1,fedex,${FEDEX}`, "ord-7,fedex,123456789012"].join("\n");
    expect(parseBulkFulfillmentCsv(csv, SELECTED).errors).toEqual([
      { line: 3, orderId: "ord-7", code: "unknownOrder" },
    ]);
  });

  it("requires the header row", () => {
    expect(parseBulkFulfillmentCsv(`ord-1,fedex,${FEDEX}`, SELECTED).errors).toEqual([
      { line: 1, code: "missingHeader" },
    ]);
    expect(parseBulkFulfillmentCsv("   ", SELECTED).errors).toEqual([{ code: "missingHeader" }]);
  });
});

describe("withOptimisticShipments", () => {
  it("marks only the given funded orders as shipped", () => {
    const orders = [order("ord-1"), order("ord-2"), order("ord-3", "released")];
    const result = withOptimisticShipments(orders, new Set(["ord-1", "ord-3"]));
    expect(result.map((o) => o.status)).toEqual(["shipped", "funded", "released"]);
    expect(orders[0].status).toBe("funded");
  });
});

describe("runBulkFulfillment", () => {
  it("submits each order with its own tracking number and isolates failures", async () => {
    const submit = vi.fn(async ({ orderId }: { orderId: string }) => {
      if (orderId === "ord-2") throw new Error("Order already shipped");
    });
    const results = await runBulkFulfillment(
      [
        { orderId: "ord-1", carrier: "fedex", trackingNumber: FEDEX },
        { orderId: "ord-2", carrier: "ups", trackingNumber: UPS },
        { orderId: "ord-3", carrier: "FedEx", trackingNumber: "999999999999" },
      ],
      submit
    );
    expect(submit.mock.calls.map(([s]) => s)).toEqual(
      expect.arrayContaining([
        { orderId: "ord-1", carrier: "fedex", trackingNumber: FEDEX },
        { orderId: "ord-2", carrier: "ups", trackingNumber: UPS },
        { orderId: "ord-3", carrier: "fedex", trackingNumber: "999999999999" },
      ])
    );
    expect(results.map((r) => [r.item.orderId, r.status])).toEqual([
      ["ord-1", "success"],
      ["ord-2", "error"],
      ["ord-3", "success"],
    ]);
    expect(results[1].error).toBe("Order already shipped");
  });
});
