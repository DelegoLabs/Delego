import { describe, it, expect, beforeEach } from "vitest";
import {
  checkAndMarkProcessed,
  resetProcessedMessageStore,
} from "./processed-messages.js";

describe("checkAndMarkProcessed", () => {
  beforeEach(() => {
    resetProcessedMessageStore();
  });

  it("returns true on first message claim", async () => {
    const first = await checkAndMarkProcessed("msg-1", "notifications-worker");
    expect(first).toBe(true);
  });

  it("returns false on duplicate message id", async () => {
    await checkAndMarkProcessed("msg-dup", "payments-worker");
    const duplicate = await checkAndMarkProcessed("msg-dup", "payments-worker");
    expect(duplicate).toBe(false);
  });

  it("rejects empty message id", async () => {
    await expect(checkAndMarkProcessed("", "worker")).rejects.toThrow(
      "messageId is required"
    );
  });
});
