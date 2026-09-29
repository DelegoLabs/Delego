import { describe, it, expect, beforeEach } from "vitest";
import {
  WALLET_REGISTRY,
  detectInstalledWallets,
  getPersistedWalletId,
  setPersistedWalletId,
  clearPersistedWalletId,
} from "./wallets";

describe("wallets registry (#774)", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("registers the supported wallets", () => {
    const ids = WALLET_REGISTRY.map((w) => w.id).sort();
    expect(ids).toEqual([
      "albedo",
      "freighter",
      "lobstr",
      "walletconnect",
      "xbull",
    ]);
  });

  it("reports nothing installed when no extensions are present", () => {
    for (const option of detectInstalledWallets()) {
      expect(option.isInstalled).toBe(false);
      expect(typeof option.connect).toBe("function");
    }
  });

  it("detects an injected Freighter host object", () => {
    (window as unknown as Record<string, unknown>).freighterApi = {};
    try {
      expect(
        detectInstalledWallets().find((o) => o.id === "freighter")?.isInstalled
      ).toBe(true);
      expect(
        detectInstalledWallets().find((o) => o.id === "albedo")?.isInstalled
      ).toBe(false);
    } finally {
      delete (window as unknown as Record<string, unknown>).freighterApi;
    }
  });

  it("persists, reads back, and clears the wallet choice", () => {
    expect(getPersistedWalletId()).toBeNull();
    setPersistedWalletId("xbull");
    expect(getPersistedWalletId()).toBe("xbull");
    clearPersistedWalletId();
    expect(getPersistedWalletId()).toBeNull();
  });

  it("rejects persisted values outside the registry", () => {
    window.sessionStorage.setItem("delego.activeWallet", "not-a-wallet");
    expect(getPersistedWalletId()).toBeNull();
  });

  it("default connect() rejects instead of resolving a wrong address", async () => {
    const [first] = detectInstalledWallets();
    await expect(first!.connect()).rejects.toThrow(/not connected yet/);
  });
});
