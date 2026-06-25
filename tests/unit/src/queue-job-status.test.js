import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  getJobStatus,
} from "../../../apps/backend/wallet/dist/src/queue/txQueue.js";

describe("getJobStatus", () => {
  before(() => {
    process.env.NODE_ENV = "test";
  });

  after(() => {
    delete process.env.NODE_ENV;
  });

  it("returns null for a missing job ID when queue is in test mode", async () => {
    const result = await getJobStatus("nonexistent-job-id");
    assert.equal(result, null);
  });

  it("returns null for an empty string job ID", async () => {
    const result = await getJobStatus("");
    assert.equal(result, null);
  });

  it("returns null when queue is not initialized (test mode bypasses BullMQ)", async () => {
    const result = await getJobStatus("any-job-id");
    assert.equal(result, null,
      "getJobStatus returns null when BullMQ queue is not running (test mode)");
  });
});
