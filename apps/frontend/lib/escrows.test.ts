import { describe, it, expect } from "vitest";
import type { Escrow } from "@delegolabs/types";
import { escrowKey } from "./escrows";

function makeEscrow(overrides: Partial<Escrow> = {}): Escrow {
  return {
    escrowId: "escrow-1",
    orderId: "order-1",
    buyer: "buyer-1",
    seller: "seller-1",
    amount: 1n,
    status: "funded",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("escrowKey", () => {
  it("prefers escrowId, the field the API and fixtures actually populate", () => {
    expect(escrowKey(makeEscrow({ escrowId: "esc-a", id: "internal-a" }))).toBe("esc-a");
  });

  it("falls back to id when escrowId is absent", () => {
    const escrow = makeEscrow({ escrowId: undefined as unknown as string, id: "internal-a" });
    expect(escrowKey(escrow)).toBe("internal-a");
  });

  it("never returns undefined, even with neither field set", () => {
    const escrow = makeEscrow({ escrowId: undefined as unknown as string, id: undefined });
    expect(escrowKey(escrow)).toBe("");
  });
});
