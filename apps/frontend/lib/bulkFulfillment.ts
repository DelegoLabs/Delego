/**
 * Bulk order fulfillment (#1014): assign a carrier + tracking number to many
 * merchant orders at once and mark them shipped.
 *
 * There is no batch endpoint, so a batch is one `submitShipment` call per
 * order (`POST /orders/{id}/ship`) through the shared `runBatch` runner —
 * concurrency-capped, with each order's failure isolated from the rest.
 */

import { runBatch, type BatchItemResult } from "./batchRunner";
import { splitCsvLine, splitCsvRecords } from "./catalogCsv";
import {
  SHIPPING_CARRIERS,
  isValidTrackingNumber,
  submitShipment,
  type ShipmentSubmission,
  type ShippingCarrier,
} from "./shipments";
import type { MerchantEscrowOrder } from "./merchantEscrowOrders";

export interface BulkFulfillmentItem {
  orderId: string;
  carrier: string;
  trackingNumber: string;
}

export const BULK_FULFILLMENT_CSV_HEADER = ["orderId", "carrier", "trackingNumber"] as const;

/** Orders submitted at once — matches the escrow batch actions. */
export const BULK_FULFILLMENT_CONCURRENCY = 3;

export type BulkFulfillmentErrorCode =
  | "missingHeader"
  | "missingFields"
  | "unknownOrder"
  | "duplicateOrder"
  | "invalidCarrier"
  | "invalidTracking";

export interface BulkFulfillmentRowError {
  /** 1-based CSV line number (the header is line 1); omitted for manual entry. */
  line?: number;
  orderId?: string;
  code: BulkFulfillmentErrorCode;
}

export interface BulkFulfillmentParseResult {
  items: BulkFulfillmentItem[];
  errors: BulkFulfillmentRowError[];
}

/** Only funded ("To Ship") orders can be marked shipped. */
export function isFulfillable(order: Pick<MerchantEscrowOrder, "status">): boolean {
  return order.status === "funded";
}

/** Accepts a carrier code ("fedex") or label ("FedEx"), case-insensitively. */
export function normalizeCarrier(value: string): ShippingCarrier | null {
  const needle = value.trim().toLowerCase();
  const match = SHIPPING_CARRIERS.find(
    (c) => c.value === needle || c.label.toLowerCase() === needle
  );
  return match?.value ?? null;
}

/** Field-level check for one item; `null` when it can be submitted. */
export function validateBulkFulfillmentItem(
  item: BulkFulfillmentItem
): Exclude<BulkFulfillmentErrorCode, "missingHeader" | "unknownOrder" | "duplicateOrder"> | null {
  if (!item.orderId.trim() || !item.carrier.trim() || !item.trackingNumber.trim()) {
    return "missingFields";
  }
  const carrier = normalizeCarrier(item.carrier);
  if (!carrier) return "invalidCarrier";
  if (!isValidTrackingNumber(carrier, item.trackingNumber)) return "invalidTracking";
  return null;
}

/**
 * Validates a full batch against the selected orders: every item must target
 * a selected order exactly once and pass `validateBulkFulfillmentItem`.
 * Returned items are normalized (carrier code, trimmed values).
 */
export function validateBulkFulfillment(
  items: BulkFulfillmentItem[],
  selectedOrderIds: readonly string[],
  lineOf: (index: number) => number | undefined = () => undefined
): BulkFulfillmentParseResult {
  const selected = new Set(selectedOrderIds);
  const seen = new Set<string>();
  const valid: BulkFulfillmentItem[] = [];
  const errors: BulkFulfillmentRowError[] = [];

  items.forEach((raw, index) => {
    const orderId = raw.orderId.trim();
    const line = lineOf(index);
    const fieldError = validateBulkFulfillmentItem(raw);
    if (fieldError === "missingFields" && !orderId) {
      errors.push({ line, code: fieldError });
      return;
    }
    if (!selected.has(orderId)) {
      errors.push({ line, orderId, code: "unknownOrder" });
      return;
    }
    if (seen.has(orderId)) {
      errors.push({ line, orderId, code: "duplicateOrder" });
      return;
    }
    seen.add(orderId);
    if (fieldError) {
      errors.push({ line, orderId, code: fieldError });
      return;
    }
    valid.push({
      orderId,
      carrier: normalizeCarrier(raw.carrier)!,
      trackingNumber: raw.trackingNumber.trim(),
    });
  });

  return { items: valid, errors };
}

/**
 * Parses `orderId,carrier,trackingNumber` CSV (header required, any column
 * order, header names case-insensitive) and validates it against the
 * selected orders.
 */
export function parseBulkFulfillmentCsv(
  text: string,
  selectedOrderIds: readonly string[]
): BulkFulfillmentParseResult {
  const records = splitCsvRecords(text)
    .map((record, index) => ({ record, line: index + 1 }))
    .filter(({ record }) => record.trim().length > 0);
  if (records.length === 0) return { items: [], errors: [{ code: "missingHeader" }] };

  const header = splitCsvLine(records[0].record).map((h) => h.trim().toLowerCase());
  const columns = BULK_FULFILLMENT_CSV_HEADER.map((name) => header.indexOf(name.toLowerCase()));
  if (columns.some((index) => index === -1)) {
    return { items: [], errors: [{ line: records[0].line, code: "missingHeader" }] };
  }

  const rows = records.slice(1);
  const items = rows.map(({ record }) => {
    const fields = splitCsvLine(record);
    const [orderId, carrier, trackingNumber] = columns.map((index) => (fields[index] ?? "").trim());
    return { orderId, carrier, trackingNumber };
  });
  return validateBulkFulfillment(items, selectedOrderIds, (index) => rows[index].line);
}

/** Overlays an optimistic "shipped" status on the given orders. */
export function withOptimisticShipments(
  orders: MerchantEscrowOrder[],
  shippedOrderIds: ReadonlySet<string>
): MerchantEscrowOrder[] {
  if (shippedOrderIds.size === 0) return orders;
  return orders.map((order) =>
    shippedOrderIds.has(order.orderId) && isFulfillable(order)
      ? { ...order, status: "shipped" as const }
      : order
  );
}

/**
 * Submits every item, isolating per-order failures. Results are in `items`
 * order; callers roll back the optimistic status of each `"error"` result.
 */
export function runBulkFulfillment(
  items: BulkFulfillmentItem[],
  submit: (submission: ShipmentSubmission) => Promise<void> = submitShipment,
  concurrency: number = BULK_FULFILLMENT_CONCURRENCY
): Promise<BatchItemResult<BulkFulfillmentItem, void>[]> {
  return runBatch(
    items,
    async (item) => {
      const carrier = normalizeCarrier(item.carrier);
      if (!carrier) throw new Error(`Unknown carrier "${item.carrier}".`);
      await submit({ orderId: item.orderId, carrier, trackingNumber: item.trackingNumber });
    },
    { concurrency }
  );
}
