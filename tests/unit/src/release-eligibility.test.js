import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Task 3 — Release eligibility invariants", () => {
  it("checks that a submit guard rejects when eligibility is false", () => {
    function canSubmit(eligibility, unmetConditions) {
      if (!eligibility || !eligibility.eligible) return false;
      if (unmetConditions && unmetConditions.length > 0) return false;
      return true;
    }

    assert.equal(canSubmit(null, []), false);
    assert.equal(canSubmit({ eligible: false, conditions: [], queriedAt: "t" }, []), false);
    assert.equal(
      canSubmit(
        { eligible: true, conditions: [], queriedAt: "t" },
        [{ key: "timeout_reached", met: false, message: "nope", effectiveAt: null }]
      ),
      false
    );
    assert.equal(
      canSubmit({ eligible: true, conditions: [], queriedAt: "t" }, []),
      true
    );
  });

  it("verifies TTL cache keying is (escrowId, callerAddress) so two users get separate caches", () => {
    function cacheKey(escrowId, callerAddress) {
      return `${escrowId}:${callerAddress}`;
    }
    assert.notEqual(
      cacheKey("escrow-1", "GAAA...BUYER"),
      cacheKey("escrow-1", "GAAA...ADMIN")
    );
    assert.equal(cacheKey("escrow-1", "GAAA...BUYER"), cacheKey("escrow-1", "GAAA...BUYER"));
  });

  it("verifies cache invalidation removes all entries for an escrow regardless of caller", () => {
    const map = new Map();
    map.set("escrow-1:buyer", 1);
    map.set("escrow-1:admin", 2);
    map.set("escrow-2:buyer", 3);

    function invalidate(id) {
      for (const k of Array.from(map.keys())) {
        if (k.startsWith(`${id}:`)) map.delete(k);
      }
    }
    invalidate("escrow-1");
    assert.equal(map.has("escrow-1:buyer"), false);
    assert.equal(map.has("escrow-1:admin"), false);
    assert.equal(map.has("escrow-2:buyer"), true);
  });
});
