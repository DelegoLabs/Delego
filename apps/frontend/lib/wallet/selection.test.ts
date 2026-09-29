import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  loadSelectedWalletId,
  saveSelectedWalletId,
  WALLET_SELECTION_STORAGE_KEY,
} from "./selection";

describe("wallet selection", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns null when nothing has been stored", () => {
    expect(loadSelectedWalletId()).toBeNull();
  });

  it("round-trips the chosen wallet id", () => {
    saveSelectedWalletId("lobstr");

    expect(window.localStorage.getItem(WALLET_SELECTION_STORAGE_KEY)).toBe(
      "lobstr"
    );
    expect(loadSelectedWalletId()).toBe("lobstr");
  });

  it("treats a blank entry as no selection", () => {
    window.localStorage.setItem(WALLET_SELECTION_STORAGE_KEY, "   ");

    expect(loadSelectedWalletId()).toBeNull();
  });

  it("swallows storage failures instead of throwing", () => {
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });

    expect(() => saveSelectedWalletId("lobstr")).not.toThrow();
    expect(loadSelectedWalletId()).toBeNull();

    setItem.mockRestore();
  });
});
