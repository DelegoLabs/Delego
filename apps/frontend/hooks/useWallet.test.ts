import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useWallet } from "./useWallet";
import {
  enableDemoMode,
  DEMO_WALLET_ADDRESS,
  DEMO_NETWORK,
} from "../lib/demoMode";

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

    it("reports an error when the user denies access", async () => {
      mockIsConnected.mockResolvedValue({ isConnected: false });
      const { result } = renderHook(() => useWallet());
      await waitFor(() => expect(result.current.status).toBe("unavailable"));

      mockRequestAccess.mockResolvedValue({
        address: null,
        error: { message: "User declined access" },
      });

      await act(async () => {
        await result.current.connect();
      });

      expect(result.current.status).toBe("error");
      expect(result.current.error).toBe("User declined access");
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
    it("registers onAccountChange and onNetworkChange on mount and cleans up on unmount", async () => {
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

      unmount();

      expect(unsubAccount).toHaveBeenCalledTimes(1);
      expect(unsubNetwork).toHaveBeenCalledTimes(1);
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
});
