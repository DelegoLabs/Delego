/**
 * Tests for issue #205 — Payment Event Publisher Interface
 *
 * Verifies the `PaymentEvent<T>` shape, the `publishPaymentEvent` helper,
 * and failure-path handling when the Redis transport fails.
 */
import { describe, it, before, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  publishPaymentEvent,
  emitPaymentEvent,
  _setRedisClientForTesting,
  _resetRedisClient,
} from "../../../apps/backend/payments/dist/events/index.js";

// ── In-memory mock Redis stream ────────────────────────────────────────────

function makeCapturingRedis() {
  const published = [];
  return {
    published,
    async xadd(_key, _id, ...fieldValues) {
      const fields = {};
      for (let i = 0; i < fieldValues.length; i += 2) {
        fields[fieldValues[i]] = fieldValues[i + 1];
      }
      const id = `${Date.now()}-${published.length}`;
      published.push({ id, fields });
      return id;
    },
  };
}

function makeFailingRedis() {
  return {
    async xadd() {
      throw new Error("Redis connection refused");
    },
  };
}

// ── Setup / teardown ───────────────────────────────────────────────────────

before(() => {
  process.env.NODE_ENV = "test";
});

afterEach(() => {
  _resetRedisClient();
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe("PaymentEvent shape (issue #205)", () => {
  it("published event contains the required fields", async () => {
    const redis = makeCapturingRedis();
    _setRedisClientForTesting(redis);

    const event = {
      type: "escrow_released",
      orderId: "order-001",
      paymentId: "pay-abc",
      payload: { escrowId: "42", txHash: "abc123" },
      occurredAt: new Date().toISOString(),
    };

    await publishPaymentEvent(event);

    assert.equal(redis.published.length, 1);
    const raw = redis.published[0].fields.data;
    const parsed = JSON.parse(raw);

    assert.equal(parsed.type, event.type);
    assert.equal(parsed.orderId, event.orderId);
    assert.equal(parsed.paymentId, event.paymentId);
    assert.deepEqual(parsed.payload, event.payload);
    assert.equal(parsed.occurredAt, event.occurredAt);
  });

  it("paymentId is optional", async () => {
    const redis = makeCapturingRedis();
    _setRedisClientForTesting(redis);

    await publishPaymentEvent({
      type: "escrow_created",
      orderId: "order-002",
      payload: {},
      occurredAt: new Date().toISOString(),
    });

    const parsed = JSON.parse(redis.published[0].fields.data);
    assert.equal(parsed.paymentId, undefined);
  });

  it("payload can be a typed object", async () => {
    const redis = makeCapturingRedis();
    _setRedisClientForTesting(redis);

    /** @type {{ amount: number; currency: string }} */
    const payload = { amount: 1_000_000, currency: "XLM" };

    await publishPaymentEvent({
      type: "settlement_complete",
      orderId: "order-003",
      payload,
      occurredAt: new Date().toISOString(),
    });

    const parsed = JSON.parse(redis.published[0].fields.data);
    assert.equal(parsed.payload.amount, 1_000_000);
    assert.equal(parsed.payload.currency, "XLM");
  });
});

describe("publishPaymentEvent — publish failure handling (issue #205)", () => {
  it("re-throws when Redis xadd fails", async () => {
    _setRedisClientForTesting(makeFailingRedis());

    await assert.rejects(
      publishPaymentEvent({
        type: "escrow_released",
        orderId: "order-fail",
        payload: {},
        occurredAt: new Date().toISOString(),
      }),
      /Redis connection refused/
    );
  });

  it("each publishPaymentEvent call produces exactly one stream entry", async () => {
    const redis = makeCapturingRedis();
    _setRedisClientForTesting(redis);

    await publishPaymentEvent({ type: "a", orderId: "o1", payload: {}, occurredAt: new Date().toISOString() });
    await publishPaymentEvent({ type: "b", orderId: "o2", payload: {}, occurredAt: new Date().toISOString() });

    assert.equal(redis.published.length, 2);
  });
});

describe("emitPaymentEvent legacy shim (issue #205)", () => {
  it("emitPaymentEvent fires without throwing even when Redis fails", async () => {
    _setRedisClientForTesting(makeFailingRedis());

    // Should not throw — the shim is fire-and-forget
    assert.doesNotThrow(() => {
      emitPaymentEvent({
        type: "settlement_complete",
        orderId: "order-shim",
        timestamp: new Date().toISOString(),
        payload: {},
      });
    });
  });
});
