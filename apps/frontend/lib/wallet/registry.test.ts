import { describe, it, expect } from "vitest";
import {
  DEFAULT_WALLET_ID,
  getWalletAdapter,
  walletAdapters,
} from "./registry";

describe("wallet registry", () => {
  it("registers Freighter first and LOBSTR second", () => {
    expect(walletAdapters.map((adapter) => adapter.id)).toEqual([
      "freighter",
      "lobstr",
    ]);
  });

  it("resolves an adapter by id", () => {
    expect(getWalletAdapter("lobstr").name).toBe("LOBSTR");
    expect(getWalletAdapter("lobstr").installUrl).toBe(
      "https://lobstr.co/signer-extension"
    );
  });

  it("falls back to the default wallet for unknown or missing ids", () => {
    const fallback = getWalletAdapter();

    expect(fallback.id).toBe(DEFAULT_WALLET_ID);
    expect(getWalletAdapter("not-a-wallet").id).toBe(DEFAULT_WALLET_ID);
    expect(getWalletAdapter(null).id).toBe(DEFAULT_WALLET_ID);
  });

  it("exposes the install page every adapter needs for the picker", () => {
    for (const adapter of walletAdapters) {
      expect(adapter.installUrl).toMatch(/^https:\/\//);
      expect(adapter.name.length).toBeGreaterThan(0);
    }
  });
});
