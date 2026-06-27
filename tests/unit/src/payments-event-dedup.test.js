import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  deriveContractEventId,
  handleEscrowContractEvent,
  resetProcessedContractEventStore,
} from "../../../apps/backend/payments/dist/events/index.js";

describe("escrow contract event deduplication", () => {
  beforeEach(() => {
    resetProcessedContractEventStore();
  });

  it("derives deterministic event ids from tx hash and event index", () => {
    assert.equal(deriveContractEventId("abc123", 0), "abc123:0");
    assert.equal(deriveContractEventId("abc123", 2), "abc123:2");
  });

  it("processes first-seen escrow contract events", async () => {
    let callCount = 0;
    const event = {
      txHash: "tx-first",
      eventIndex: 0,
      contractId: "contract-1",
      type: "escrow_created",
      payload: { orderId: "ord-1" },
    };

    const processed = await handleEscrowContractEvent(event, () => {
      callCount += 1;
    });

    assert.equal(processed, true);
    assert.equal(callCount, 1);
  });

  it("skips duplicate escrow contract event deliveries", async () => {
    let callCount = 0;
    const event = {
      txHash: "tx-dup",
      eventIndex: 1,
      contractId: "contract-1",
      type: "escrow_released",
      payload: { orderId: "ord-2" },
    };

    const first = await handleEscrowContractEvent(event, () => {
      callCount += 1;
    });
    const second = await handleEscrowContractEvent(event, () => {
      callCount += 1;
    });

    assert.equal(first, true);
    assert.equal(second, false);
    assert.equal(callCount, 1);
  });
});
