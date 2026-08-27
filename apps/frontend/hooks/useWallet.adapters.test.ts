import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useWallet } from "./useWallet";
import { WALLET_ADAPTER_STORAGE_KEY } from "../lib/wallet/registry";

const mockFreighterIsConnected = vi.fn();
const mockFreighterIsAllowed = vi.fn();
const mockFreighterGetAddress = vi.fn();
const mockFreighterGetNetwork = vi.fn();
const mockFreighterRequestAccess = vi.fn();

vi.mock("@stellar/freighter-api", () => ({
  isConnected: (...args: unknown[]) => mockFreighterIsConnected(...args),
  isAllowed: (...args: unknown[]) => mockFreighterIsAllowed(...args),
  getAddress: (...args: unknown[]) => mockFreighterGetAddress(...args),
  getNetwork: (...args: unknown[]) => mockFreighterGetNetwork(...args),
  requestAccess: (...args: unknown[]) => mockFreighterRequestAccess(...args),
}));

const mockLobstrIsConnected = vi.fn();
const mockLobstrGetPublicKey = vi.fn();
const mockLobstrSignTransaction = vi.fn();

vi.mock("@lobstrco/signer-extension-api", () => ({
  isConnected: (...args: unknown[]) => mockLobstrIsConnected(...args),
  getPublicKey: (...args: unknown[]) => mockLobstrGetPublicKey(...args),
  signTransaction: (...args: unknown[]) => mockLobstrSignTransaction(...args),
}));

describe("useWallet adapter selection", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockFreighterIsConnected.mockReset();
    mockFreighterIsAllowed.mockReset();
    mockFreighterGetAddress.mockReset();
    mockFreighterGetNetwork.mockReset();
    mockFreighterRequestAccess.mockReset();
    mockLobstrIsConnected.mockReset();
    mockLobstrGetPublicKey.mockReset();
    mockLobstrSignTransaction.mockReset();
    window.localStorage.clear();
  });

  it("persists under the documented storage key", () => {
    expect(WALLET_ADAPTER_STORAGE_KEY).toBe("delego_wallet_adapter");
  });

  it("defaults to Freighter when no selection is stored", async () => {
    mockFreighterIsConnected.mockResolvedValue({ isConnected: false });

    const { result } = renderHook(() => useWallet());

    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current.walletId).toBe("freighter");
    expect(result.current.walletName).toBe("Freighter");
    expect(mockLobstrIsConnected).not.toHaveBeenCalled();
  });

  it("connectWith('lobstr') connects via getPublicKey and persists the choice", async () => {
    mockFreighterIsConnected.mockResolvedValue({ isConnected: false });
    const { result } = renderHook(() => useWallet());
    await waitFor(() => expect(result.current.status).toBe("unavailable"));

    mockLobstrIsConnected.mockResolvedValue(true);
    mockLobstrGetPublicKey.mockResolvedValue("GLOBSTR111");

    await act(async () => {
      await result.current.connectWith("lobstr");
    });

    expect(result.current.status).toBe("connected");
    expect(result.current.address).toBe("GLOBSTR111");
    expect(result.current.walletId).toBe("lobstr");
    expect(result.current.walletName).toBe("LOBSTR");
    expect(result.current.network).toBeNull();
    expect(result.current.networkPassphrase).toBeNull();
    expect(window.localStorage.getItem(WALLET_ADAPTER_STORAGE_KEY)).toBe(
      "lobstr"
    );
  });

  it("probes the persisted wallet on mount instead of Freighter", async () => {
    window.localStorage.setItem(WALLET_ADAPTER_STORAGE_KEY, "lobstr");
    mockLobstrIsConnected.mockResolvedValue(true);

    const { result } = renderHook(() => useWallet());

    // LOBSTR has no silent address read, so a persisted session resumes as
    // disconnected rather than auto-prompting.
    await waitFor(() => expect(result.current.status).toBe("disconnected"));
    expect(result.current.walletId).toBe("lobstr");
    expect(mockFreighterIsConnected).not.toHaveBeenCalled();
    expect(mockLobstrGetPublicKey).not.toHaveBeenCalled();
  });

  it("reports unavailable when the persisted wallet is not installed", async () => {
    window.localStorage.setItem(WALLET_ADAPTER_STORAGE_KEY, "lobstr");
    mockLobstrIsConnected.mockResolvedValue(false);

    const { result } = renderHook(() => useWallet());

    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current.walletId).toBe("lobstr");
  });

  it("reports an error when LOBSTR access is declined", async () => {
    mockFreighterIsConnected.mockResolvedValue({ isConnected: false });
    const { result } = renderHook(() => useWallet());
    await waitFor(() => expect(result.current.status).toBe("unavailable"));

    mockLobstrIsConnected.mockResolvedValue(true);
    mockLobstrGetPublicKey.mockRejectedValue(new Error("User declined"));

    await act(async () => {
      await result.current.connectWith("lobstr");
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe("User declined");
  });

  it("falls back to Freighter for an unknown stored id", async () => {
    window.localStorage.setItem(WALLET_ADAPTER_STORAGE_KEY, "phantom");
    mockFreighterIsConnected.mockResolvedValue({ isConnected: true });
    mockFreighterIsAllowed.mockResolvedValue({ isAllowed: true });
    mockFreighterGetAddress.mockResolvedValue({ address: "GABC123" });
    mockFreighterGetNetwork.mockResolvedValue({
      network: "TESTNET",
      networkPassphrase: "Test SDF Network ; September 2015",
    });

    const { result } = renderHook(() => useWallet());

    await waitFor(() => expect(result.current.status).toBe("connected"));
    expect(result.current.walletId).toBe("freighter");
    expect(result.current.address).toBe("GABC123");
  });

  it("connect() uses the persisted wallet choice", async () => {
    window.localStorage.setItem(WALLET_ADAPTER_STORAGE_KEY, "lobstr");
    mockLobstrIsConnected.mockResolvedValue(true);
    const { result } = renderHook(() => useWallet());
    await waitFor(() => expect(result.current.status).toBe("disconnected"));

    mockLobstrGetPublicKey.mockResolvedValue("GLOBSTR222");

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.status).toBe("connected");
    expect(result.current.address).toBe("GLOBSTR222");
    expect(mockFreighterRequestAccess).not.toHaveBeenCalled();
  });
});
