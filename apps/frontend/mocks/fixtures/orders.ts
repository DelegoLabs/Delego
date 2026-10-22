import type { ApiResponse, Order, OrderStatus } from "@delegolabs/types";
import { createSeededRandom, pick, seededId } from "./faker-lite";

const STATUSES: OrderStatus[] = [
  "draft",
  "pending_approval",
  "approved",
  "escrowed",
  "fulfilled",
  "settled",
];

const CATEGORIES = [
  "Hardware",
  "Services",
  "Apparel",
  "Groceries",
  "Dining",
  "Transport",
  "Entertainment",
  "Utilities",
];

/** Build one deterministic Order fixture from a numeric seed. */
export function buildOrder(
  seed: number,
  overrides: Partial<Order> = {}
): Order {
  const rand = createSeededRandom(seed);
  const now = new Date("2026-01-01T00:00:00.000Z");
  const unitPriceStroops = BigInt(Math.floor(rand() * 50) + 1) * 10_000_000n;
  const quantity = Math.floor(rand() * 3) + 1;
  const category = pick(CATEGORIES, rand);

  return {
    id: seededId("order", rand),
    userId: seededId("user", rand),
    delegationId: seededId("delegation", rand),
    merchantId: seededId("merchant", rand),
    status: pick(STATUSES, rand),
    category,
    totalStroops: unitPriceStroops * BigInt(quantity),
    lineItems: [
      {
        productId: seededId("product", rand),
        quantity,
        unitPriceStroops,
        category,
      },
    ],
    escrowContractId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function buildOrderList(count = 5): Order[] {
  return Array.from({ length: count }, (_, i) => buildOrder(i + 1));
}

/** A single high-value order awaiting approval, for the approvals-page fixture. */
export function buildPendingApprovalOrder(seed = 1): Order {
  return buildOrder(seed, {
    status: "pending_approval",
    totalStroops: 1_500n * 10_000_000n,
  });
}

export function okResponse<T>(data: T): ApiResponse<T> {
  return { data, error: null };
}

export function errorResponse<T>(
  message: string,
  code = "internal_error"
): ApiResponse<T> {
  return { data: null, error: { code, message } };
}
