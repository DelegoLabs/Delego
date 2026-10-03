import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useWallet, __resetWalletStoreForTests } from "./useWallet";
import {
  enableDemoMode,
  DEMO_WALLET_ADDRESS,
  DEMO_NETWORK,
} from "../lib/demoMode";
import { WALLET_CANCELLED_MESSAGE } from "../services/wallet";

const {
  mockIsConnected,
  mockIsAllowed,
  mockGetAddress,
  mockGetNetwork,
  mockRequestAccess,
  mockOnAccountChange,
  mockOnNetworkChange,
  mockWatchWalletChanges,
} = vi.hoisted(() => ({
  mockIsConnected: vi.fn(),
  mockIsAllowed: vi.fn(),
  mockGetAddress: vi.fn(),
  mockGetNetwork: vi.fn(),
  mockRequestAccess: vi.fn(),
  mockOnAccountChange: vi.fn(),
  mockOnNetworkChange: vi.fn(),
  mockWatchWalletChanges: vi.fn(),
}));

vi.mock("@stellar/freighter-api", () => ({
  isConnected: mockIsConnected,
  isAllowed: mockIsAllowed,
  getAddress: mockGetAddress,
  getNetwork: mockGetNetwork,
  requestAccess: mockRequestAccess,
  onAccountChange: mockOnAccountChange,
  onNetworkChange: mockOnNetworkChange,
  WatchWalletChanges: mockWatchWalletChanges,
  default: {},
}));

