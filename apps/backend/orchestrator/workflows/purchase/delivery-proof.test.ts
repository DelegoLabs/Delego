import { describe, it, expect, vi } from "vitest";
import { validateDeliveryProof, DeliveryProofInvalidError } from "./index.js";
import type { DeliveryProofAdapter } from "./index.js";

describe("validateDeliveryProof", () => {
  it("resolves with validation result when proof is valid", async () => {
    const adapter: DeliveryProofAdapter = {
      validate: vi.fn().mockResolvedValue({ orderId: "ord-1", proofId: "proof-1", valid: true }),
    };
    const result = await validateDeliveryProof("ord-1", "proof-1", adapter);
    expect(result.valid).toBe(true);
    expect(result.orderId).toBe("ord-1");
  });

  it("throws DeliveryProofInvalidError when proof is invalid", async () => {
    const adapter: DeliveryProofAdapter = {
      validate: vi.fn().mockResolvedValue({
        orderId: "ord-1",
        proofId: "proof-bad",
        valid: false,
        reason: "hash_mismatch",
      }),
    };
    await expect(validateDeliveryProof("ord-1", "proof-bad", adapter)).rejects.toThrow(
      DeliveryProofInvalidError
    );
  });

  it("error message includes orderId and reason on failure", async () => {
    const adapter: DeliveryProofAdapter = {
      validate: vi.fn().mockResolvedValue({
        orderId: "ord-2",
        proofId: "proof-bad",
        valid: false,
        reason: "hash_mismatch",
      }),
    };
    const err = await validateDeliveryProof("ord-2", "proof-bad", adapter).catch(
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(DeliveryProofInvalidError);
    expect((err as DeliveryProofInvalidError).message).toContain("ord-2");
    expect((err as DeliveryProofInvalidError).message).toContain("hash_mismatch");
  });

  it("blocks settlement — invalid proof error carries the full validation details", async () => {
    const adapter: DeliveryProofAdapter = {
      validate: vi.fn().mockResolvedValue({
        orderId: "ord-3",
        proofId: "proof-missing",
        valid: false,
        reason: "proof_not_found",
      }),
    };
    const err = await validateDeliveryProof("ord-3", "proof-missing", adapter).catch(
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(DeliveryProofInvalidError);
    const invalid = err as DeliveryProofInvalidError;
    expect(invalid.validation.valid).toBe(false);
    expect(invalid.validation.reason).toBe("proof_not_found");
  });
});
