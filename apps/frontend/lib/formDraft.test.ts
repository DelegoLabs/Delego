import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  DRAFT_TTL_MS,
  clearFormDraft,
  draftStorageKey,
  readFormDraft,
  saveFormDraft,
} from "./formDraft";

describe("draftStorageKey", () => {
  it("drops query strings and hashes so a route shares one draft", () => {
    expect(draftStorageKey("/delegations/new?step=2")).toBe(
      draftStorageKey("/delegations/new")
    );
    expect(draftStorageKey("/delegations/new#foo")).toBe(
      draftStorageKey("/delegations/new")
    );
  });

  it("trims a trailing slash", () => {
    expect(draftStorageKey("/settings/")).toBe(draftStorageKey("/settings"));
  });

  it("namespaces the key", () => {
    expect(draftStorageKey("/x")).toBe("delego:form-draft:/x");
  });
});

describe("form drafts", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("round-trips a draft for a route", () => {
    saveFormDraft("/delegations/new", { agentId: "agent-1", steps: [1, 2] });
    expect(readFormDraft("/delegations/new")).toEqual({
      agentId: "agent-1",
      steps: [1, 2],
    });
  });

  it("returns null when there is no draft", () => {
    expect(readFormDraft("/nothing-here")).toBeNull();
  });

  it("clears a draft", () => {
    saveFormDraft("/x", { a: 1 });
    clearFormDraft("/x");
    expect(readFormDraft("/x")).toBeNull();
  });

  it("ignores and clears a draft older than the TTL", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    saveFormDraft("/x", { a: 1 });
    vi.setSystemTime(new Date(Date.now() + DRAFT_TTL_MS + 1_000));
    expect(readFormDraft("/x")).toBeNull();
    expect(window.localStorage.getItem(draftStorageKey("/x"))).toBeNull();
    vi.useRealTimers();
  });

  it("discards a corrupt entry without throwing", () => {
    window.localStorage.setItem(draftStorageKey("/x"), "{not json");
    expect(() => readFormDraft("/x")).not.toThrow();
    expect(readFormDraft("/x")).toBeNull();
  });

  it("never throws when localStorage.setItem fails", () => {
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("quota exceeded");
      });
    expect(() => saveFormDraft("/x", { a: 1 })).not.toThrow();
    spy.mockRestore();
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
