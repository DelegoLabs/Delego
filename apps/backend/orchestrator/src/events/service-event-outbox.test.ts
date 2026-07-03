import { describe, it, expect, beforeEach } from "vitest";
import {
  insertServiceEventOutbox,
  resetServiceEventOutboxStore,
} from "./service-event-outbox.js";

describe("insertServiceEventOutbox", () => {
  beforeEach(() => {
    resetServiceEventOutboxStore();
  });

  it("inserts a pending outbox row on success", async () => {
    const record = await insertServiceEventOutbox({
      topic: "payments:events",
      payload: { orderId: "ord-1", type: "escrow_created" },
    });

    expect(record.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    expect(record.topic).toBe("payments:events");
    expect(record.status).toBe("pending");
    expect(record.payload).toEqual({ orderId: "ord-1", type: "escrow_created" });
    expect(record.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("rejects empty topic", async () => {
    await expect(
      insertServiceEventOutbox({ topic: "  ", payload: { ok: true } })
    ).rejects.toThrow("topic is required");
  });
});
