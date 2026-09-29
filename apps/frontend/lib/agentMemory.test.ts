import { describe, expect, it } from "vitest";
import {
  confidencePercent,
  filterMemories,
  type AgentMemoryItem,
} from "./agentMemory";

const memories: AgentMemoryItem[] = [
  {
    id: "1",
    category: "personal",
    key: "Shoe size",
    value: "EU 42",
    confidence: 0.9,
    updatedAt: "2026-09-01T00:00:00Z",
  },
  {
    id: "2",
    category: "preference",
    key: "Brand",
    value: "Patagonia",
    confidence: 0.6,
    updatedAt: "2026-09-02T00:00:00Z",
  },
  {
    id: "3",
    category: "constraint",
    key: "Max spend",
    value: "50 USDC",
    confidence: 1,
    updatedAt: "2026-09-03T00:00:00Z",
  },
];

describe("agentMemory", () => {
  it("filters by key, value or category label, case-insensitively", () => {
    expect(filterMemories(memories, "shoe").map((m) => m.id)).toEqual(["1"]);
    expect(filterMemories(memories, "PATAGONIA").map((m) => m.id)).toEqual([
      "2",
    ]);
    expect(filterMemories(memories, "constraint").map((m) => m.id)).toEqual([
      "3",
    ]);
    expect(filterMemories(memories, "  ")).toHaveLength(3);
  });

  it("narrows by category", () => {
    expect(filterMemories(memories, "", "preference").map((m) => m.id)).toEqual(
      ["2"]
    );
    expect(filterMemories(memories, "shoe", "preference")).toHaveLength(0);
  });

  it("clamps confidence to a percentage", () => {
    expect(confidencePercent(0.456)).toBe(46);
    expect(confidencePercent(2)).toBe(100);
    expect(confidencePercent(Number.NaN)).toBe(0);
  });
});