describe("useWallet", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // useWallet is backed by a store shared by every call site in the app, so
    // each case starts from a clean connection and re-runs the Freighter probe.
    __resetWalletStoreForTests();
    mockIsConnected.mockReset();
    mockIsAllowed.mockReset();
    mockGetAddress.mockReset();
    mockGetNetwork.mockReset();
    mockRequestAccess.mockReset();
    mockOnAccountChange.mockReset();
    mockOnNetworkChange.mockReset();
  });

  it("reports unavailable when the extension is not installed", async () => {
    mockIsConnected.mockResolvedValue({ isConnected: false });

    const { result } = renderHook(() => useWallet());

    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current.isConnected).toBe(false);
    expect(result.current.address).toBeNull();
  });

  it("reports unavailable when isConnected errors", async () => {
    mockIsConnected.mockResolvedValue({
      isConnected: false,
      error: { message: "extension error" },
    });

    const { result } = renderHook(() => useWallet());

    await waitFor(() => expect(result.current.status).toBe("unavailable"));
  });

  it("reports disconnected when the extension is present but not allowed", async () => {
    mockIsConnected.mockResolvedValue({ isConnected: true });
    mockIsAllowed.mockResolvedValue({ isAllowed: false });

    const { result } = renderHook(() => useWallet());

    await waitFor(() => expect(result.current.status).toBe("disconnected"));
    expect(result.current.address).toBeNull();
  });

  it("reports error when the address cannot be read", async () => {
    mockIsConnected.mockResolvedValue({ isConnected: true });
    mockIsAllowed.mockResolvedValue({ isAllowed: true });
    mockGetAddress.mockResolvedValue({
      address: null,
      error: { message: "no address" },
    });

    const { result } = renderHook(() => useWallet());

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBe("no address");
  });

  it("connects successfully and reports network details", async () => {
    mockIsConnected.mockResolvedValue({ isConnected: true });
    mockIsAllowed.mockResolvedValue({ isAllowed: true });
    mockGetAddress.mockResolvedValue({ address: "GABC123" });
    mockGetNetwork.mockResolvedValue({
      network: "TESTNET",
      networkPassphrase: "Test SDF Network ; September 2015",
    });

    const { result } = renderHook(() => useWallet());

    await waitFor(() => expect(result.current.status).toBe("connected"));
    expect(result.current.address).toBe("GABC123");
    expect(result.current.network).toBe("TESTNET");
    expect(result.current.isConnected).toBe(true);
  });

  it("falls back to null network fields when getNetwork errors", async () => {
    mockIsConnected.mockResolvedValue({ isConnected: true });
    mockIsAllowed.mockResolvedValue({ isAllowed: true });
    mockGetAddress.mockResolvedValue({ address: "GABC123" });
    mockGetNetwork.mockResolvedValue({ error: { message: "network error" } });

    const { result } = renderHook(() => useWallet());

    await waitFor(() => expect(result.current.status).toBe("connected"));
    expect(result.current.network).toBeNull();
    expect(result.current.networkPassphrase).toBeNull();
  });

  it("marks the wallet unavailable when the module import throws", async () => {
    mockIsConnected.mockRejectedValue(new Error("import failed"));

    const { result } = renderHook(() => useWallet());

    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current.error).toBe("import failed");
  });

  describe("connect", () => {
    it("requests access and transitions to connected", async () => {
      mockIsConnected.mockResolvedValue({ isConnected: false });
      const { result } = renderHook(() => useWallet());
      await waitFor(() => expect(result.current.status).toBe("unavailable"));

      mockRequestAccess.mockResolvedValue({ address: "GXYZ789" });
      mockGetNetwork.mockResolvedValue({
        network: "PUBLIC",
        networkPassphrase: "Public Global Stellar Network ; September 2015",
      });

      await act(async () => {
        await result.current.connect();
      });

      expect(result.current.status).toBe("connected");
      expect(result.current.address).toBe("GXYZ789");
    });

    it("treats a user decline as a cancellation, not an error (#743)", async () => {
      mockIsConnected.mockResolvedValue({ isConnected: false });
      const { result } = renderHook(() => useWallet());
      await waitFor(() => expect(result.current.status).toBe("unavailable"));

      mockRequestAccess.mockResolvedValue({
        address: null,
        error: { code: -4, message: "User declined to sign the transaction" },
      });

      await act(async () => {
        await result.current.connect();
      });

      expect(result.current.status).toBe("disconnected");
      expect(result.current.error).toBeNull();
      expect(result.current.toast).toBe(WALLET_CANCELLED_MESSAGE);
    });

    it("still reports a real error when access fails for a non-decline reason", async () => {
      mockIsConnected.mockResolvedValue({ isConnected: false });
      const { result } = renderHook(() => useWallet());
      await waitFor(() => expect(result.current.status).toBe("unavailable"));

      mockRequestAccess.mockResolvedValue({
        address: null,
        error: { message: "Wallet is locked. Unlock the extension and retry." },
      });

      await act(async () => {
        await result.current.connect();
      });

      expect(result.current.status).toBe("error");
      expect(result.current.error).toBe(
        "Wallet is locked. Unlock the extension and retry."
      );
      expect(result.current.toast).toBeNull();
    });

    it("marks unavailable when requestAccess throws", async () => {
      mockIsConnected.mockResolvedValue({ isConnected: false });
      const { result } = renderHook(() => useWallet());
      await waitFor(() => expect(result.current.status).toBe("unavailable"));

      mockRequestAccess.mockRejectedValue(new Error("no extension"));

      await act(async () => {
        await result.current.connect();
      });

      expect(result.current.status).toBe("unavailable");
      expect(result.current.error).toBe("no extension");
    });
  });

  describe("disconnect", () => {
    it("resets state to disconnected", async () => {
      mockIsConnected.mockResolvedValue({ isConnected: true });
      mockIsAllowed.mockResolvedValue({ isAllowed: true });
      mockGetAddress.mockResolvedValue({ address: "GABC123" });
      mockGetNetwork.mockResolvedValue({
        network: "TESTNET",
        networkPassphrase: "Test SDF Network ; September 2015",
      });

      const { result } = renderHook(() => useWallet());
      await waitFor(() => expect(result.current.status).toBe("connected"));

      act(() => {
        result.current.disconnect();
      });

      expect(result.current.status).toBe("disconnected");
      expect(result.current.address).toBeNull();
      expect(result.current.isConnected).toBe(false);
    });
  });

  describe("refresh", () => {
    it("re-runs the connection check on demand", async () => {
      mockIsConnected.mockResolvedValue({ isConnected: false });
      const { result } = renderHook(() => useWallet());
      await waitFor(() => expect(result.current.status).toBe("unavailable"));

      mockIsConnected.mockResolvedValue({ isConnected: true });
      mockIsAllowed.mockResolvedValue({ isAllowed: true });
      mockGetAddress.mockResolvedValue({ address: "GNEW111" });
      mockGetNetwork.mockResolvedValue({
        network: "TESTNET",
        networkPassphrase: "Test SDF Network ; September 2015",
      });

      await act(async () => {
        await result.current.refresh();
      });

      expect(result.current.status).toBe("connected");
      expect(result.current.address).toBe("GNEW111");
    });
  });

  describe("event listeners and account switching", () => {
    it("registers onAccountChange and onNetworkChange once, and keeps them after one instance unmounts", async () => {
      const unsubAccount = vi.fn();
      const unsubNetwork = vi.fn();
      mockOnAccountChange.mockReturnValue(unsubAccount);
      mockOnNetworkChange.mockReturnValue(unsubNetwork);

      mockIsConnected.mockResolvedValue({ isConnected: true });
      mockIsAllowed.mockResolvedValue({ isAllowed: true });
      mockGetAddress.mockResolvedValue({ address: "GABC1234567890XYZ" });
      mockGetNetwork.mockResolvedValue({
        network: "TESTNET",
        networkPassphrase: "Test SDF Network ; September 2015",
      });

      const { unmount } = renderHook(() => useWallet());

      await waitFor(() => expect(mockOnAccountChange).toHaveBeenCalled());
      expect(mockOnNetworkChange).toHaveBeenCalled();

      // A second consumer must not re-probe or register duplicate watchers —
      // the store is shared, so the probe is bootstrapped once for the app.
      const second = renderHook(() => useWallet());
      expect(mockOnAccountChange).toHaveBeenCalledTimes(1);
      expect(mockOnNetworkChange).toHaveBeenCalledTimes(1);

      unmount();

      // The watchers deliberately outlive any single hook instance: tearing
      // them down here would stop wallet-change updates for every consumer
      // that is still mounted, which is the bug this store exists to fix.
      expect(unsubAccount).not.toHaveBeenCalled();
      expect(unsubNetwork).not.toHaveBeenCalled();

      second.unmount();
    });

    it("updates wallet address and surfaces subtle toast when account changes mid-session", async () => {
      let accountCallback: ((newAddr: string) => void) | undefined;
      mockOnAccountChange.mockImplementation(
        (cb: (newAddr: string) => void) => {
          accountCallback = cb;
          return () => {};
        }
      );

      mockIsConnected.mockResolvedValue({ isConnected: true });
      mockIsAllowed.mockResolvedValue({ isAllowed: true });
      mockGetAddress.mockResolvedValue({ address: "GABC1234567890XYZ" });
      mockGetNetwork.mockResolvedValue({
        network: "TESTNET",
        networkPassphrase: "Test SDF Network ; September 2015",
      });

      const { result } = renderHook(() => useWallet());
      await waitFor(() => expect(result.current.status).toBe("connected"));
      await waitFor(() => expect(mockOnAccountChange).toHaveBeenCalled());
      expect(result.current.address).toBe("GABC1234567890XYZ");
      expect(result.current.toast).toBeNull();

      // User switches account in Freighter extension mid-session
      mockGetAddress.mockResolvedValue({ address: "GXYZ9876543210ABC" });

      await act(async () => {
        if (accountCallback) {
          accountCallback("GXYZ9876543210ABC");
        }
      });

      await waitFor(() =>
        expect(result.current.address).toBe("GXYZ9876543210ABC")
      );
      expect(result.current.toast).toBe("Switched to GXYZ…0ABC");
    });

    it("updates network details when network changes mid-session", async () => {
      let networkCallback: ((newNet: string) => void) | undefined;
      mockOnNetworkChange.mockImplementation(
        (cb: (newNet: string) => void) => {
          networkCallback = cb;
          return () => {};
        }
      );

      mockIsConnected.mockResolvedValue({ isConnected: true });
      mockIsAllowed.mockResolvedValue({ isAllowed: true });
      mockGetAddress.mockResolvedValue({ address: "GABC1234567890XYZ" });
      mockGetNetwork.mockResolvedValue({
        network: "TESTNET",
        networkPassphrase: "Test SDF Network ; September 2015",
      });

      const { result } = renderHook(() => useWallet());
      await waitFor(() => expect(result.current.status).toBe("connected"));
      await waitFor(() => expect(mockOnNetworkChange).toHaveBeenCalled());
      expect(result.current.network).toBe("TESTNET");

      // Network changes in Freighter
      mockGetNetwork.mockResolvedValue({
        network: "PUBLIC",
        networkPassphrase: "Public Global SDF Network",
      });

      await act(async () => {
        if (networkCallback) {
          networkCallback("PUBLIC");
        }
      });

      await waitFor(() => expect(result.current.network).toBe("PUBLIC"));
    });
  });

  describe("demo mode (#632)", () => {
    afterEach(() => {
      window.sessionStorage.clear();
    });

    it("reports a synthetic connected wallet without touching Freighter", async () => {
      enableDemoMode();
      const { result } = renderHook(() => useWallet());

      await waitFor(() => expect(result.current.status).toBe("connected"));
      expect(result.current.address).toBe(DEMO_WALLET_ADDRESS);
      expect(result.current.network).toBe(DEMO_NETWORK);
      expect(result.current.isConnected).toBe(true);
      expect(mockIsConnected).not.toHaveBeenCalled();
    });

    it("connect() returns the synthetic wallet without calling Freighter", async () => {
      enableDemoMode();
      const { result } = renderHook(() => useWallet());
      await waitFor(() => expect(result.current.status).toBe("connected"));

      await act(async () => {
        await result.current.connect();
      });

      expect(result.current.address).toBe(DEMO_WALLET_ADDRESS);
      expect(mockRequestAccess).not.toHaveBeenCalled();
    });

    it("refresh() re-reports the synthetic wallet in demo mode", async () => {
      enableDemoMode();
      const { result } = renderHook(() => useWallet());
      await waitFor(() => expect(result.current.status).toBe("connected"));

      await act(async () => {
        await result.current.refresh();
      });

      expect(result.current.address).toBe(DEMO_WALLET_ADDRESS);
      expect(mockIsConnected).not.toHaveBeenCalled();
    });
  });

  describe("multi-wallet selection (#774)", () => {
    beforeEach(() => {
      window.sessionStorage.clear();
    });

    it("defaults to Freighter and exposes all registered options", async () => {
      mockIsConnected.mockResolvedValue({ isConnected: false });
      const { result } = renderHook(() => useWallet());

      await waitFor(() => expect(result.current.status).toBe("unavailable"));
      expect(result.current.walletId).toBe("freighter");
      expect(result.current.walletOptions.map((o) => o.id).sort()).toEqual([
        "albedo",
        "freighter",
        "lobstr",
        "walletconnect",
        "xbull",
      ]);
    });

    it("persists the selected wallet across hook mounts", async () => {
      mockIsConnected.mockResolvedValue({ isConnected: false });
      const first = renderHook(() => useWallet());
      await waitFor(() => expect(first.result.current.status).toBe("unavailable"));

      act(() => {
        first.result.current.selectWallet("xbull");
      });
      expect(first.result.current.walletId).toBe("xbull");
      expect(window.sessionStorage.getItem("delego.activeWallet")).toBe("xbull");
      first.unmount();

      const second = renderHook(() => useWallet());
      expect(second.result.current.walletId).toBe("xbull");
      second.unmount();
    });

    it("surfaces a precise unavailable status for non-extension wallets", async () => {
      mockIsConnected.mockResolvedValue({ isConnected: false });
      const { result } = renderHook(() => useWallet());
      await waitFor(() => expect(result.current.status).toBe("unavailable"));

      await act(async () => {
        await result.current.connect("albedo");
      });

      expect(result.current.walletId).toBe("albedo");
      expect(result.current.status).toBe("unavailable");
      expect(result.current.error).toMatch(/Albedo/);
      expect(mockRequestAccess).not.toHaveBeenCalled();
    });

    it("clears the persisted choice on disconnect", async () => {
      mockIsConnected.mockResolvedValue({ isConnected: false });
      const { result } = renderHook(() => useWallet());
      await waitFor(() => expect(result.current.status).toBe("unavailable"));

      act(() => {
        result.current.selectWallet("xbull");
      });
      expect(window.sessionStorage.getItem("delego.activeWallet")).toBe("xbull");

      act(() => {
        result.current.disconnect();
      });
      expect(window.sessionStorage.getItem("delego.activeWallet")).toBeNull();
    });
  });
});
