import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useWalletAdapters } from "./useWalletAdapters";

const { detectFreighter, detectLobstr } = vi.hoisted(() => ({
  detectFreighter: vi.fn(),
  detectLobstr: vi.fn(),
}));

vi.mock("../lib/wallet", () => ({
  walletAdapters: [
    {
      id: "freighter",
      name: "Freighter",
      installUrl: "https://www.freighter.app/",
      detect: detectFreighter,
    },
    {
      id: "lobstr",
      name: "LOBSTR",
      installUrl: "https://lobstr.co/signer-extension",
      detect: detectLobstr,
    },
  ],
}));

describe("useWalletAdapters", () => {
  beforeEach(() => {
    detectFreighter.mockReset();
    detectLobstr.mockReset();
  });

  it("lists every registered wallet while detection is running", () => {
    detectFreighter.mockReturnValue(new Promise<boolean>(() => {}));
    detectLobstr.mockReturnValue(new Promise<boolean>(() => {}));

    const { result } = renderHook(() => useWalletAdapters());

    expect(result.current.checking).toBe(true);
    expect(result.current.wallets.map((wallet) => wallet.id)).toEqual([
      "freighter",
      "lobstr",
    ]);
    expect(result.current.wallets.every((wallet) => wallet.installed === null)).toBe(
      true
    );
  });

  it("reports which extensions are installed", async () => {
    detectFreighter.mockResolvedValue(true);
    detectLobstr.mockResolvedValue(false);

    const { result } = renderHook(() => useWalletAdapters());

    await waitFor(() => expect(result.current.checking).toBe(false));
    expect(result.current.wallets).toEqual([
      {
        id: "freighter",
        name: "Freighter",
        installUrl: "https://www.freighter.app/",
        installed: true,
      },
      {
        id: "lobstr",
        name: "LOBSTR",
        installUrl: "https://lobstr.co/signer-extension",
        installed: false,
      },
    ]);
  });

  it("treats a failed probe as a missing extension", async () => {
    detectFreighter.mockRejectedValue(new Error("probe failed"));
    detectLobstr.mockRejectedValue(new Error("probe failed"));

    const { result } = renderHook(() => useWalletAdapters());

    await waitFor(() => expect(result.current.checking).toBe(false));
    expect(result.current.wallets.every((wallet) => wallet.installed === false)).toBe(
      true
    );
  });
});
