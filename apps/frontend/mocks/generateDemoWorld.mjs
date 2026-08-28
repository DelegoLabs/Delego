/**
 * Deterministic demo-world generator (#631).
 *
 * Shared by `pnpm seed:demo`, MSW handlers, and tests. Two runs with the
 * same seed produce byte-identical JSON (mulberry32 PRNG, fixed epoch).
 */

const STATUSES_DELEGATION = ["pending", "active", "paused", "revoked", "expired", "active"];
const STATUSES_ORDER = [
  "draft",
  "pending_approval",
  "approved",
  "escrowed",
  "fulfilled",
  "settled",
  "cancelled",
  "disputed",
  "awaiting_countersign",
  "rejected",
];
const STATUSES_ESCROW = ["Funded", "Released", "Refunded", "Disputed", "cancelling", "cancelled"];

export const DEMO_WORLD_SEED = 42;
/** Frozen "now" so exports don't drift with the clock. */
export const DEMO_WORLD_NOW = "2026-08-28T12:00:00.000Z";
const DAY_MS = 24 * 60 * 60 * 1000;

export const UI_STATE_COVERAGE = {
  entityStatuses: {
    delegations: ["pending", "active", "paused", "revoked", "expired"],
    orders: STATUSES_ORDER,
    escrows: STATUSES_ESCROW,
  },
  /**
   * Empty / loading / error are not rows in the world — they are MSW
   * scenario variants already exported from mocks/handlers (FE-035).
   * The seed script leaves those handlers in place for matrices.
   */
  listMatrices: {
    empty: ["delegationHandlersEmpty", "orderHandlersEmpty", "escrowHandlersEmpty"],
    error: ["delegationHandlersError", "orderHandlersError", "escrowHandlersError"],
    loading: ["app/*/loading.tsx skeletons"],
  },
};

export function createSeededRandom(seed) {
  let state = seed >>> 0;
  return function next() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededId(prefix, rand) {
  const hex = Math.floor(rand() * 0xffffffff)
    .toString(16)
    .padStart(8, "0");
  return `${prefix}-${hex}`;
}

function seededStellarAddress(rand) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let out = "G";
  for (let i = 0; i < 55; i += 1) {
    out += chars[Math.floor(rand() * chars.length)];
  }
  return out;
}

function jsonReplacer(_key, value) {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  return value;
}

export function serializeDemoWorld(world) {
  return `${JSON.stringify(world, jsonReplacer, 2)}\n`;
}

/**
 * Coherent demo dataset: 3 agents, 6 delegations across lifecycle stages,
 * 40 orders over 60 days, escrows in every status, notifications, one dispute.
 */
