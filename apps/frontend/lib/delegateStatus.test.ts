import { describe, it, expect } from "vitest";
import type { Delegation } from "@delegolabs/types";
import {
  deriveDelegateChip,
  createDelegateStatusStore,
  formatStaleness,
} from "./delegateStatus";

function mk(overrides: Partial<Delegation> = {}): Delegation {
  return {
    id: "d1",
    userId: "u1",
    agentId: "a1",
    status: "active",
    policy: { maxPerTransaction: "0", maxTotal: "1000", allowedMerchants: [] },
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  } as Delegation;
}

describe("deriveDelegateChip", () => {
  it("returns Active for an active delegation", () => {
    const chip = deriveDelegateChip(mk());
    expect(chip.status).toBe("active");
    expect(chip.label).toBe("Active");
    expect(chip.canResume).toBe(false);
    expect(chip.canRenew).toBe(false);
    expect(chip.tooltip.length).toBeGreaterThan(0);
  });

  it("returns Paused with a resume affordance", () => {
    const chip = deriveDelegateChip(mk({ status: "paused" }));
    expect(chip.status).toBe("paused");
    expect(chip.label).toBe("Paused");
    expect(chip.canResume).toBe(true);
  });

  it("returns Expired with a renew affordance (by status)", () => {
    const chip = deriveDelegateChip(mk({ status: "expired" }));
    expect(chip.status).toBe("expired");
    expect(chip.canRenew).toBe(true);
  });

  it("returns Expired when the expiry date has passed", () => {
    const chip = deriveDelegateChip(
      mk({
        status: "active",
        policy: {
          maxPerTransaction: "0",
          maxTotal: "1000",
          allowedMerchants: [],
          expiresAt: "2020-01-01T00:00:00Z",
        },
      }),
      { now: new Date("2026-01-01T00:00:00Z") }
    );
    expect(chip.status).toBe("expired");
  });

  it("returns Threshold reached when spent meets the cap", () => {
    const chip = deriveDelegateChip(mk(), { spent: 1000n, cap: 1000n });
    expect(chip.status).toBe("threshold-reached");
    expect(chip.label).toBe("Threshold reached");
  });

  it("prioritizes revoked over every derived state", () => {
    const chip = deriveDelegateChip(mk({ status: "revoked" }), {
      spent: 9999n,
      cap: 10n,
    });
    expect(chip.status).toBe("revoked");
  });
});

describe("createDelegateStatusStore", () => {
  it("coalesces concurrent gets into a single fetch (no N+1)", async () => {
    let calls = 0;
    const store = createDelegateStatusStore(async (ids) => {
      calls += 1;
      return Object.fromEntries(ids.map((id) => [id, "active" as const]));
    });

    const [a, b] = await Promise.all([
      store.get(["d1", "d2"]),
      store.get(["d2", "d3"]),
    ]);

    expect(calls).toBe(1);
    expect(a.d1.status).toBe("active");
    expect(b.d3.status).toBe("active");
  });

  it("serves fresh cache without refetching, and refetches after TTL", async () => {
    let calls = 0;
    let now = 1_000_000;
    const store = createDelegateStatusStore(
      async (ids) => {
        calls += 1;
        return Object.fromEntries(ids.map((id) => [id, "active" as const]));
      },
      30_000,
      () => now
    );

    await store.get(["d1"]);
    expect(calls).toBe(1);
    await store.get(["d1"]); // within TTL → cache hit
    expect(calls).toBe(1);

    now += 40_000; // past TTL
    await store.get(["d1"]);
    expect(calls).toBe(2);
  });

  it("keeps the last-known record when a fetch fails (stale-tolerant)", async () => {
    let shouldThrow = false;
    const store = createDelegateStatusStore(
      async (ids) => {
        if (shouldThrow) throw new Error("network");
        return Object.fromEntries(ids.map((id) => [id, "paused" as const]));
      },
      0 // always considered stale so the second get triggers a (failing) refetch
    );

    await store.get(["d1"]);
    expect(store.peek("d1")?.status).toBe("paused");

    shouldThrow = true;
    await store.get(["d1"]);
    // Still the last-known value, not cleared.
    expect(store.peek("d1")?.status).toBe("paused");
  });
});

describe("formatStaleness", () => {
  it("formats minute and hour deltas", () => {
    const base = 10_000_000;
    expect(formatStaleness(base, base)).toBe("as of just now");
    expect(formatStaleness(base, base + 60_000)).toBe("as of 1 min ago");
    expect(formatStaleness(base, base + 5 * 60_000)).toBe("as of 5 min ago");
    expect(formatStaleness(base, base + 60 * 60_000)).toBe("as of 1 hour ago");
    expect(formatStaleness(base, base + 3 * 60 * 60_000)).toBe(
      "as of 3 hours ago"
    );
  });
});
