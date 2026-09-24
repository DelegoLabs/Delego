import { describe, it, expect } from "vitest";
import {
  applySignature,
  canSign,
  groupByStatus,
  type DualControlBoardEntry,
  type DualControlOrder,
} from "./dualControlBoard";

const CREATOR = "GCREATOR";
const ALICE = "GALICE";
const BOB = "GBOB";

function entry(order: Partial<DualControlOrder> = {}): DualControlBoardEntry {
  return {
    createdBy: CREATOR,
    totalStroops: "15000000000",
    order: {
      orderId: "ord_1",
      requiredApprovals: 2,
      currentSigners: [],
      pendingSigners: [],
      status: "pending_first",
      ...order,
    },
  };
}

describe("canSign", () => {
  it("lets a team member sign first", () => {
    expect(canSign(entry(), ALICE).allowed).toBe(true);
  });

  it("blocks the first approver from also signing second", () => {
    const e = entry({
      status: "pending_second",
      currentSigners: [{ signerAddress: ALICE, signedAt: "2026-09-24T10:00:00Z" }],
    });
    const check = canSign(e, ALICE);
    expect(check.allowed).toBe(false);
    expect(check.reason).toMatch(/already signed/);
    expect(canSign(e, BOB).allowed).toBe(true);
  });

  it("never lets the creator be the sole approver", () => {
    const single = entry({ requiredApprovals: 1 });
    expect(canSign(single, CREATOR).allowed).toBe(false);

    // Creator signing first is fine — someone else must still sign second.
    expect(canSign(entry(), CREATOR).allowed).toBe(true);

    // Creator can countersign once another member has signed.
    const afterAlice = entry({
      status: "pending_second",
      currentSigners: [{ signerAddress: ALICE, signedAt: "2026-09-24T10:00:00Z" }],
    });
    expect(canSign(afterAlice, CREATOR).allowed).toBe(true);
  });

  it("respects the requested signer list and terminal states", () => {
    expect(canSign(entry({ pendingSigners: [BOB] }), ALICE).allowed).toBe(false);
    expect(canSign(entry({ status: "fully_approved" }), ALICE).allowed).toBe(false);
    expect(canSign(entry({ status: "rejected" }), ALICE).allowed).toBe(false);
    expect(canSign(entry(), null).allowed).toBe(false);
  });
});

describe("applySignature", () => {
  it("advances pending_first → pending_second → fully_approved", () => {
    const first = applySignature(entry({ pendingSigners: [ALICE, BOB] }).order, ALICE, "t1");
    expect(first.status).toBe("pending_second");
    expect(first.pendingSigners).toEqual([BOB]);
    const second = applySignature(first, BOB, "t2");
    expect(second.status).toBe("fully_approved");
    expect(second.currentSigners.map((s) => s.signerAddress)).toEqual([ALICE, BOB]);
  });
});

describe("groupByStatus", () => {
  it("buckets entries into board columns", () => {
    const groups = groupByStatus([entry(), entry({ orderId: "ord_2", status: "rejected" })]);
    expect(groups.pending_first).toHaveLength(1);
    expect(groups.rejected).toHaveLength(1);
    expect(groups.fully_approved).toHaveLength(0);
  });
});
