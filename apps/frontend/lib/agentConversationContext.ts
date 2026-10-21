/**
 * Multi-turn negotiation memory for the Buyer Agent chat (#MEMORY).
 *
 * The agent infers shopping constraints from the conversation transcript as the
 * buyer types. This module owns the *vocabulary* and the heuristics for
 * extracting those constraints so that the Context / Memory panel, the reset
 * control, and any future server-sync all agree on the same shape.
 */

/** How many complete turns (user + assistant pairs) the agent has seen. */
export type ConversationTurn = number;

/** Condition preference inferred from buyer messages. */
export type PreferredCondition = "new" | "used" | "any";

/**
 * Snapshot of what the Buyer Agent has inferred about the current shopping
 * session from the multi-turn conversation transcript.
 *
 * All fields are optional — they are only populated once evidence for them
 * appears in the transcript. `excludedMerchants` and `turnsCount` always
 * have defined values (defaults: `[]` and `0`).
 */
export interface AgentConversationContext {
  /** Active per-session budget cap inferred from user messages (e.g. "under 50 USDC"). */
  activeBudgetStroops?: string;
  /** Target product category inferred from the conversation (e.g. "laptops"). */
  targetCategory?: string;
  /** Merchant names / ids the buyer has explicitly excluded. */
  excludedMerchants: string[];
  /** Item condition preference the buyer has expressed. */
  preferredCondition: PreferredCondition;
  /** How many complete user↔assistant exchanges have occurred in this session. */
  turnsCount: ConversationTurn;
}

/** A freshly-started context with no inferred preferences. */
export const EMPTY_CONTEXT: Readonly<AgentConversationContext> = {
  excludedMerchants: [],
  preferredCondition: "any",
  turnsCount: 0,
};

// ── Heuristic extraction helpers ─────────────────────────────────────────────

/**
 * Attempt to parse a budget cap from free-form buyer text.
 *
 * Accepts patterns like:
 *   "under $50"  "less than 200 USDC"  "budget of 150"  "no more than 300"
 *
 * Returns the amount expressed as stroops (XLM × 10_000_000) when a number is
 * found, otherwise `undefined`. XLM ≈ USDC ≈ 1:1 for this heuristic so we
 * treat them the same.
 */
