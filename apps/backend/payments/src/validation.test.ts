import { describe, it, expect } from "vitest";
import { validateRefundEligibilityQuery } from "./validation.js";

const VALID_CALLER = "GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI";

describe("validateRefundEligibilityQuery", () => {
  it("accepts a valid escrowId and caller", () => {
    const result = validateRefundEligibilityQuery("42", VALID_CALLER);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ escrowId: "42", caller: VALID_CALLER });
    }
  });

  it("rejects a missing escrowId", () => {
    const result = validateRefundEligibilityQuery(undefined, VALID_CALLER);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toMatch(/escrowId/);
    }
  });

  it("rejects a non-integer escrowId", () => {
    const result = validateRefundEligibilityQuery("not-a-number", VALID_CALLER);
    expect(result.ok).toBe(false);
  });

  it("rejects a missing caller", () => {
    const result = validateRefundEligibilityQuery("42", undefined);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toMatch(/caller/);
    }
  });

  it("rejects an invalid Stellar address for caller", () => {
    const result = validateRefundEligibilityQuery("42", "not-an-address");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toMatch(/valid Stellar account address/);
    }
  });
});
