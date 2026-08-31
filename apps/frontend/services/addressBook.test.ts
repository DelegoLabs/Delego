/**
 * Unit tests for services/addressBook.ts (#587)
 *
 * Tests cover:
 *  - levenshteinDistance: exact match, single substitution, insertions, deletions
 *  - findNearMisses: single-char substitution triggers warning; exact match does not
 *  - Network isolation: mainnet and testnet contacts never mix
 *  - CRUD: add, update, delete, search
 *  - importAddressBook: skip duplicates, invalid JSON
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  NEAR_MISS_MAX_DISTANCE,
  addAddressEntry,
  deleteAddressEntry,
  findNearMisses,
  getAddressBook,
  importAddressBook,
  levenshteinDistance,
  searchAddressBook,
  updateAddressEntry,
} from "./addressBook";

// Clear localStorage between each test to ensure isolation.
beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  localStorage.clear();
});

// ─── levenshteinDistance ──────────────────────────────────────────────────

describe("levenshteinDistance", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshteinDistance("abc", "abc")).toBe(0);
  });

  it("returns the length of the second string when first is empty", () => {
    expect(levenshteinDistance("", "abc")).toBe(3);
  });

  it("returns the length of the first string when second is empty", () => {
    expect(levenshteinDistance("abc", "")).toBe(3);
  });

  it("handles single character substitution", () => {
    // 'a' → 'b': one substitution
    expect(levenshteinDistance("abc", "aXc")).toBe(1);
  });

  it("handles single insertion", () => {
    expect(levenshteinDistance("ab", "abc")).toBe(1);
  });

  it("handles single deletion", () => {
    expect(levenshteinDistance("abc", "ab")).toBe(1);
  });

  it("computes distance between two Stellar-style addresses", () => {
    const addr = "GBWZMEOONFNMWUYXNRNIQF6MBSNE3YZUSIVVCIMF";
    // Flip the last character.
    const modified = addr.slice(0, -1) + (addr.endsWith("F") ? "E" : "F");
    expect(levenshteinDistance(addr, modified)).toBe(1);
  });
});

// ─── findNearMisses ────────────────────────────────────────────────────────

describe("findNearMisses", () => {
  const REAL_ADDR = "GBWZMEOONFNMWUYXNRNIQF6MBSNE3YZUSIVVCIMFABC";
  const ONE_OFF_ADDR = "GBWZMEOONFNMWUYXNRNIQF6MBSNE3YZUSIVVCIMFABX"; // last char changed
  const EXACT_ADDR = REAL_ADDR; // identical — should NOT trigger a warning

  beforeEach(() => {
    addAddressEntry("testnet", {
      label: "Alice",
      address: REAL_ADDR,
      notes: "",
      verified: false,
    });
  });

  it("returns a near-miss for a single-character substitution", () => {
    const misses = findNearMisses(ONE_OFF_ADDR, "testnet");
    expect(misses).toHaveLength(1);
    expect(misses[0].distance).toBe(1);
    expect(misses[0].entry.label).toBe("Alice");
  });

  it("does NOT trigger a warning for an exact match (distance 0)", () => {
    const misses = findNearMisses(EXACT_ADDR, "testnet");
    expect(misses).toHaveLength(0);
  });

  it("does NOT trigger a warning when distance exceeds NEAR_MISS_MAX_DISTANCE", () => {
    // Completely different address.
    const farAddr = "GCXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
    const misses = findNearMisses(farAddr, "testnet");
    expect(misses.every((m) => m.distance <= NEAR_MISS_MAX_DISTANCE)).toBe(
      true
    );
    // This address is very different — should have 0 or no relevant near misses.
    const tooFar = misses.filter((m) => m.distance > NEAR_MISS_MAX_DISTANCE);
    expect(tooFar).toHaveLength(0);
  });

  it("only checks contacts for the specified network", () => {
    // No mainnet contacts saved — near-miss against testnet entry should not fire.
    const misses = findNearMisses(ONE_OFF_ADDR, "mainnet");
    expect(misses).toHaveLength(0);
  });
});

// ─── Network isolation ─────────────────────────────────────────────────────

describe("network isolation", () => {
  it("testnet and mainnet contacts are stored independently", () => {
    addAddressEntry("testnet", {
      label: "Testnet Alice",
      address: "GTEST001",
      notes: "",
      verified: false,
    });
    addAddressEntry("mainnet", {
      label: "Mainnet Alice",
      address: "GMAIN001",
      notes: "",
      verified: false,
    });

    const testnetEntries = getAddressBook("testnet");
    const mainnetEntries = getAddressBook("mainnet");

    expect(testnetEntries).toHaveLength(1);
    expect(testnetEntries[0].label).toBe("Testnet Alice");

    expect(mainnetEntries).toHaveLength(1);
    expect(mainnetEntries[0].label).toBe("Mainnet Alice");
  });

  it("deleting a mainnet contact does not affect testnet", () => {
    const e1 = addAddressEntry("testnet", {
      label: "T",
      address: "GT1",
      notes: "",
      verified: false,
    });
    const e2 = addAddressEntry("mainnet", {
      label: "M",
      address: "GM1",
      notes: "",
      verified: false,
    });

    deleteAddressEntry("mainnet", e2.id);

    expect(getAddressBook("testnet")).toHaveLength(1);
    expect(getAddressBook("mainnet")).toHaveLength(0);
    // Silence unused variable warning.
    void e1;
  });
});

// ─── CRUD ─────────────────────────────────────────────────────────────────

describe("CRUD operations", () => {
  it("addAddressEntry creates an entry with generated id", () => {
    const entry = addAddressEntry("testnet", {
      label: "Bob",
      address: "GBOB123",
      notes: "Test",
      verified: true,
    });
    expect(entry.id).toBeTruthy();
    expect(entry.label).toBe("Bob");
    expect(entry.network).toBe("testnet");
  });

  it("updateAddressEntry patches an entry", () => {
    const entry = addAddressEntry("testnet", {
      label: "Old",
      address: "GOLD",
      notes: "",
      verified: false,
    });
    const updated = updateAddressEntry("testnet", entry.id, { label: "New" });
    expect(updated?.label).toBe("New");
    expect(updated?.address).toBe("GOLD"); // unchanged
  });

  it("deleteAddressEntry removes the entry", () => {
    const entry = addAddressEntry("testnet", {
      label: "Temp",
      address: "GTEMP",
      notes: "",
      verified: false,
    });
    const result = deleteAddressEntry("testnet", entry.id);
    expect(result).toBe(true);
    expect(getAddressBook("testnet")).toHaveLength(0);
  });

  it("searchAddressBook matches by label", () => {
    addAddressEntry("testnet", {
      label: "Alice",
      address: "GALICE",
      notes: "",
      verified: false,
    });
    addAddressEntry("testnet", {
      label: "Bob",
      address: "GBOB",
      notes: "",
      verified: false,
    });
    expect(searchAddressBook("testnet", "ali")).toHaveLength(1);
  });
});

// ─── importAddressBook ─────────────────────────────────────────────────────

describe("importAddressBook", () => {
  it("imports contacts from a JSON string", () => {
    const data = JSON.stringify([
      { label: "Carol", address: "GCAROL", notes: "", verified: false },
    ]);
    const count = importAddressBook("testnet", data);
    expect(count).toBe(1);
    expect(getAddressBook("testnet")).toHaveLength(1);
  });

  it("skips contacts with duplicate addresses", () => {
    addAddressEntry("testnet", {
      label: "Existing",
      address: "GDUP",
      notes: "",
      verified: false,
    });
    const data = JSON.stringify([
      { label: "New Label", address: "GDUP", notes: "", verified: false },
    ]);
    const count = importAddressBook("testnet", data);
    expect(count).toBe(0);
    expect(getAddressBook("testnet")).toHaveLength(1);
  });

  it("throws on invalid JSON", () => {
    expect(() => importAddressBook("testnet", "not-json")).toThrow(
      "Invalid JSON"
    );
  });
});
