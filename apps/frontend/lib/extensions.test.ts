import { describe, it, expect } from "vitest";
import type { Escrow } from "@delegolabs/types";
import {
  isExtensionAllowed,
  computeExtendedDeadline,
  availablePresets,
  presetSeconds,
  presetLabel,
} from "./extensions";

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
    originalDeadline: "2026-01-10T00:00:00.000Z",
    deadline: "2026-01-10T00:00:00.000Z",
    extensionsConsumed: 0,
    maxExtensions: 3,
    maxExtensionSeconds: 30 * 24 * 3600, // 30 days total budget
    ...overrides,
  };
}

describe("presetSeconds / presetLabel", () => {
  it("maps each preset to its duration in seconds", () => {
    expect(presetSeconds("+1d")).toBe(86_400);
    expect(presetSeconds("+1w")).toBe(604_800);
    expect(presetSeconds("+1m")).toBe(2_592_000);
  });

  it("has a human label for every preset", () => {
    expect(presetLabel("+1d")).toBe("+1 day");
    expect(presetLabel("+1w")).toBe("+1 week");
    expect(presetLabel("+1m")).toBe("+1 month");
  });
});

describe("isExtensionAllowed", () => {
  it("allows a preset within the contract's remaining extension count and time budget", () => {
    const escrow = makeEscrow();
    expect(isExtensionAllowed(escrow, "+1d")).toEqual({ eligible: true });
  });

  it("rejects once the extension count is exhausted", () => {
    const escrow = makeEscrow({ extensionsConsumed: 3, maxExtensions: 3 });
    const result = isExtensionAllowed(escrow, "+1d");
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/maximum/i);
  });

  it("rejects a preset that would push the deadline past the contract's total extension budget", () => {
    // 30-day budget already consumed by prior extensions bringing deadline
    // to originalDeadline + 29 days; a further +1w would exceed the budget.
    const escrow = makeEscrow({
      originalDeadline: "2026-01-01T00:00:00.000Z",
      deadline: "2026-01-30T00:00:00.000Z", // +29d from original
      maxExtensionSeconds: 30 * 24 * 3600,
      extensionsConsumed: 1,
      maxExtensions: 5,
    });
    const result = isExtensionAllowed(escrow, "+1w");
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/bound/i);
  });

  it("allows a preset that lands exactly on the budget boundary", () => {
    const escrow = makeEscrow({
      originalDeadline: "2026-01-01T00:00:00.000Z",
      deadline: "2026-01-30T00:00:00.000Z", // +29d
      maxExtensionSeconds: 30 * 24 * 3600, // 30d budget
      extensionsConsumed: 1,
      maxExtensions: 5,
    });
    // +1d lands exactly at originalDeadline + 30d.
    expect(isExtensionAllowed(escrow, "+1d").eligible).toBe(true);
  });

  it("allows any preset when the escrow carries no deadline/bound metadata", () => {
    const escrow = makeEscrow({
      originalDeadline: undefined,
      deadline: undefined,
      maxExtensionSeconds: undefined,
      maxExtensions: undefined,
    });
    expect(isExtensionAllowed(escrow, "+1m").eligible).toBe(true);
  });
});

describe("computeExtendedDeadline", () => {
  it("adds the preset duration to the current deadline", () => {
    const escrow = makeEscrow({ deadline: "2026-01-10T00:00:00.000Z" });
    const result = computeExtendedDeadline(escrow, "+1d");
    expect(result.toISOString()).toBe("2026-01-11T00:00:00.000Z");
  });

  it("falls back to originalDeadline when no current deadline is set", () => {
    const escrow = makeEscrow({ deadline: undefined, originalDeadline: "2026-01-10T00:00:00.000Z" });
    const result = computeExtendedDeadline(escrow, "+1w");
    expect(result.toISOString()).toBe("2026-01-17T00:00:00.000Z");
  });
});

describe("availablePresets", () => {
  it("marks every preset ineligible once the extension count is exhausted, each with a reason", () => {
    const escrow = makeEscrow({ extensionsConsumed: 3, maxExtensions: 3 });
    const options = availablePresets(escrow);
    expect(options).toHaveLength(3);
    expect(options.every((o) => !o.eligible && !!o.reason)).toBe(true);
  });

  it("returns a mix of eligible/ineligible presets when only the longer ones exceed the budget", () => {
    const escrow = makeEscrow({
      originalDeadline: "2026-01-01T00:00:00.000Z",
      deadline: "2026-01-25T00:00:00.000Z", // +24d
      maxExtensionSeconds: 30 * 24 * 3600, // 6 days of budget left
      extensionsConsumed: 1,
      maxExtensions: 5,
    });
    const options = availablePresets(escrow);
    const byPreset = Object.fromEntries(options.map((o) => [o.preset, o.eligible]));
    expect(byPreset["+1d"]).toBe(true); // 1 day fits in the remaining 6
    expect(byPreset["+1w"]).toBe(false); // 7 days doesn't fit in 6
    expect(byPreset["+1m"]).toBe(false);
  });
});