export function parseBudgetStroops(text: string): string | undefined {
  const match = text.match(
    /(?:under|less\s+than|budget\s+(?:of|is)?|no\s+more\s+than|max(?:imum)?)\s*\$?\s*(\d[\d,]*(?:\.\d+)?)/i
  );
  if (!match) return undefined;
  const amount = parseFloat(match[1].replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  return Math.round(amount * 10_000_000).toString();
}

/**
 * Attempt to extract a product category from free-form text.
 *
 * Returns the first known category keyword found (case-insensitive) or
 * `undefined`.
 */
const KNOWN_CATEGORIES = [
  "laptop",
  "laptops",
  "keyboard",
  "keyboards",
  "monitor",
  "monitors",
  "headphone",
  "headphones",
  "phone",
  "phones",
  "tablet",
  "tablets",
  "camera",
  "cameras",
  "speaker",
  "speakers",
  "mouse",
  "mice",
  "desk",
  "chair",
  "clothing",
  "shoes",
  "book",
  "books",
];

export function parseCategory(text: string): string | undefined {
  const lower = text.toLowerCase();
  const found = KNOWN_CATEGORIES.find((cat) => lower.includes(cat));
  if (!found) return undefined;
  // Normalise plural → singular for display
  return found.replace(/s$/, "") === found ? found : found.replace(/s$/, "");
}

/**
 * Attempt to extract merchants the buyer wants to exclude.
 *
 * Accepts patterns like:
 *   "not from Acme"  "exclude MegaStore"  "avoid ShopX"  "not MegaCorp"
 */
export function parseExcludedMerchants(text: string): string[] {
  const matches = text.matchAll(
    /(?:not\s+from|not|exclude|excluding|avoid|without)\s+([A-Z][A-Za-z0-9\s&'-]{1,40}?)(?:\s|,|$|\.|and)/gi
  );
  return Array.from(matches, (m) => m[1].trim()).filter(Boolean);
}

/** Detect a condition preference from text. */
export function parseCondition(text: string): PreferredCondition | undefined {
  const lower = text.toLowerCase();
  if (/\bnew\b/.test(lower)) return "new";
  if (/\bused\b|\bsecond[-\s]?hand\b|\brefurbished\b/.test(lower))
    return "used";
  return undefined;
}

// ── Context derivation ────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
}

/**
 * Derive an `AgentConversationContext` by scanning every *user* message in
 * the transcript heuristically.
 *
 * Later messages win over earlier ones for scalar fields (budget, category,
 * condition). Excluded merchants accumulate across all messages.
 */
export function deriveContext(
  messages: readonly ChatMessage[]
): AgentConversationContext {
  const userMessages = messages.filter((m) => m.role === "user");
  const assistantMessages = messages.filter((m) => m.role === "assistant");
  const turnsCount = Math.min(userMessages.length, assistantMessages.length);

  let activeBudgetStroops: string | undefined;
  let targetCategory: string | undefined;
  const excludedMerchantsSet = new Set<string>();
  let preferredCondition: PreferredCondition = "any";

  for (const msg of userMessages) {
    const budget = parseBudgetStroops(msg.content);
    if (budget) activeBudgetStroops = budget;

    const category = parseCategory(msg.content);
    if (category) targetCategory = category;

    for (const merchant of parseExcludedMerchants(msg.content)) {
      excludedMerchantsSet.add(merchant);
    }

    const condition = parseCondition(msg.content);
    if (condition) preferredCondition = condition;
  }

  return {
    ...(activeBudgetStroops !== undefined ? { activeBudgetStroops } : {}),
    ...(targetCategory !== undefined ? { targetCategory } : {}),
    excludedMerchants: Array.from(excludedMerchantsSet),
    preferredCondition,
    turnsCount,
  };
}

// ── Display helpers ───────────────────────────────────────────────────────────

/** Format a stroops string as a human-readable amount for display in chips. */
export function formatBudgetDisplay(stroops: string): string {
  const n = BigInt(stroops);
  const whole = n / 10_000_000n;
  const frac = n % 10_000_000n;
  if (frac === 0n) return `${whole} USDC`;
  const decimal = (Number(frac) / 10_000_000).toFixed(2).slice(1); // ".xx"
  return `${whole}${decimal} USDC`;
}

/** Human-readable label for each context field rendered as a chip. */
export interface ContextChip {
  key: string;
  label: string;
  value: string;
}

/**
 * Convert an `AgentConversationContext` into an array of display chips.
 * Fields that have no meaningful value are omitted.
 */
export function contextToChips(ctx: AgentConversationContext): ContextChip[] {
  const chips: ContextChip[] = [];

  if (ctx.activeBudgetStroops) {
    chips.push({
      key: "budget",
      label: "Budget",
      value: formatBudgetDisplay(ctx.activeBudgetStroops),
    });
  }

  if (ctx.targetCategory) {
    chips.push({
      key: "category",
      label: "Category",
      value: ctx.targetCategory,
    });
  }

  if (ctx.preferredCondition !== "any") {
    chips.push({
      key: "condition",
      label: "Condition",
      value: ctx.preferredCondition === "new" ? "New only" : "Used / refurbished",
    });
  }

  for (const merchant of ctx.excludedMerchants) {
    chips.push({
      key: `excluded-${merchant}`,
      label: "Excluded merchant",
      value: merchant,
    });
  }

  chips.push({
    key: "turns",
    label: "Turns",
    value: String(ctx.turnsCount),
  });

  return chips;
}
