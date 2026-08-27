import { describe, it, expect, vi } from "vitest";
import { runBatch, summarizeBatch } from "./batchRunner";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("runBatch", () => {
  it("runs strictly sequentially by default (one item completes before the next starts)", async () => {
    const order: string[] = [];
    await runBatch(["a", "b", "c"], async (item) => {
      order.push(`start:${item}`);
      await delay(5);
      order.push(`end:${item}`);
      return item;
    });
    expect(order).toEqual([
      "start:a",
      "end:a",
      "start:b",
      "end:b",
      "start:c",
      "end:c",
    ]);
  });

  it("preserves item order in the result array regardless of completion timing", async () => {
    const results = await runBatch(
      [30, 10, 20],
      async (ms) => {
        await delay(ms);
        return ms;
      },
      { concurrency: 3 }
    );
    expect(results.map((r) => r.item)).toEqual([30, 10, 20]);
    expect(results.map((r) => r.result)).toEqual([30, 10, 20]);
  });

  it("caps concurrency: no more than `concurrency` items run at once", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    await runBatch(
      Array.from({ length: 10 }, (_, i) => i),
      async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await delay(5);
        inFlight -= 1;
      },
      { concurrency: 3 }
    );
    expect(maxInFlight).toBeLessThanOrEqual(3);
    expect(maxInFlight).toBeGreaterThan(1); // actually ran concurrently, not serialized
  });

  it("clamps concurrency above the item count down to the item count", async () => {
    let maxInFlight = 0;
    let inFlight = 0;
    await runBatch(
      [1, 2],
      async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await delay(5);
        inFlight -= 1;
      },
      { concurrency: 50 }
    );
    expect(maxInFlight).toBe(2);
  });

  it("tracks per-item status via onItemSettled as each item finishes", async () => {
    const settled: string[] = [];
    await runBatch(
      ["a", "b"],
      async (item) => item,
      { onItemSettled: (r) => settled.push(`${r.item}:${r.status}`) }
    );
    expect(settled).toEqual(["a:success", "b:success"]);
  });

  it("isolates a failing item: its error doesn't abort the rest of the batch", async () => {
    const results = await runBatch(["a", "fail", "c"], async (item) => {
      if (item === "fail") throw new Error("boom");
      return item;
    });
    expect(results.map((r) => r.status)).toEqual(["success", "error", "success"]);
    expect(results[1].error).toBe("boom");
    expect(results[0].result).toBe("a");
    expect(results[2].result).toBe("c");
  });

  it("filters ineligible items via isEligible without invoking fn for them", async () => {
    const fn = vi.fn(async (item: string) => item);
    const results = await runBatch(["a", "b", "c"], fn, {
      isEligible: (item) => (item === "b" ? { eligible: false, reason: "Not eligible" } : { eligible: true }),
    });
    expect(fn).toHaveBeenCalledTimes(2);
    expect(results[1]).toEqual({ item: "b", status: "skipped", error: "Not eligible" });
    expect(results[0].status).toBe("success");
    expect(results[2].status).toBe("success");
  });

  it("resolves to an empty array for an empty input without invoking fn", async () => {
    const fn = vi.fn();
    const results = await runBatch([], fn);
    expect(results).toEqual([]);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("summarizeBatch", () => {
  it("counts each status bucket", () => {
    const summary = summarizeBatch([
      { item: 1, status: "success" as const },
      { item: 2, status: "error" as const, error: "x" },
      { item: 3, status: "skipped" as const, error: "y" },
      { item: 4, status: "success" as const },
    ]);
    expect(summary).toEqual({ success: 2, error: 1, skipped: 1 });
  });
});
