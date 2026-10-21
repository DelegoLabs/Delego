/**
 * Wallet page — edge-case render tests (#899)
 *
 * Verifies the page does not throw when the wallet is disconnected,
 * during a session switch (address becomes null), or while balances
 * are loading from Horizon.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import WalletPage from "./page";

// ── Stable stubs (overridden per-test where needed) ──────────────────────────

vi.mock("../../hooks/useWallet", () => ({
  useWallet: vi.fn(() => ({
    status: "disconnected",
    address: null,
    network: null,
    networkPassphrase: null,
    error: null,
    toast: null,
  })),
}));

vi.mock("../../hooks/useNetwork", () => ({
  useNetwork: vi.fn(() => ({
    network: { horizonUrl: "https://horizon-testnet.stellar.org", isLive: false },
  })),
}));

vi.mock("../../hooks/useBalanceHistory", () => ({
  useBalanceHistory: vi.fn(() => ({
    balances: [],
    series: [],
    status: "idle",
    isUnfunded: false,
    accountNotFound: false,
    refetch: vi.fn(),
  })),
}));

vi.mock("../../hooks/usePaymentStream", () => ({
  usePaymentStream: vi.fn(() => ({
    status: "idle",
    latestPayment: null,
    error: null,
  })),
}));

vi.mock("../../hooks/useAudioNotifications", () => ({
  useAudioNotifications: vi.fn(() => ({ playChime: vi.fn() })),
}));

vi.mock("../../hooks/useFriendbot", () => ({
  useFriendbot: vi.fn(() => ({
    state: { status: "idle", cooldownSecondsRemaining: 0 },
    fund: vi.fn(),
    initForAddress: vi.fn(),
  })),
}));

vi.mock("../../hooks/useNotifications", () => ({
  useNotifications: vi.fn(() => ({ add: vi.fn() })),
}));

vi.mock("../../hooks/useDemoModeGuard", () => ({
  useDemoModeGuard: vi.fn(() => ({
    isDemoMode: false,
    guard: (fn: (...a: unknown[]) => unknown) => fn,
  })),
  DEMO_MODE_BLOCKED_MESSAGE: "Demo mode is read-only.",
}));

vi.mock("../../hooks/useOnlineStatus", () => ({
  useOnlineStatus: vi.fn(() => ({
    connectionStatus: "online",
    cachedOrdersCount: 0,
    lastSyncedAt: null,
    disabledProps: {},
  })),
  OFFLINE_BLOCKED_MESSAGE: "You're offline \u2014 reconnect to continue.",
}));

// Stub heavy UI components that don't need to render in these unit tests
vi.mock("../../components/wallet/WalletConnectButton", () => ({
  WalletConnectButton: () => null,
}));
vi.mock("../../components/wallet/FeeTierField", () => ({
  FeeTierField: () => null,
}));
vi.mock("../../components/wallet/PasskeyRegisterModal", () => ({
  PasskeyRegisterModal: () => null,
}));
vi.mock("../../components/wallet/FriendbotModal", () => ({
  FriendbotModal: () => null,
}));
vi.mock("../../components/wallet/BalanceSparkline", () => ({
  BalanceSparkline: () => null,
}));
vi.mock("../../components/wallet/AssetBreakdownTable", () => ({
  AssetBreakdownTable: () => null,
}));
vi.mock("../../components/wallet/CopyButton", () => ({
  CopyButton: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

import { useWallet } from "../../hooks/useWallet";
import { useBalanceHistory } from "../../hooks/useBalanceHistory";

describe("WalletPage — null-safety and loading states (#899)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // restore safe defaults
    (useWallet as ReturnType<typeof vi.fn>).mockReturnValue({
      status: "disconnected",
      address: null,
      network: null,
      networkPassphrase: null,
      error: null,
      toast: null,
    });
    (useBalanceHistory as ReturnType<typeof vi.fn>).mockReturnValue({
      balances: [],
      series: [],
      status: "idle",
      isUnfunded: false,
      accountNotFound: false,
      refetch: vi.fn(),
    });
  });

  it("renders without throwing when wallet is disconnected (address is null)", () => {
    expect(() => render(<WalletPage />)).not.toThrow();
  });

  it("renders the disconnected status badge", () => {
    render(<WalletPage />);
    expect(screen.getByText("Not connected")).toBeInTheDocument();
  });

  it("does not render the balance card while disconnected", () => {
    render(<WalletPage />);
    expect(screen.queryByText("Balance History & Asset Breakdown")).toBeNull();
  });

  it("shows the skeleton while balances are loading", () => {
    (useWallet as ReturnType<typeof vi.fn>).mockReturnValue({
      status: "connected",
      address: "GABC1234",
      network: "testnet",
      networkPassphrase: "Test SDF Network ; September 2015",
      error: null,
      toast: null,
    });
    (useBalanceHistory as ReturnType<typeof vi.fn>).mockReturnValue({
      balances: [],
      series: [],
      status: "loading",
      isUnfunded: false,
      accountNotFound: false,
      refetch: vi.fn(),
    });

    const { container } = render(<WalletPage />);
    expect(container.querySelector(".skeleton-form")).not.toBeNull();
  });

  it("shows the zero state when account is unfunded on testnet", () => {
    (useWallet as ReturnType<typeof vi.fn>).mockReturnValue({
      status: "connected",
      address: "GABC1234",
      network: "testnet",
      networkPassphrase: "Test SDF Network ; September 2015",
      error: null,
      toast: null,
    });
    (useBalanceHistory as ReturnType<typeof vi.fn>).mockReturnValue({
      balances: [],
      series: [],
      status: "idle",
      isUnfunded: true,
      accountNotFound: false,
      refetch: vi.fn(),
    });

    render(<WalletPage />);
    expect(screen.getByText("Fund your testnet account")).toBeInTheDocument();
  });
});
