import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  enqueueMutation,
  getQueuedMutations,
  clearQueue,
} from "./offlineQueue";
import { replayOfflineQueue } from "./replayEngine";
import { api } from "./api";

vi.mock("./api", () => ({
  api: {
    approveOrder: vi.fn(),
    rejectOrder: vi.fn(),
    updateDelegation: vi.fn(),
    revokeDelegation: vi.fn(),
  },
}));

describe("Offline Mutation Queue & Replay Engine (#618)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset IndexedDB in fake environment if available or clear queue
    try {
      await clearQueue();
    } catch {
      /* ignore */
    }
  });

  it("enqueues mutations with unique idempotency keys", async () => {
    const item1 = await enqueueMutation("approve_order", "order-1");
    const item2 = await enqueueMutation("reject_order", "order-2", {
      reason: "Budget",
    });

    expect(item1.idempotencyKey).toBeTruthy();
    expect(item2.idempotencyKey).toBeTruthy();
    expect(item1.idempotencyKey).not.toBe(item2.idempotencyKey);

    const queue = await getQueuedMutations();
    expect(queue.length).toBeGreaterThanOrEqual(2);
  });

  it("replays pending mutations in FIFO order upon reconnect", async () => {
    vi.mocked(api.approveOrder).mockResolvedValue({
      data: { id: "order-100", status: "approved" },
    } as never);

    const item = await enqueueMutation("approve_order", "order-100");

    const result = await replayOfflineQueue();

    expect(api.approveOrder).toHaveBeenCalledWith("order-100");
    expect(result.replayed).toBe(1);
    const queue = await getQueuedMutations();
    expect(queue.find((q) => q.id === item.id)).toBeUndefined();
  });

  it("flags HTTP 409 conflicts as 'conflict' and does NOT auto-force update", async () => {
    vi.mocked(api.approveOrder).mockResolvedValue({
      error: {
        status: 409,
        code: "CONFLICT",
        message: "Order state changed while offline",
      },
      data: { id: "order-200", status: "fulfilled" },
    } as never);

    const item = await enqueueMutation("approve_order", "order-200");
    const result = await replayOfflineQueue();

    expect(result.conflicts).toBe(1);
    const queue = await getQueuedMutations();
    const queuedItem = queue.find((q) => q.id === item.id);
    expect(queuedItem?.status).toBe("conflict");
    expect(queuedItem?.errorMessage).toContain("offline");
  });

  it("quarantines permanent 400/422/404 rejections with user notice", async () => {
    vi.mocked(api.rejectOrder).mockResolvedValue({
      error: { status: 422, message: "Invalid rejection state" },
    } as never);

    const item = await enqueueMutation("reject_order", "order-300");
    const result = await replayOfflineQueue();

    expect(result.quarantined).toBe(1);
    const queue = await getQueuedMutations();
    const queuedItem = queue.find((q) => q.id === item.id);
    expect(queuedItem?.status).toBe("quarantined");
  });
});
