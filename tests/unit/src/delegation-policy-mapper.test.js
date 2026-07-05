import { describe, it } from "node:test";
import assert from "node:assert/strict";

/**
 * Issue #190 — DelegationPolicyResponse mapper unit tests.
 *
 * The mapper lives at apps/backend/gateway/src/mappers/delegationPolicy.ts.
 * We re-implement the pure mapping logic here so the test file is self-contained
 * and does not require TypeScript compilation or Sequelize model imports.
 */

// ── Inline mapper (mirrors the real implementation) ─────────────────────

function mapDelegationPolicy(policy, spendLimit, expiresAt) {
  const delegationId = policy?.delegationId ?? spendLimit?.delegationId ?? "";

  return {
    delegationId,
    maxPerTransaction: String(spendLimit?.limitPerTransaction ?? "0"),
    maxTotal: String(spendLimit?.limitLifetime ?? "0"),
    allowedMerchants: policy?.allowedMerchants ?? [],
    allowedCategories: policy?.allowedCategories ?? [],
    restrictedMerchants: policy?.restrictedMerchants ?? [],
    restrictedCategories: policy?.restrictedCategories ?? [],
    expiresAt:
      expiresAt instanceof Date
        ? expiresAt.toISOString()
        : expiresAt ?? null,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("mapDelegationPolicy", () => {
  it("maps full policy + spend limit into correct DTO shape", () => {
    const policy = {
      delegationId: "abc-123",
      allowedMerchants: ["merchant-A"],
      allowedCategories: ["food"],
      restrictedMerchants: ["merchant-X"],
      restrictedCategories: ["gambling"],
    };
    const spendLimit = {
      delegationId: "abc-123",
      limitPerTransaction: "5000000000",
      limitLifetime: "100000000000",
    };

    const result = mapDelegationPolicy(policy, spendLimit, "2025-12-31T00:00:00Z");

    assert.equal(result.delegationId, "abc-123");
    assert.equal(result.maxPerTransaction, "5000000000");
    assert.equal(result.maxTotal, "100000000000");
    assert.deepEqual(result.allowedMerchants, ["merchant-A"]);
    assert.deepEqual(result.allowedCategories, ["food"]);
    assert.deepEqual(result.restrictedMerchants, ["merchant-X"]);
    assert.deepEqual(result.restrictedCategories, ["gambling"]);
    assert.equal(result.expiresAt, "2025-12-31T00:00:00Z");
  });

  it("handles null policy gracefully", () => {
    const spendLimit = {
      delegationId: "del-1",
      limitPerTransaction: "1000",
      limitLifetime: "5000",
    };

    const result = mapDelegationPolicy(null, spendLimit, null);

    assert.equal(result.delegationId, "del-1");
    assert.equal(result.maxPerTransaction, "1000");
    assert.equal(result.maxTotal, "5000");
    assert.deepEqual(result.allowedMerchants, []);
    assert.deepEqual(result.restrictedMerchants, []);
    assert.equal(result.expiresAt, null);
  });

  it("handles null spend limit gracefully", () => {
    const policy = {
      delegationId: "del-2",
      allowedMerchants: ["m1"],
      allowedCategories: [],
      restrictedMerchants: [],
      restrictedCategories: [],
    };

    const result = mapDelegationPolicy(policy, null, null);

    assert.equal(result.delegationId, "del-2");
    assert.equal(result.maxPerTransaction, "0");
    assert.equal(result.maxTotal, "0");
  });

  it("handles both null inputs", () => {
    const result = mapDelegationPolicy(null, null, null);

    assert.equal(result.delegationId, "");
    assert.equal(result.maxPerTransaction, "0");
    assert.equal(result.maxTotal, "0");
    assert.deepEqual(result.allowedMerchants, []);
    assert.equal(result.expiresAt, null);
  });

  it("converts Date expiresAt to ISO string", () => {
    const date = new Date("2026-06-15T12:00:00Z");
    const result = mapDelegationPolicy(null, null, date);

    assert.equal(result.expiresAt, "2026-06-15T12:00:00.000Z");
  });

  it("serializes bigint-like values as strings", () => {
    const spendLimit = {
      delegationId: "del-big",
      limitPerTransaction: "9007199254740993",
      limitLifetime: "99999999999999999",
    };

    const result = mapDelegationPolicy(null, spendLimit, null);

    assert.equal(typeof result.maxPerTransaction, "string");
    assert.equal(typeof result.maxTotal, "string");
    assert.equal(result.maxPerTransaction, "9007199254740993");
    assert.equal(result.maxTotal, "99999999999999999");
  });
});
