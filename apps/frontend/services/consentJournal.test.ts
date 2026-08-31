/**
 * Unit tests for services/consentJournal.ts (#591)
 *
 * Tests cover:
 *  - appendConsentEntry: adds entries with timestamp
 *  - getConsentEntries: returns most-recent first
 *  - FIFO cap: capped at 200 entries
 *  - filterConsentEntries: search, outcome filter, screen filter
 *  - clearConsentJournal: empties storage
 *  - getConsentScreens: unique screen list
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  MAX_ENTRIES,
  appendConsentEntry,
  clearConsentJournal,
  filterConsentEntries,
  getConsentEntries,
  getConsentScreens,
} from "./consentJournal";

beforeEach(() => {
  clearConsentJournal();
});

afterEach(() => {
  clearConsentJournal();
});

// ─── appendConsentEntry ────────────────────────────────────────────────────

describe("appendConsentEntry", () => {
  it("stores an entry with a timestamp", () => {
    appendConsentEntry({
      summary: "Send 10 XLM",
      txHash: "abc123",
      sourceScreen: "approvals",
      outcome: "signed",
    });
    const entries = getConsentEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].summary).toBe("Send 10 XLM");
    expect(entries[0].timestamp).toBeTruthy();
  });

  it("records rejected outcomes", () => {
    appendConsentEntry({
      summary: "Approve delegation",
      txHash: null,
      sourceScreen: "delegations",
      outcome: "rejected",
    });
    expect(getConsentEntries()[0].outcome).toBe("rejected");
  });

  it("records error outcomes", () => {
    appendConsentEntry({
      summary: "Mint token",
      txHash: null,
      sourceScreen: "wallet",
      outcome: "error",
    });
    expect(getConsentEntries()[0].outcome).toBe("error");
  });
});

// ─── getConsentEntries ─────────────────────────────────────────────────────

describe("getConsentEntries", () => {
  it("returns entries most-recent first", () => {
    appendConsentEntry({
      summary: "First",
      txHash: null,
      sourceScreen: "s",
      outcome: "signed",
    });
    appendConsentEntry({
      summary: "Second",
      txHash: null,
      sourceScreen: "s",
      outcome: "signed",
    });
    const entries = getConsentEntries();
    expect(entries[0].summary).toBe("Second");
    expect(entries[1].summary).toBe("First");
  });
});

// ─── FIFO cap ─────────────────────────────────────────────────────────────

describe("FIFO cap", () => {
  it(`never stores more than ${MAX_ENTRIES} entries`, () => {
    for (let i = 0; i < MAX_ENTRIES + 10; i++) {
      appendConsentEntry({
        summary: `tx-${i}`,
        txHash: null,
        sourceScreen: "test",
        outcome: "signed",
      });
    }
    expect(getConsentEntries()).toHaveLength(MAX_ENTRIES);
  });

  it("preserves the most-recent entries when pruning", () => {
    for (let i = 0; i < MAX_ENTRIES + 5; i++) {
      appendConsentEntry({
        summary: `tx-${i}`,
        txHash: null,
        sourceScreen: "test",
        outcome: "signed",
      });
    }
    // getConsentEntries returns newest first; the newest is tx-(MAX_ENTRIES+4)
    const entries = getConsentEntries();
    expect(entries[0].summary).toBe(`tx-${MAX_ENTRIES + 4}`);
  });
});

// ─── filterConsentEntries ──────────────────────────────────────────────────

describe("filterConsentEntries", () => {
  beforeEach(() => {
    appendConsentEntry({
      summary: "Send XLM to Alice",
      txHash: "hash001",
      sourceScreen: "approvals",
      outcome: "signed",
    });
    appendConsentEntry({
      summary: "Approve delegation",
      txHash: null,
      sourceScreen: "delegations",
      outcome: "rejected",
    });
    appendConsentEntry({
      summary: "Failed swap",
      txHash: "hash002",
      sourceScreen: "approvals",
      outcome: "error",
    });
  });

  it("returns all entries when no filters applied", () => {
    expect(filterConsentEntries()).toHaveLength(3);
  });

  it("filters by query matching summary", () => {
    const results = filterConsentEntries("Alice");
    expect(results).toHaveLength(1);
    expect(results[0].summary).toContain("Alice");
  });

  it("filters by query matching txHash", () => {
    const results = filterConsentEntries("hash001");
    expect(results).toHaveLength(1);
  });

  it("filters by outcome", () => {
    expect(filterConsentEntries(undefined, "rejected")).toHaveLength(1);
    expect(filterConsentEntries(undefined, "signed")).toHaveLength(1);
    expect(filterConsentEntries(undefined, "error")).toHaveLength(1);
  });

  it("filters by source screen", () => {
    const results = filterConsentEntries(undefined, undefined, "approvals");
    expect(results).toHaveLength(2);
  });

  it("combines query and outcome filters", () => {
    const results = filterConsentEntries("swap", "error");
    expect(results).toHaveLength(1);
    expect(results[0].summary).toContain("swap");
  });
});

// ─── clearConsentJournal ───────────────────────────────────────────────────

describe("clearConsentJournal", () => {
  it("removes all entries", () => {
    appendConsentEntry({
      summary: "X",
      txHash: null,
      sourceScreen: "s",
      outcome: "signed",
    });
    clearConsentJournal();
    expect(getConsentEntries()).toHaveLength(0);
  });
});

// ─── getConsentScreens ─────────────────────────────────────────────────────

describe("getConsentScreens", () => {
  it("returns unique source screens sorted alphabetically", () => {
    appendConsentEntry({
      summary: "A",
      txHash: null,
      sourceScreen: "wallet",
      outcome: "signed",
    });
    appendConsentEntry({
      summary: "B",
      txHash: null,
      sourceScreen: "approvals",
      outcome: "signed",
    });
    appendConsentEntry({
      summary: "C",
      txHash: null,
      sourceScreen: "wallet",
      outcome: "signed",
    });
    const screens = getConsentScreens();
    expect(screens).toEqual(["approvals", "wallet"]);
  });
});
