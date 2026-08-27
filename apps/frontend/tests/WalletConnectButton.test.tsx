import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { WalletConnectButton } from "../components/wallet/WalletConnectButton";

const fakes = vi.hoisted(() => {
  const make = (id: string, name: string) => ({
    id,
    name,
    installUrl: `https://${id}.example/`,
    detect: vi.fn<() => Promise<boolean>>(),
    connect: vi.fn<() => Promise<string>>(),
    getAddress: vi.fn(async () => null),
    getNetwork: vi.fn(async () => ({
      network: null,
      networkPassphrase: null,
    })),
    signTransaction: vi.fn(),
    disconnect: vi.fn(async () => {}),
  });
  return { a: make("walleta", "WalletA"), b: make("walletb", "WalletB") };
});

vi.mock("../lib/wallet/registry", () => {
  const adapters = [fakes.a, fakes.b];
  const key = "delego_wallet_adapter";
  return {
    WALLET_ADAPTER_STORAGE_KEY: key,
    walletAdapters: adapters,
    defaultWalletAdapter: fakes.a,
    getWalletAdapter: (id?: string | null) =>
      adapters.find((adapter) => adapter.id === id) ?? fakes.a,
    getStoredWalletAdapterId: () => window.localStorage.getItem(key),
    storeWalletAdapterId: (id: string) =>
      window.localStorage.setItem(key, id),
    detectWalletAdapter: (adapter: { detect: () => Promise<boolean> }) =>
      adapter.detect().catch(() => false),
    detectWalletAdapters: async () =>
      Promise.all(
        adapters.map(async (adapter) => ({
          adapter,
          detected: await adapter.detect().catch(() => false),
        }))
      ),
  };
});

describe("WalletConnectButton", () => {
  beforeEach(() => {
    [fakes.a, fakes.b].forEach((fake) => {
      fake.detect.mockReset();
      fake.connect.mockReset();
    });
    window.localStorage.clear();
  });

  it("connects the only detected wallet directly", async () => {
    fakes.a.detect.mockResolvedValueOnce(false).mockResolvedValue(true);
    fakes.b.detect.mockResolvedValue(false);
    fakes.a.connect.mockResolvedValue("GAAA111");

    render(<WalletConnectButton />);
    const button = await screen.findByRole("button", {
      name: "Connect Wallet",
    });

    fireEvent.click(button);

    await screen.findByText("GAAA111");
    expect(fakes.a.connect).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("wallet-picker-modal")).toBeNull();
    expect(window.localStorage.getItem("delego_wallet_adapter")).toBe(
      "walleta"
    );
  });

  it("opens the picker with the sweep results when several wallets are detected", async () => {
    fakes.a.detect.mockResolvedValueOnce(false).mockResolvedValue(true);
    fakes.b.detect.mockResolvedValue(true);
    fakes.b.connect.mockResolvedValue("GBBB222");

    render(<WalletConnectButton />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Connect Wallet" })
    );

    const rowB = await screen.findByTestId("wallet-option-walletb");
    fireEvent.click(within(rowB).getByRole("button", { name: "Connect" }));

    await screen.findByText("GBBB222");
    expect(fakes.b.connect).toHaveBeenCalledTimes(1);
    expect(fakes.a.connect).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("delego_wallet_adapter")).toBe(
      "walletb"
    );
  });

  it("opens the picker with install links when nothing is detected", async () => {
    fakes.a.detect.mockResolvedValue(false);
    fakes.b.detect.mockResolvedValue(false);

    render(<WalletConnectButton />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Connect Wallet" })
    );

    expect(await screen.findAllByText("Not installed")).toHaveLength(2);
    expect(
      screen.getByRole("link", { name: "Get WalletA" })
    ).toHaveAttribute("href", "https://walleta.example/");
    expect(fakes.a.connect).not.toHaveBeenCalled();
    expect(fakes.b.connect).not.toHaveBeenCalled();
  });

  it("connects a persisted wallet directly without a full sweep", async () => {
    window.localStorage.setItem("delego_wallet_adapter", "walletb");
    fakes.b.detect.mockResolvedValueOnce(false).mockResolvedValue(true);
    fakes.b.connect.mockResolvedValue("GBBB333");

    render(<WalletConnectButton />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Connect Wallet" })
    );

    await screen.findByText("GBBB333");
    expect(fakes.b.connect).toHaveBeenCalledTimes(1);
    expect(fakes.a.detect).not.toHaveBeenCalled();
  });

  it("shows an install link while the active wallet is unavailable", async () => {
    fakes.a.detect.mockResolvedValue(false);
    fakes.b.detect.mockResolvedValue(false);

    render(<WalletConnectButton />);

    const installLink = await screen.findByRole("link", {
      name: "Install WalletA",
    });
    expect(installLink).toHaveAttribute("href", "https://walleta.example/");
  });
});
