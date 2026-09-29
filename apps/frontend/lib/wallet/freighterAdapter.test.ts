import { describe, it, expect, vi, beforeEach } from "vitest";
import { freighterAdapter } from "./freighterAdapter";
import { WalletAccessDeniedError } from "./types";

const {
  mockIsConnected,
  mockIsAllowed,
  mockGetAddress,
  mockGetNetwork,
  mockRequestAccess,
  mockSignTransaction,
  mockOnAccountChange,
  mockOnNetworkChange,
  mockWatchWalletChanges,
} = vi.hoisted(() => ({
  mockIsConnected: vi.fn(),
  mockIsAllowed: vi.fn(),
  mockGetAddress: vi.fn(),
  mockGetNetwork: vi.fn(),
  mockRequestAccess: vi.fn(),
  mockSignTransaction: vi.fn(),
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
  signTransaction: mockSignTransaction,
  onAccountChange: mockOnAccountChange,
  onNetworkChange: mockOnNetworkChange,
  WatchWalletChanges: mockWatchWalletChanges,
  default: {},
}));

describe("freighterAdapter", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockIsConnected.mockReset().mockResolvedValue({ isConnected: false });
    mockIsAllowed.mockReset();
    mockGetAddress.mockReset();
    mockGetNetwork.mockReset();
    mockRequestAccess.mockReset();
    mockSignTransaction.mockReset();
    mockOnAccountChange.mockReset();
    mockOnNetworkChange.mockReset();
    mockWatchWalletChanges.mockReset();
  });

  it("identifies itself for the picker", () => {
    expect(freighterAdapter.id).toBe("freighter");
    expect(freighterAdapter.name).toBe("Freighter");
    expect(freighterAdapter.installUrl).toBe("https://www.freighter.app/");
  });

  describe("detect", () => {
    it("resolves true only when the extension reports itself installed", async () => {
      mockIsConnected.mockResolvedValue({ isConnected: true });
      await expect(freighterAdapter.detect()).resolves.toBe(true);

      mockIsConnected.mockResolvedValue({ isConnected: false });
      await expect(freighterAdapter.detect()).resolves.toBe(false);
    });

    it("resolves false when the extension reports an error", async () => {
      mockIsConnected.mockResolvedValue({
        isConnected: true,
        error: { message: "extension error" },
      });

      await expect(freighterAdapter.detect()).resolves.toBe(false);
    });
  });

  describe("connect", () => {
    it("returns the authorized public key", async () => {
      mockRequestAccess.mockResolvedValue({ address: "GABC123" });

      await expect(freighterAdapter.connect()).resolves.toBe("GABC123");
    });

    it("throws WalletAccessDeniedError when access is declined", async () => {
      mockRequestAccess.mockResolvedValue({
        address: null,
        error: { message: "User declined access" },
      });

      await expect(freighterAdapter.connect()).rejects.toBeInstanceOf(
        WalletAccessDeniedError
      );
      await expect(freighterAdapter.connect()).rejects.toThrow(
        "User declined access"
      );
    });
  });

  describe("getAddress", () => {
    it("returns null while the wallet is not authorized", async () => {
      mockIsAllowed.mockResolvedValue({ isAllowed: false });

      await expect(freighterAdapter.getAddress()).resolves.toBeNull();
      expect(mockGetAddress).not.toHaveBeenCalled();
    });

    it("returns the address once authorized", async () => {
      mockIsAllowed.mockResolvedValue({ isAllowed: true });
      mockGetAddress.mockResolvedValue({ address: "GABC123" });

      await expect(freighterAdapter.getAddress()).resolves.toBe("GABC123");
    });

    it("throws the extension's message when the address cannot be read", async () => {
      mockIsAllowed.mockResolvedValue({ isAllowed: true });
      mockGetAddress.mockResolvedValue({
        address: null,
        error: { message: "no address" },
      });

      await expect(freighterAdapter.getAddress()).rejects.toThrow("no address");
    });

    it("falls back to the shared message when the extension says nothing", async () => {
      mockIsAllowed.mockResolvedValue({ isAllowed: true });
      mockGetAddress.mockResolvedValue({ address: null, error: {} });

      await expect(freighterAdapter.getAddress()).rejects.toThrow(
        "Couldn't read the wallet address. Please try again."
      );
    });
  });

  describe("getNetwork", () => {
    it("maps the reported network details", async () => {
      mockGetNetwork.mockResolvedValue({
        network: "TESTNET",
        networkPassphrase: "Test SDF Network ; September 2015",
      });

      await expect(freighterAdapter.getNetwork()).resolves.toEqual({
        network: "TESTNET",
        networkPassphrase: "Test SDF Network ; September 2015",
      });
    });

    it("returns null when the extension reports an error", async () => {
      mockGetNetwork.mockResolvedValue({ error: { message: "network error" } });

      await expect(freighterAdapter.getNetwork()).resolves.toBeNull();
    });
  });

  describe("signTransaction", () => {
    it("signs with the connected address and active passphrase", async () => {
      mockIsAllowed.mockResolvedValue({ isAllowed: true });
      mockGetAddress.mockResolvedValue({ address: "GABC123" });
      mockGetNetwork.mockResolvedValue({
        network: "TESTNET",
        networkPassphrase: "Test SDF Network ; September 2015",
      });
      mockSignTransaction.mockResolvedValue({
        signedTxXdr: "AAAA-SIGNED",
        error: null,
      });

      await expect(
        freighterAdapter.signTransaction("xdr-blob")
      ).resolves.toBe("AAAA-SIGNED");
      expect(mockSignTransaction).toHaveBeenCalledWith("xdr-blob", {
        address: "GABC123",
        networkPassphrase: "Test SDF Network ; September 2015",
      });
    });

    it("refuses to sign without a connected account", async () => {
      mockIsAllowed.mockResolvedValue({ isAllowed: false });

      await expect(freighterAdapter.signTransaction("xdr-blob")).rejects.toBeInstanceOf(
        WalletAccessDeniedError
      );
      expect(mockSignTransaction).not.toHaveBeenCalled();
    });

    it("reports a missing network rather than signing on the wrong one", async () => {
      mockIsAllowed.mockResolvedValue({ isAllowed: true });
      mockGetAddress.mockResolvedValue({ address: "GABC123" });
      mockGetNetwork.mockResolvedValue({ error: { message: "boom" } });

      await expect(freighterAdapter.signTransaction("xdr-blob")).rejects.toThrow(
        "Couldn't read the Freighter network. Please try again."
      );
      expect(mockSignTransaction).not.toHaveBeenCalled();
    });

    it("surfaces a rejected signature", async () => {
      mockIsAllowed.mockResolvedValue({ isAllowed: true });
      mockGetAddress.mockResolvedValue({ address: "GABC123" });
      mockGetNetwork.mockResolvedValue({
        network: "TESTNET",
        networkPassphrase: "Test SDF Network ; September 2015",
      });
      mockSignTransaction.mockResolvedValue({
        signedTxXdr: "",
        error: { message: "Signing was rejected." },
      });

      await expect(freighterAdapter.signTransaction("xdr-blob")).rejects.toThrow(
        "Signing was rejected."
      );
    });
  });

  describe("subscribe", () => {
    it("registers account and network listeners and cleans them up", async () => {
      const unsubAccount = vi.fn();
      const unsubNetwork = vi.fn();
      mockOnAccountChange.mockReturnValue(unsubAccount);
      mockOnNetworkChange.mockReturnValue(unsubNetwork);
      const onChange = vi.fn();

      const cleanup = await freighterAdapter.subscribe!(onChange);
      expect(mockOnAccountChange).toHaveBeenCalledWith(onChange);
      expect(mockOnNetworkChange).toHaveBeenCalledWith(onChange);

      expect(typeof cleanup).toBe("function");
      (cleanup as () => void)();
      expect(unsubAccount).toHaveBeenCalledTimes(1);
      expect(unsubNetwork).toHaveBeenCalledTimes(1);
    });

    it("supports listeners that expose a remove() handle", async () => {
      const remove = vi.fn();
      mockOnAccountChange.mockReturnValue({ remove });
      mockOnNetworkChange.mockReturnValue(undefined);

      const cleanup = await freighterAdapter.subscribe!(vi.fn());
      (cleanup as () => void)();

      expect(remove).toHaveBeenCalledTimes(1);
    });

    it("falls back to WatchWalletChanges when no direct listeners exist", async () => {
      const unsubWatch = vi.fn();
      mockOnAccountChange.mockReturnValue(undefined);
      mockOnNetworkChange.mockReturnValue(undefined);
      mockWatchWalletChanges.mockReturnValue(unsubWatch);

      const cleanup = await freighterAdapter.subscribe!(vi.fn());

      expect(mockWatchWalletChanges).toHaveBeenCalledTimes(1);
      (cleanup as () => void)();
      expect(unsubWatch).toHaveBeenCalledTimes(1);
    });

    it("resolves with nothing when the extension exposes no listeners", async () => {
      mockOnAccountChange.mockReturnValue(undefined);
      mockOnNetworkChange.mockReturnValue(undefined);
      mockWatchWalletChanges.mockReturnValue(undefined);

      await expect(freighterAdapter.subscribe!(vi.fn())).resolves.toBeUndefined();
    });
  });

  it("disconnect is a deliberate no-op (Freighter keeps no dApp session)", () => {
    expect(freighterAdapter.disconnect()).toBeUndefined();
  });
});
