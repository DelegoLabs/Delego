/**
 * Tests for Issue 2: Fee Transparency — escrowFees.ts
 *
 * Core invariants:
 *  1. Missing config → totalFeeStroops/netStroops are null (not 0), configAbsent true.
 *  2. Numbers reconcile: gross - totalFee = net.
 *  3. Static BPS computation is exact (no floating point).
 *  4. isEstimate flag is set correctly.
 */
import { describe, it, expect } from "vitest";
import {
  computeEscrowFeeBreakdown,
  formatBps,
  type TreasuryFeeConfig,
} from "./escrowFees";

const GROSS = 100_000_000n; // 10 XLM

describe("computeEscrowFeeBreakdown — no config", () => {
  it("returns null fee and net when treasuries is undefined", () => {
    const b = computeEscrowFeeBreakdown(GROSS, undefined);
    expect(b.totalFeeStroops).toBeNull();
    expect(b.netStroops).toBeNull();
    expect(b.configAbsent).toBe(true);
    expect(b.lines).toHaveLength(0);
  });

  it("returns null when treasuries is null", () => {
    const b = computeEscrowFeeBreakdown(GROSS, null);
    expect(b.totalFeeStroops).toBeNull();
    expect(b.netStroops).toBeNull();
    expect(b.configAbsent).toBe(true);
  });

  it("returns null when treasuries is empty array", () => {
    const b = computeEscrowFeeBreakdown(GROSS, []);
    expect(b.totalFeeStroops).toBeNull();
    expect(b.configAbsent).toBe(true);
  });
});

describe("computeEscrowFeeBreakdown — static BPS", () => {
  const treasuries: TreasuryFeeConfig[] = [
    { address: "addr-1", label: "Protocol", bps: 50 }, // 0.5%
  ];

  it("computes fee exactly from BPS without floating point", () => {
    const b = computeEscrowFeeBreakdown(GROSS, treasuries);
    // 10 XLM * 0.5% = 0.05 XLM = 500_000 stroops
    expect(b.totalFeeStroops).toBe(500_000n);
    expect(b.netStroops).toBe(GROSS - 500_000n);
    expect(b.grossStroops).toBe(GROSS);
    expect(b.configAbsent).toBe(false);
    expect(b.hasEstimate).toBe(false);
  });

  it("gross - fee = net (reconciliation)", () => {
    const b = computeEscrowFeeBreakdown(GROSS, treasuries);
    expect(b.grossStroops - b.totalFeeStroops!).toBe(b.netStroops);
  });

  it("line carries bps and isEstimate=false", () => {
    const b = computeEscrowFeeBreakdown(GROSS, treasuries);
    expect(b.lines[0].bps).toBe(50);
    expect(b.lines[0].isEstimate).toBe(false);
  });
});

describe("computeEscrowFeeBreakdown — fixed stroops", () => {
  const treasuries: TreasuryFeeConfig[] = [
    { address: "addr-1", label: "Flat fee", fixedStroops: 1_000_000n },
  ];

  it("uses fixedStroops directly", () => {
    const b = computeEscrowFeeBreakdown(GROSS, treasuries);
    expect(b.totalFeeStroops).toBe(1_000_000n);
    expect(b.netStroops).toBe(GROSS - 1_000_000n);
    expect(b.hasEstimate).toBe(false);
  });
});

describe("computeEscrowFeeBreakdown — dynamic (no bps or fixed)", () => {
  const treasuries: TreasuryFeeConfig[] = [
    { address: "addr-1", label: "Dynamic fee" }, // no bps, no fixed
  ];

  it("sets hasEstimate=true and amount=null for the line", () => {
    const b = computeEscrowFeeBreakdown(GROSS, treasuries);
    expect(b.hasEstimate).toBe(true);
    expect(b.lines[0].amount).toBeNull();
    expect(b.lines[0].isEstimate).toBe(true);
  });

  it("totalFeeStroops and netStroops are null when any line is dynamic", () => {
    const b = computeEscrowFeeBreakdown(GROSS, treasuries);
    expect(b.totalFeeStroops).toBeNull();
    expect(b.netStroops).toBeNull();
  });
});

describe("computeEscrowFeeBreakdown — multi-treasury reconciliation", () => {
  const treasuries: TreasuryFeeConfig[] = [
    { address: "addr-1", label: "Protocol", bps: 50 }, // 0.5%
    { address: "addr-2", label: "Agent", bps: 100 }, // 1.0%
  ];

  it("sums lines correctly", () => {
    const b = computeEscrowFeeBreakdown(GROSS, treasuries);
    // 0.5% + 1% = 1.5% of 10 XLM = 1,500,000 stroops
    expect(b.totalFeeStroops).toBe(1_500_000n);
    expect(b.netStroops).toBe(GROSS - 1_500_000n);
    expect(b.lines).toHaveLength(2);
  });
});

describe("formatBps", () => {
  it("converts 50 bps to '0.5%'", () => expect(formatBps(50)).toBe("0.5%"));
  it("converts 100 bps to '1%'", () => expect(formatBps(100)).toBe("1%"));
  it("converts 10 bps to '0.1%'", () => expect(formatBps(10)).toBe("0.1%"));
  it("converts 1 bps to '0.01%'", () => expect(formatBps(1)).toBe("0.01%"));
  it("converts 333 bps to '3.33%'", () => expect(formatBps(333)).toBe("3.33%"));
});
