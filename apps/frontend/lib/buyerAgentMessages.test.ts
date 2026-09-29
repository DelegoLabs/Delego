import { describe, expect, it } from "vitest";

import {
  completedAgentMessageIds,
  isAgentMessage,
  isCompletedAgentMessage,
  selectCompletedAgentMessages,
  type BuyerAgentMessage,
} from "./buyerAgentMessages";

function message(
  overrides: Partial<BuyerAgentMessage> = {}
): BuyerAgentMessage {
  return {
    id: "m1",
    author: "agent",
    body: "Found a cheaper listing.",
    sentAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("buyerAgentMessages — isAgentMessage", () => {
  it("is true only for agent-authored messages", () => {
    expect(isAgentMessage(message({ author: "agent" }))).toBe(true);
    expect(isAgentMessage(message({ author: "user" }))).toBe(false);
  });
});

describe("buyerAgentMessages — isCompletedAgentMessage", () => {
  it("is true for a finished agent message", () => {
    expect(isCompletedAgentMessage(message())).toBe(true);
    expect(isCompletedAgentMessage(message({ pending: false }))).toBe(true);
  });

  it("is false while the agent is still generating", () => {
    expect(isCompletedAgentMessage(message({ pending: true }))).toBe(false);
  });

  it("is false for the user's own messages", () => {
    expect(isCompletedAgentMessage(message({ author: "user" }))).toBe(false);
  });
});

describe("buyerAgentMessages — selectCompletedAgentMessages", () => {
  it("keeps only finished agent messages, preserving order", () => {
    const transcript: BuyerAgentMessage[] = [
      message({ id: "u1", author: "user" }),
      message({ id: "a1" }),
      message({ id: "a2", pending: true }),
      message({ id: "a3", pending: false }),
    ];

    expect(selectCompletedAgentMessages(transcript).map((m) => m.id)).toEqual([
      "a1",
      "a3",
    ]);
  });

  it("returns an empty list for an empty transcript", () => {
    expect(selectCompletedAgentMessages([])).toEqual([]);
  });

  it("treats a card-only agent message as a completed message", () => {
    const card = message({
      id: "a-card",
      body: "",
      proposalCard: { title: "Headphones", total: "US$42.00", currency: "USD" },
    });

    expect(selectCompletedAgentMessages([card]).map((m) => m.id)).toEqual([
      "a-card",
    ]);
  });
});

describe("buyerAgentMessages — completedAgentMessageIds", () => {
  it("projects the ids of finished agent messages", () => {
    const transcript: BuyerAgentMessage[] = [
      message({ id: "u1", author: "user" }),
      message({ id: "a1" }),
      message({ id: "a2", pending: true }),
      message({ id: "a3" }),
    ];

    expect(completedAgentMessageIds(transcript)).toEqual(["a1", "a3"]);
  });

  it("returns an empty list when nothing has finished generating", () => {
    expect(completedAgentMessageIds([message({ pending: true })])).toEqual([]);
  });
});
