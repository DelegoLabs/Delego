import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TokenAllowancesCard } from "./TokenAllowancesCard";
import type { TokenAllowanceEntry } from "@delegolabs/types";

const mockAllowances: TokenAllowanceEntry[] = [
  {
    tokenAddress: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
    tokenSymbol: "USDC",
    spenderAddress: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
    spenderLabel: "Escrow Contract",
    allowedAmountStroops: "50000000",
    expirationLedger: 123456,
  },
];

const mockRevokeAllowance = vi.fn();
const mockRefetch = vi.fn();
const mockAddNotification = vi.fn();

vi.mock("../../hooks/useNetwork", () => ({
  useNetwork: vi.fn(() => ({
    network: {
      id: "testnet",
      label: "Testnet",
      shortLabel: "TEST",
      freighterNetwork: "TESTNET",
      networkPassphrase: "Test SDF Network ; September 2015",
      horizonUrl: "https://horizon-testnet.stellar.org",
      sorobanRpcUrl: "https://soroban-testnet.stellar.org",
      isLive: false,
    },
  })),
}));

vi.mock("../../hooks/useNotifications", () => ({
  useNotifications: vi.fn(() => ({
    add: mockAddNotification,
  })),
}));

vi.mock("./useTokenAllowances", () => ({
  useTokenAllowances: vi.fn(() => ({
    allowances: mockAllowances,
    loading: false,
    error: null,
    revokingSpender: null,
    revokeAllowance: mockRevokeAllowance,
    refetch: mockRefetch,
  })),
}));

describe("TokenAllowancesCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not render when wallet is not connected", () => {
    const { container } = render(
      <TokenAllowancesCard address={null} isConnected={false} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders allowances card with table when connected", () => {
    render(
      <TokenAllowancesCard
        address="GABC1234567890123456789012345678901234567890123456789012"
        isConnected={true}
      />
    );

    expect(screen.getByText("Token Allowances")).toBeInTheDocument();
    expect(screen.getByText("Escrow Contract")).toBeInTheDocument();
    expect(screen.getByText("5 USDC")).toBeInTheDocument();
  });

  it("calls revokeAllowance and shows success notification on 1-click Revoke", async () => {
    mockRevokeAllowance.mockResolvedValueOnce(undefined);

    render(
      <TokenAllowancesCard
        address="GABC1234567890123456789012345678901234567890123456789012"
        isConnected={true}
      />
    );

    const revokeBtn = screen.getByTestId(
      `revoke-btn-${mockAllowances[0].spenderAddress}`
    );
    fireEvent.click(revokeBtn);

    await waitFor(() => {
      expect(mockRevokeAllowance).toHaveBeenCalledTimes(1);
      expect(mockRevokeAllowance).toHaveBeenCalledWith(mockAllowances[0]);
    });

    expect(mockAddNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "success",
        title: "Allowance Revoked",
      })
    );
  });

  it("shows error notification when revocation fails", async () => {
    mockRevokeAllowance.mockRejectedValueOnce(new Error("Transaction rejected"));

    render(
      <TokenAllowancesCard
        address="GABC1234567890123456789012345678901234567890123456789012"
        isConnected={true}
      />
    );

    const revokeBtn = screen.getByTestId(
      `revoke-btn-${mockAllowances[0].spenderAddress}`
    );
    fireEvent.click(revokeBtn);

    await waitFor(() => {
      expect(mockAddNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "error",
          title: "Revocation Failed",
        })
      );
    });
  });
});
