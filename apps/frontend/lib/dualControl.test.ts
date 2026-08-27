import { describe, it, expect } from "vitest";
import type { DualControlState } from "@delegolabs/types";
import {
  isDualControlRequired,
  applyFirstApproval,
  canCountersign,
  applySecondApproval,
  SELF_COUNTERSIGN_MESSAGE,
} from "./dualControl";

const THRESHOLD = 1_000n * 10_000_000n;

describe("isDualControlRequired", () => {
  it("is false when the flag is off, regardless of amount", () => {
    expect(isDualControlRequired(THRESHOLD * 2n, THRESHOLD, false)).toBe(false);
  });

  it("is false below the threshold even with the flag on", () => {
    expect(isDualControlRequired(THRESHOLD - 1n, THRESHOLD, true)).toBe(false);
  });

  it("is true at or above the threshold with the flag on", () => {
    expect(isDualControlRequired(THRESHOLD, THRESHOLD, true)).toBe(true);
    expect(isDualControlRequired(THRESHOLD * 2n, THRESHOLD, true)).toBe(true);
  });
});

describe("applyFirstApproval", () => {
  it("transitions to awaiting_countersign and records the first approver", () => {
    const state = applyFirstApproval("user-1", "GABC...", "2026-01-01T00:00:00.000Z", ["user-2"]);
    expect(state).toEqual({
      required: true,
      status: "awaiting_countersign",
      delegationOwners: ["user-2"],
      firstApproval: { approverId: "user-1", approverAddress: "GABC...", timestamp: "2026-01-01T00:00:00.000Z" },
    });
  });
});

describe("canCountersign", () => {
  const awaiting: DualControlState = {
    required: true,
    status: "awaiting_countersign",
    delegationOwners: ["user-1", "user-2"],
    firstApproval: { approverId: "user-1", approverAddress: "GABC...", timestamp: "2026-01-01T00:00:00.000Z" },
  };

  it("blocks the original approver from countersigning their own approval", () => {
    const result = canCountersign(awaiting, "user-1");
    expect(result).toEqual({ allowed: false, reason: SELF_COUNTERSIGN_MESSAGE });
  });

  it("allows a different authorized delegate to countersign", () => {
    expect(canCountersign(awaiting, "user-2")).toEqual({ allowed: true });
  });

  it("rejects a signer not on the delegation owner list", () => {
    const result = canCountersign(awaiting, "user-outsider");
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/not an authorized delegate/i);
  });

  it("allows any signer when no delegation owner list is provided", () => {
    const noList: DualControlState = { ...awaiting, delegationOwners: [] };
    expect(canCountersign(noList, "anyone").allowed).toBe(true);
  });

  it("rejects when there's nothing awaiting a countersignature", () => {
    const completed: DualControlState = { required: true, status: "completed" };
    const result = canCountersign(completed, "user-2");
    expect(result.allowed).toBe(false);
  });
});

describe("applySecondApproval", () => {
  it("completes the flow, preserving the first approval and recording the second", () => {
    const awaiting: DualControlState = {
      required: true,
      status: "awaiting_countersign",
      firstApproval: { approverId: "user-1", approverAddress: "GABC...", timestamp: "2026-01-01T00:00:00.000Z" },
    };
    const completed = applySecondApproval(awaiting, "user-2", "GXYZ...", "2026-01-02T00:00:00.000Z");
    expect(completed.status).toBe("completed");
    expect(completed.firstApproval).toEqual(awaiting.firstApproval);
    expect(completed.secondApproval).toEqual({
      approverId: "user-2",
      approverAddress: "GXYZ...",
      timestamp: "2026-01-02T00:00:00.000Z",
    });
  });
});
