/**
 * Agent user-preference memory (#682): what the agent has memorized about the
 * user (shoe size, address, brand preferences…) so they can inspect and
 * delete it.
 */

import type { BadgeTone } from "@delegolabs/ui";

export type AgentMemoryCategory =
  | "personal"
  | "preference"
  | "constraint"
  | "history";

export interface AgentMemoryItem {
  id: string;
  category: AgentMemoryCategory;
  key: string;
  value: string;
  confidence: number; // 0.0 - 1.0
  updatedAt: string;
}

export const AGENT_MEMORY_CATEGORIES: AgentMemoryCategory[] = [
  "personal",
  "preference",
  "constraint",
  "history",
];

export const MEMORY_CATEGORY_LABELS: Record<AgentMemoryCategory, string> = {
  personal: "Personal",
  preference: "Preference",
  constraint: "Constraint",
  history: "History",
};

export const MEMORY_CATEGORY_TONES: Record<AgentMemoryCategory, BadgeTone> = {
  personal: "info",
  preference: "success",
  constraint: "warning",
  history: "neutral",
};

/**
 * Case-insensitive search across key, value and category label, optionally
 * narrowed to one category. An empty query matches everything.
 */
export function filterMemories(
  memories: AgentMemoryItem[],
  query: string,
  category: AgentMemoryCategory | "all" = "all"
): AgentMemoryItem[] {
  const needle = query.trim().toLowerCase();
  return memories.filter((m) => {
    if (category !== "all" && m.category !== category) return false;
    if (!needle) return true;
    return (
      m.key.toLowerCase().includes(needle) ||
      m.value.toLowerCase().includes(needle) ||
      MEMORY_CATEGORY_LABELS[m.category].toLowerCase().includes(needle)
    );
  });
}

/** Clamps a 0.0–1.0 confidence to a whole percentage for display. */
export function confidencePercent(confidence: number): number {
  if (!Number.isFinite(confidence)) return 0;
  return Math.round(Math.min(1, Math.max(0, confidence)) * 100);
}
