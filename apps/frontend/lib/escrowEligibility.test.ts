import { describe, it, expect } from "vitest";
import type { Escrow } from "@delegolabs/types";
import { isReleaseEligible, isExtensionEligible, countReleaseEligible } from "./escrowEligibility";

function makeEscrow(overrides: Partial<Escrow> = {}): Escrow {
  return {
    id: "escrow-1",
    escrowId: "escrow-1",
    orderId: "order-1",
    buyer: "buyer-1",
    seller: "seller-1",
    amount: 100n,
    status: "funded",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("isReleaseEligible", () => {
  it("is eligible for a funded escrow with no pending cancellation", () => {
    expect(isReleaseEligible(makeEscrow()).eligible).toBe(true);
  });

  it("is ineligible for a non-funded status, with an inline reason", () => {
    const result = isReleaseEligible(makeEscrow({ status: "released" }));
    expect(result).toEqual({ eligible: false, reason: "Not release-eligible" });
  });

  it("is ineligible while a cancellation is pending, even if status is funded", () => {
    const result = isReleaseEligible(
      makeEscrow({
        cancellation: {
          requestedAt: "2026-01-01T00:00:00.000Z",
          gracePeriodSeconds: 30,
          graceExpiresAt: "2026-01-01T00:00:30.000Z",
          serverTimestamp: "2026-01-01T00:00:00.000Z",
        },
      })
    );
    expect(result).toEqual({ eligible: false, reason: "Cancellation pending" });
  });
});

describe("isExtensionEligible", () => {
  it("delegates to contract-bound validation once the base status check passes", () => {
    const result = isExtensionEligible(
      makeEscrow({ extensionsConsumed: 3, maxExtensions: 3 }),
      "+1d"
    );
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/maximum/i);
  });

  it("is ineligible for a non-funded escrow before even checking bounds", () => {
    const result = isExtensionEligible(makeEscrow({ status: "disputed" }));
    expect(result).toEqual({ eligible: false, reason: "Not extension-eligible" });
  });
});

describe("countReleaseEligible", () => {
  it("counts only release-eligible escrows in a mixed list", () => {
    const escrows = [
      makeEscrow({ id: "a", status: "funded" }),
      makeEscrow({ id: "b", status: "released" }),
      makeEscrow({ id: "c", status: "funded" }),
      makeEscrow({ id: "d", status: "disputed" }),
    ];
    expect(countReleaseEligible(escrows)).toBe(2);
  });
});