export function generateDemoWorld(seed = DEMO_WORLD_SEED) {
  const rand = createSeededRandom(seed);
  const now = new Date(DEMO_WORLD_NOW);
  const userId = "user-demo";
  const walletId = seededStellarAddress(rand);

  const agents = [
    { id: "agent-buyer", role: "buyer", name: "Scout", description: "Finds and compares products", version: "1.0.0" },
    { id: "agent-payment", role: "payment", name: "Cashier", description: "Executes approved payments", version: "1.0.0" },
    { id: "agent-merchant", role: "merchant", name: "Shopkeep", description: "Merchant-side fulfillment agent", version: "1.0.0" },
  ];

  const delegations = STATUSES_DELEGATION.map((status, i) => {
    const createdAt = new Date(now.getTime() - (50 - i * 7) * DAY_MS);
    const expiresAt =
      status === "expired"
        ? new Date(now.getTime() - 2 * DAY_MS).toISOString()
        : new Date(now.getTime() + (30 + i) * DAY_MS).toISOString();
    return {
      id: `delegation-demo-${String(i + 1).padStart(2, "0")}`,
      userId,
      agentId: agents[i % agents.length].id,
      walletId,
      label: `${agents[i % agents.length].name} · ${status}`,
      status,
      permissionLevel: ["VIEW_ONLY", "AUTO_APPROVE", "SIGNER", "ADMIN", "SIGNER", "AUTO_APPROVE"][i],
      policy: {
        maxPerTransaction: String((50 + i * 25) * 10_000_000),
        maxTotal: String((500 + i * 250) * 10_000_000),
        allowedMerchants: i % 2 === 0 ? [] : ["merchant-demo-1"],
        allowedCategories: [],
        expiresAt: status === "pending" ? null : expiresAt,
      },
      createdAt: createdAt.toISOString(),
      updatedAt: createdAt.toISOString(),
    };
  });

  const merchants = ["merchant-demo-1", "merchant-demo-2", "merchant-demo-3"];
  const orders = Array.from({ length: 40 }, (_, i) => {
    const dayOffset = Math.floor((i / 39) * 59);
    const createdAt = new Date(now.getTime() - (59 - dayOffset) * DAY_MS);
    const status = STATUSES_ORDER[i % STATUSES_ORDER.length];
    const quantity = (i % 3) + 1;
    const unit = (10 + (i % 20)) * 10_000_000;
    const delegation = delegations[i % delegations.length];
    return {
      id: `order-demo-${String(i + 1).padStart(2, "0")}`,
      userId,
      delegationId: delegation.id,
      merchantId: merchants[i % merchants.length],
      status,
      totalStroops: String(unit * quantity),
      lineItems: [
        {
          productId: `product-demo-${(i % 8) + 1}`,
          quantity,
          unitPriceStroops: String(unit),
        },
      ],
      escrowContractId: status === "escrowed" || status === "disputed" ? `escrow-demo-${i + 1}` : null,
      createdAt: createdAt.toISOString(),
      updatedAt: createdAt.toISOString(),
    };
  });

  const escrowOrders = orders.filter(
    (o) => o.status === "escrowed" || o.status === "fulfilled" || o.status === "settled" || o.status === "disputed"
  );
  const escrows = STATUSES_ESCROW.map((status, i) => {
    const order = escrowOrders[i] ?? orders[i];
    return {
      escrowId: `escrow-demo-${String(i + 1).padStart(2, "0")}`,
      orderId: order.id,
      amount: order.totalStroops,
      buyer: walletId,
      seller: seededStellarAddress(rand),
      token: "native",
      status,
      timeoutLedger: 1_000_000 + i * 1_000,
      currentLedger: 1_000_000,
      createdAt: order.createdAt,
    };
  });

  const disputedEscrow = escrows.find((e) => e.status === "Disputed") ?? escrows[0];
  const disputes = [
    {
      id: "dispute-demo-01",
      escrowId: disputedEscrow.escrowId,
      orderId: disputedEscrow.orderId,
      reason: "item_not_received",
      description: "Package never arrived; tracking stalled at the origin facility.",
      evidenceUrls: ["https://example.com/evidence/tracking.png"],
      status: "open",
      arbiter: null,
      openedBy: userId,
      resolutionNote: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      resolvedAt: null,
    },
  ];

  const notifications = [
    { id: "notif-demo-01", type: "warning", title: "Approval needed", message: "Scout wants to buy a standing desk.", createdAt: now.getTime() - 2 * 60 * 60 * 1000, read: false, href: "/approvals", severity: "approval" },
    { id: "notif-demo-02", type: "info", title: "Escrow funded", message: "Funds locked for order-demo-04.", createdAt: now.getTime() - 26 * 60 * 60 * 1000, read: true, href: "/escrows", severity: "routine" },
    { id: "notif-demo-03", type: "error", title: "Dispute opened", message: "A dispute was opened on escrow-demo-04.", createdAt: now.getTime() - 4 * 60 * 60 * 1000, read: false, href: "/escrows", severity: "approval" },
    { id: "notif-demo-04", type: "success", title: "Delegation active", message: "Cashier is now authorized to pay.", createdAt: now.getTime() - 10 * DAY_MS, read: true, href: "/delegations", severity: "routine" },
  ];

  return {
    seed,
    generatedAt: DEMO_WORLD_NOW,
    agents,
    delegations,
    orders,
    escrows,
    disputes,
    notifications,
    uiStateCoverage: UI_STATE_COVERAGE,
  };
}
