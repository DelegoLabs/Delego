import { describe, it, expect } from "vitest";
import {
  FAMILY_CONFIG,
  MemoryCacheStore,
  ReadModelCache,
  isRecordStale,
  serializePayload,
  deserializePayload,
} from "./readModelCache";

describe("readModelCache (#619)", () => {
  it("drops records whose family version no longer matches (shape migration)", () => {
    const store = new MemoryCacheStore();
    const cache = new ReadModelCache({ store, now: () => 1_000 });
    cache.set("delegations", "list", [{ id: "d1" }]);

    // Simulate a record written under an older schema version.
    store.set({
      family: "orders",
      key: "list",
      version: FAMILY_CONFIG.orders.version - 1,
      payload: { oldShape: true },
      cachedAt: 1_000,
      lastAccessAt: 1_000,
      bytes: 16,
    });

    const dropped = cache.migrate();
    expect(dropped).toBe(1);
    expect(cache.get("orders", "list")).toBeNull();
    expect(cache.get("delegations", "list")?.payload).toEqual([{ id: "d1" }]);
  });

  it("evicts the least-recently-used family first when over the byte cap", () => {
    const store = new MemoryCacheStore();
    let now = 1_000;
    const cache = new ReadModelCache({
      store,
      maxBytes: 80,
      now: () => now,
    });

    cache.set("delegations", "list", { n: "a".repeat(20) });
    now = 2_000;
    cache.set("orders", "list", { n: "b".repeat(20) });
    now = 3_000;
    cache.set("escrows", "list", { n: "c".repeat(20) });

    // Touch orders so delegations is the LRU family.
    now = 4_000;
    cache.get("orders", "list");

    now = 5_000;
    cache.set("analytics", "overview", { n: "d".repeat(40) });

    const families = cache.stats().families.filter((f) => f.keys > 0).map((f) => f.family);
    expect(families).not.toContain("delegations");
    expect(families).toContain("orders");
  });

  it("reports a record stale only after its family TTL", () => {
    const cache = new ReadModelCache({ now: () => 0 });
    const record = cache.set("orders", "list", []);
    expect(isRecordStale(record, 0)).toBe(false);
    expect(isRecordStale(record, FAMILY_CONFIG.orders.ttlMs - 1)).toBe(false);
    expect(isRecordStale(record, FAMILY_CONFIG.orders.ttlMs)).toBe(true);
  });

  it("round-trips bigint payloads", () => {
    const raw = serializePayload({ total: 15_000_000n });
    const parsed = deserializePayload<{ total: bigint }>(raw);
    expect(parsed.total).toBe(15_000_000n);
  });
});
