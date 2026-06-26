/**
 * Unit tests for escrow-event-listener
 *
 * Run with:  node --test src/__tests__/escrow-event-listener.test.ts
 * (compiled) or via:  pnpm --filter @delego/notifications test
 */
import { describe, it, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  normaliseEvent,
  markEventIfUnseen,
  dispatchEscrowEvent,
} from "../escrow-event-listener.js";
import type { EscrowContractEvent } from "../escrow-event-listener.js";

// ---------------------------------------------------------------------------
// Helpers — build raw Soroban event fixtures
// ---------------------------------------------------------------------------

function makeRawEvent(overrides: Record<string, unknown> = {}) {
  return {
    type: "contract",
    ledger: 1234567,
    ledgerClosedAt: "2025-01-01T00:00:00Z",
    contractId: "CESCROW1234567890123456789012345678901234567890123456",
    id: "1234567-1",
    pagingToken: "1234567-1",
    inSuccessfulContractCall: true,
    txHash: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    topic: [
      { type: "symbol", value: "escrow_created" },
      { type: "address", address: "GBUYER1234567890123456789012345678901234567890123456" },
      { type: "address", address: "GMERCHANT123456789012345678901234567890123456789012" },
    ],
    value: { type: "u128", low: "5000000000", high: "0" },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// normaliseEvent
// ---------------------------------------------------------------------------

describe("normaliseEvent", () => {
  it("decodes a valid EscrowCreatedEvent into an EscrowContractEvent", () => {
    const raw = makeRawEvent();
    const event = normaliseEvent(raw as Parameters<typeof normaliseEvent>[0]);

    assert.ok(event !== null, "should return a non-null event");
    assert.equal(event.eventType, "escrow_created");
    assert.equal(event.contractId, "CESCROW1234567890123456789012345678901234567890123456");
    assert.equal(event.buyer, "GBUYER1234567890123456789012345678901234567890123456");
    assert.equal(event.merchant, "GMERCHANT123456789012345678901234567890123456789012");
    assert.equal(event.amountStroops, "5000000000");
    assert.equal(event.ledger, 1234567);
    assert.equal(event.txHash, "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890");
  });

  it("decodes an escrow_released event", () => {
    const raw = makeRawEvent({
      topic: [
        { type: "symbol", value: "escrow_released" },
        { type: "address", address: "GBUYER1234567890123456789012345678901234567890123456" },
        { type: "address", address: "GMERCHANT123456789012345678901234567890123456789012" },
      ],
    });
    const event = normaliseEvent(raw as Parameters<typeof normaliseEvent>[0]);
    assert.ok(event !== null);
    assert.equal(event.eventType, "escrow_released");
  });

  it("decodes an escrow_refunded event", () => {
    const raw = makeRawEvent({
      topic: [
        { type: "symbol", value: "escrow_refunded" },
        { type: "address", address: "GBUYER1234567890123456789012345678901234567890123456" },
        { type: "address", address: "GMERCHANT123456789012345678901234567890123456789012" },
      ],
    });
    const event = normaliseEvent(raw as Parameters<typeof normaliseEvent>[0]);
    assert.ok(event !== null);
    assert.equal(event.eventType, "escrow_refunded");
  });

  it("decodes an escrow_disputed event", () => {
    const raw = makeRawEvent({
      topic: [
        { type: "symbol", value: "escrow_disputed" },
        { type: "address", address: "GBUYER1234567890123456789012345678901234567890123456" },
        { type: "address", address: "GMERCHANT123456789012345678901234567890123456789012" },
      ],
    });
    const event = normaliseEvent(raw as Parameters<typeof normaliseEvent>[0]);
    assert.ok(event !== null);
    assert.equal(event.eventType, "escrow_disputed");
  });

  it("returns null for an event with an unknown type topic", () => {
    const raw = makeRawEvent({
      topic: [
        { type: "symbol", value: "transfer" },
        { type: "address", address: "GBUYER1234567890123456789012345678901234567890123456" },
        { type: "address", address: "GMERCHANT123456789012345678901234567890123456789012" },
      ],
    });
    const event = normaliseEvent(raw as Parameters<typeof normaliseEvent>[0]);
    assert.equal(event, null, "unknown event type should return null");
  });

  it("returns null for a failed contract call", () => {
    const raw = makeRawEvent({ inSuccessfulContractCall: false });
    const event = normaliseEvent(raw as Parameters<typeof normaliseEvent>[0]);
    assert.equal(event, null, "failed tx event should return null");
  });

  it("handles missing topic gracefully (returns null)", () => {
    const raw = makeRawEvent({ topic: [] });
    const event = normaliseEvent(raw as Parameters<typeof normaliseEvent>[0]);
    assert.equal(event, null);
  });
});

// ---------------------------------------------------------------------------
// markEventIfUnseen (Redis dedup)
// ---------------------------------------------------------------------------

describe("markEventIfUnseen", () => {
  it("returns true for the first occurrence of a txHash+index", async () => {
    // Minimal Redis mock
    const seen = new Map<string, string>();
    const redisMock = {
      set: async (key: string, _val: string, _ex: string, _ttl: number, _nx: string) => {
        if (seen.has(key)) return null;
        seen.set(key, "1");
        return "OK";
      },
    };

    const result = await markEventIfUnseen(
      redisMock as unknown as import("ioredis").Redis,
      "txhash-abc",
      "1234567-0"
    );
    assert.equal(result, true, "first time should return true (event is new)");
  });

  it("returns false for a duplicate txHash+index", async () => {
    const seen = new Map<string, string>();
    const redisMock = {
      set: async (key: string, _val: string, _ex: string, _ttl: number, _nx: string) => {
        if (seen.has(key)) return null;
        seen.set(key, "1");
        return "OK";
      },
    };

    // First call
    await markEventIfUnseen(
      redisMock as unknown as import("ioredis").Redis,
      "txhash-abc",
      "1234567-0"
    );

    // Second call with same key — should be deduplicated
    const result = await markEventIfUnseen(
      redisMock as unknown as import("ioredis").Redis,
      "txhash-abc",
      "1234567-0"
    );
    assert.equal(result, false, "duplicate event should return false");
  });
});

// ---------------------------------------------------------------------------
// dispatchEscrowEvent
// ---------------------------------------------------------------------------

describe("dispatchEscrowEvent", () => {
  it("calls redis.publish with the correct channel and serialised payload", async () => {
    const publishedMessages: Array<{ channel: string; message: string }> = [];

    const redisMock = {
      publish: async (channel: string, message: string) => {
        publishedMessages.push({ channel, message });
        return 1;
      },
    };

    const event: EscrowContractEvent = {
      contractId: "CESCROW1234567890123456789012345678901234567890123456",
      eventType: "escrow_created",
      orderId: "1234567",
      buyer: "GBUYER1234567890123456789012345678901234567890123456",
      merchant: "GMERCHANT123456789012345678901234567890123456789012",
      amountStroops: "5000000000",
      ledger: 1234567,
      txHash: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    };

    await dispatchEscrowEvent(event, redisMock as unknown as import("ioredis").Redis);

    assert.equal(publishedMessages.length, 1, "should publish exactly one message");
    assert.equal(
      publishedMessages[0].channel,
      "notifications:escrow",
      "should publish to notifications:escrow channel"
    );

    const parsed = JSON.parse(publishedMessages[0].message) as Record<string, unknown>;
    assert.equal(parsed["topic"], "notifications:escrow");
    assert.equal(parsed["type"], "escrow_created");
    assert.deepEqual(parsed["payload"], event);
    assert.ok(typeof parsed["publishedAt"] === "string", "publishedAt should be a string");
  });

  it("publishes escrow_released events to the correct channel", async () => {
    const publishedMessages: Array<{ channel: string; message: string }> = [];
    const redisMock = {
      publish: async (channel: string, message: string) => {
        publishedMessages.push({ channel, message });
        return 1;
      },
    };

    const event: EscrowContractEvent = {
      contractId: "CESCROW1234567890123456789012345678901234567890123456",
      eventType: "escrow_released",
      orderId: "1234567",
      buyer: "GBUYER1234567890123456789012345678901234567890123456",
      merchant: "GMERCHANT123456789012345678901234567890123456789012",
      amountStroops: "5000000000",
      ledger: 1234568,
      txHash: "bbbbbb1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    };

    await dispatchEscrowEvent(event, redisMock as unknown as import("ioredis").Redis);

    const parsed = JSON.parse(publishedMessages[0].message) as Record<string, unknown>;
    assert.equal(parsed["type"], "escrow_released");
  });
});
