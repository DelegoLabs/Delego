import { describe, it, expect } from "vitest";
import { hasKillSwitchAction, isKillSwitchConfirmed } from "./killSwitch";

describe("isKillSwitchConfirmed", () => {
  it("requires the exact REVOKE phrase", () => {
    expect(isKillSwitchConfirmed("REVOKE")).toBe(true);
    expect(isKillSwitchConfirmed("  REVOKE ")).toBe(true);
    expect(isKillSwitchConfirmed("revoke")).toBe(false);
    expect(isKillSwitchConfirmed("REVOK")).toBe(false);
    expect(isKillSwitchConfirmed("")).toBe(false);
  });
});

describe("hasKillSwitchAction", () => {
  it("needs at least one action selected", () => {
    const base = { walletAddress: "G", revokeAllDelegations: false, cancelPendingOrders: false };
    expect(hasKillSwitchAction(base)).toBe(false);
    expect(hasKillSwitchAction({ ...base, revokeAllDelegations: true })).toBe(true);
    expect(hasKillSwitchAction({ ...base, cancelPendingOrders: true })).toBe(true);
  });
});
