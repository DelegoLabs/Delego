import { describe, expect, it } from "vitest";
import {
  contextToChips,
  deriveContext,
  EMPTY_CONTEXT,
  formatBudgetDisplay,
  parseBudgetStroops,
  parseCategory,
  parseCondition,
  parseExcludedMerchants,
  type ChatMessage,
} from "./agentConversationContext";

// ── parseBudgetStroops ────────────────────────────────────────────────────────

describe("parseBudgetStroops", () => {
  it.each([
    ["under $50", "500000000"],
    ["less than 200 USDC", "2000000000"],
    ["budget of 150", "1500000000"],
    ["no more than 300", "3000000000"],
    ["max 75", "750000000"],
    ["maximum $1,000", "10000000000"],
    ["budget is 25.50", "255000000"],
  ])("parses %s → %s stroops", (input, expected) => {
    expect(parseBudgetStroops(input)).toBe(expected);
  });

  it("returns undefined when no budget pattern is found", () => {
    expect(parseBudgetStroops("find me a laptop")).toBeUndefined();
    expect(parseBudgetStroops("")).toBeUndefined();
    expect(parseBudgetStroops("under")).toBeUndefined();
  });
});

// ── parseCategory ─────────────────────────────────────────────────────────────

describe("parseCategory", () => {
  it("extracts a known singular category", () => {
    expect(parseCategory("find me a laptop")).toBe("laptop");
  });

  it("normalises a plural category to singular", () => {
    expect(parseCategory("I want keyboards")).toBe("keyboard");
  });

  it("returns undefined for unknown categories", () => {
    expect(parseCategory("buy something cool")).toBeUndefined();
  });
});

// ── parseExcludedMerchants ────────────────────────────────────────────────────

describe("parseExcludedMerchants", () => {
  it("parses 'not from <Merchant>'", () => {
    expect(parseExcludedMerchants("not from Acme")).toContain("Acme");
  });

  it("parses 'exclude <Merchant>'", () => {
    expect(parseExcludedMerchants("exclude MegaStore")).toContain("MegaStore");
  });

  it("parses 'avoid <Merchant>'", () => {
    expect(parseExcludedMerchants("avoid ShopX")).toContain("ShopX");
  });

  it("returns an empty array when no exclusions are found", () => {
    expect(parseExcludedMerchants("find a laptop under $500")).toHaveLength(0);
  });
});

// ── parseCondition ────────────────────────────────────────────────────────────

describe("parseCondition", () => {
  it("detects 'new'", () => {
    expect(parseCondition("I want a new laptop")).toBe("new");
  });

  it("detects 'used'", () => {
    expect(parseCondition("looking for a used keyboard")).toBe("used");
  });

  it("detects 'refurbished' as used", () => {
    expect(parseCondition("refurbished phone")).toBe("used");
  });

  it("returns undefined when no condition is mentioned", () => {
    expect(parseCondition("find me a laptop")).toBeUndefined();
  });
});

// ── deriveContext ─────────────────────────────────────────────────────────────

function msg(role: ChatMessage["role"], content: string): ChatMessage {
  return { role, content };
}

describe("deriveContext", () => {
  it("returns EMPTY_CONTEXT defaults for an empty transcript", () => {
    const ctx = deriveContext([]);
    expect(ctx.excludedMerchants).toEqual([]);
    expect(ctx.preferredCondition).toBe("any");
    expect(ctx.turnsCount).toBe(0);
    expect(ctx.activeBudgetStroops).toBeUndefined();
    expect(ctx.targetCategory).toBeUndefined();
  });

  it("counts turns correctly (min of user and assistant messages)", () => {
    const messages = [
      msg("user", "hello"),
      msg("assistant", "hi"),
      msg("user", "find a keyboard"),
    ];
    const ctx = deriveContext(messages);
    expect(ctx.turnsCount).toBe(1);
  });

  it("extracts budget from user messages", () => {
    const ctx = deriveContext([msg("user", "find a laptop under $500")]);
    expect(ctx.activeBudgetStroops).toBe("5000000000");
  });

  it("ignores budget in assistant messages", () => {
    const ctx = deriveContext([msg("assistant", "I found items under $50")]);
    expect(ctx.activeBudgetStroops).toBeUndefined();
  });

  it("later budget overrides earlier budget", () => {
    const ctx = deriveContext([
      msg("user", "under $100"),
      msg("assistant", "ok"),
      msg("user", "actually under $50"),
    ]);
    expect(ctx.activeBudgetStroops).toBe("500000000");
  });

  it("accumulates excluded merchants across messages", () => {
    const ctx = deriveContext([
      msg("user", "avoid Acme"),
      msg("assistant", "noted"),
      msg("user", "and exclude MegaStore"),
    ]);
    expect(ctx.excludedMerchants).toContain("Acme");
    expect(ctx.excludedMerchants).toContain("MegaStore");
  });

  it("derives preferred condition", () => {
    const ctx = deriveContext([msg("user", "I want a new phone")]);
    expect(ctx.preferredCondition).toBe("new");
  });
});

// ── formatBudgetDisplay ───────────────────────────────────────────────────────

describe("formatBudgetDisplay", () => {
  it("formats a whole number", () => {
    expect(formatBudgetDisplay("500000000")).toBe("50 USDC");
  });

  it("formats with cents", () => {
    expect(formatBudgetDisplay("255000000")).toBe("25.50 USDC");
  });
});

// ── contextToChips ────────────────────────────────────────────────────────────

describe("contextToChips", () => {
  it("always includes a turns chip", () => {
    const chips = contextToChips({ ...EMPTY_CONTEXT, turnsCount: 3 });
    const turns = chips.find((c) => c.key === "turns");
    expect(turns?.value).toBe("3");
  });

  it("omits budget chip when activeBudgetStroops is absent", () => {
    const chips = contextToChips(EMPTY_CONTEXT);
    expect(chips.find((c) => c.key === "budget")).toBeUndefined();
  });

  it("includes budget chip when present", () => {
    const chips = contextToChips({
      ...EMPTY_CONTEXT,
      activeBudgetStroops: "500000000",
    });
    const budget = chips.find((c) => c.key === "budget");
    expect(budget?.value).toBe("50 USDC");
  });

  it("includes excluded merchant chips", () => {
    const chips = contextToChips({
      ...EMPTY_CONTEXT,
      excludedMerchants: ["Acme", "ShopX"],
    });
    const excluded = chips.filter((c) => c.key.startsWith("excluded-"));
    expect(excluded).toHaveLength(2);
    expect(excluded.map((c) => c.value)).toContain("Acme");
    expect(excluded.map((c) => c.value)).toContain("ShopX");
  });

  it("omits condition chip when preferredCondition is 'any'", () => {
    const chips = contextToChips(EMPTY_CONTEXT);
    expect(chips.find((c) => c.key === "condition")).toBeUndefined();
  });

  it("includes condition chip for 'new'", () => {
    const chips = contextToChips({
      ...EMPTY_CONTEXT,
      preferredCondition: "new",
    });
    const cond = chips.find((c) => c.key === "condition");
    expect(cond?.value).toBe("New only");
  });
});
