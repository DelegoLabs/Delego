import { describe, it, expect } from "vitest";
import {
  maxAllocationFor,
  percentOf,
  setAllocation,
  totalAllocated,
  usageTone,
  validateBudgets,
  type CategoryBudget,
} from "./categoryBudgets";

const XLM = 10_000_000n;
const LIMIT = 300n * XLM;

const budgets: CategoryBudget[] = [
  {
    category: "Groceries",
    allocatedStroops: (200n * XLM).toString(),
    spentStroops: (50n * XLM).toString(),
    limitPeriod: "monthly",
  },
  {
    category: "Digital",
    allocatedStroops: (50n * XLM).toString(),
    spentStroops: (45n * XLM).toString(),
    limitPeriod: "monthly",
  },
];

describe("category budget math", () => {
  it("computes headroom per category", () => {
    expect(totalAllocated(budgets)).toBe(250n * XLM);
    expect(maxAllocationFor(budgets, 1, LIMIT)).toBe(100n * XLM);
    expect(maxAllocationFor(budgets, 0, LIMIT)).toBe(250n * XLM);
  });

  it("clamps a slider so the sum never exceeds the parent limit", () => {
    const next = setAllocation(budgets, 1, 500n * XLM, LIMIT);
    expect(next[1].allocatedStroops).toBe((100n * XLM).toString());
    expect(totalAllocated(next)).toBe(LIMIT);
    expect(validateBudgets(next, LIMIT).valid).toBe(true);
    expect(setAllocation(budgets, 1, -5n, LIMIT)[1].allocatedStroops).toBe("0");
  });

  it("flags budgets that already exceed a lowered parent limit", () => {
    const result = validateBudgets(budgets, 200n * XLM);
    expect(result.valid).toBe(false);
    expect(result.overBy).toBe(50n * XLM);
  });

  it("computes percentages and usage tones", () => {
    expect(percentOf(200n * XLM, LIMIT)).toBe(66.6);
    expect(percentOf(1n, 0n)).toBe(0);
    expect(usageTone(budgets[0])).toBe("ok");
    expect(usageTone(budgets[1])).toBe("warning");
    expect(usageTone({ ...budgets[1], spentStroops: (60n * XLM).toString() })).toBe("over");
  });
});
