import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TokenAllowancesTable, formatStroopsToDecimal } from "./TokenAllowancesTable";
import type { TokenAllowanceEntry } from "@delegolabs/types";

describe("TokenAllowancesTable", () => {
  const mockAllowances: TokenAllowanceEntry[] = [
    {
      tokenAddress: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
      tokenSymbol: "USDC",
      spenderAddress: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
      spenderLabel: "Escrow Contract",
      allowedAmountStroops: "50000000", // 5 USDC
      expirationLedger: 123456,
    },
    {
      tokenAddress: "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA",
      tokenSymbol: "XLM",
      spenderAddress: "CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB4",
      spenderLabel: "Router Contract",
      allowedAmountStroops: "10000000", // 1 XLM
      expirationLedger: 0,
    },
  ];

  it("renders empty state message when allowances list is empty", () => {
    render(
      <TokenAllowancesTable
        allowances={[]}
        onRevoke={vi.fn()}
        networkId="testnet"
      />
    );
    expect(
      screen.getByText("No active Soroban token allowances found for this account.")
    ).toBeInTheDocument();
  });

  it("renders loading skeleton when loading and empty", () => {
    render(
      <TokenAllowancesTable
        allowances={[]}
        loading={true}
        onRevoke={vi.fn()}
        networkId="testnet"
      />
    );
    expect(screen.getByTestId("allowances-loading")).toBeInTheDocument();
  });

  it("renders table with spender address, allowance amount, and expiry ledger", () => {
    render(
      <TokenAllowancesTable
        allowances={mockAllowances}
        onRevoke={vi.fn()}
        networkId="testnet"
      />
    );

    // Spender labels and shortened addresses
    expect(screen.getByText("Escrow Contract")).toBeInTheDocument();
    expect(screen.getByText("Router Contract")).toBeInTheDocument();

    // Allowance amounts formatted
    expect(screen.getByText("5 USDC")).toBeInTheDocument();
    expect(screen.getByText("1 XLM")).toBeInTheDocument();

    // Expiry ledgers
    expect(screen.getByText("#123456")).toBeInTheDocument();
    expect(screen.getByText("No expiry")).toBeInTheDocument();

    // Revoke buttons
    const revokeButtons = screen.getAllByRole("button", { name: /Revoke allowance for/i });
    expect(revokeButtons).toHaveLength(2);
  });

  it("calls onRevoke when Revoke button is clicked for a row", async () => {
    const handleRevoke = vi.fn().mockResolvedValue(undefined);
    render(
      <TokenAllowancesTable
        allowances={mockAllowances}
        onRevoke={handleRevoke}
        networkId="testnet"
      />
    );

    const firstRevokeBtn = screen.getByTestId(
      `revoke-btn-${mockAllowances[0].spenderAddress}`
    );
    fireEvent.click(firstRevokeBtn);

    expect(handleRevoke).toHaveBeenCalledTimes(1);
    expect(handleRevoke).toHaveBeenCalledWith(mockAllowances[0]);
  });

  it("disables Revoke button and shows revoking text when row is being revoked", () => {
    const revokingKey = `${mockAllowances[0].tokenAddress}-${mockAllowances[0].spenderAddress}`;
    render(
      <TokenAllowancesTable
        allowances={mockAllowances}
        revokingSpenderKey={revokingKey}
        onRevoke={vi.fn()}
        networkId="testnet"
      />
    );

    const firstRevokeBtn = screen.getByTestId(
      `revoke-btn-${mockAllowances[0].spenderAddress}`
    );
    expect(firstRevokeBtn).toBeDisabled();
    expect(firstRevokeBtn).toHaveTextContent("Revoking…");

    const secondRevokeBtn = screen.getByTestId(
      `revoke-btn-${mockAllowances[1].spenderAddress}`
    );
    expect(secondRevokeBtn).not.toBeDisabled();
    expect(secondRevokeBtn).toHaveTextContent("Revoke");
  });

  it("disables all Revoke buttons when disabled prop is true", () => {
    render(
      <TokenAllowancesTable
        allowances={mockAllowances}
        disabled={true}
        onRevoke={vi.fn()}
        networkId="testnet"
      />
    );

    const firstRevokeBtn = screen.getByTestId(
      `revoke-btn-${mockAllowances[0].spenderAddress}`
    );
    const secondRevokeBtn = screen.getByTestId(
      `revoke-btn-${mockAllowances[1].spenderAddress}`
    );
    expect(firstRevokeBtn).toBeDisabled();
    expect(secondRevokeBtn).toBeDisabled();
  });

  describe("formatStroopsToDecimal helper", () => {
    it("correctly converts stroops to decimal string", () => {
      expect(formatStroopsToDecimal("10000000")).toBe("1");
      expect(formatStroopsToDecimal("15000000")).toBe("1.5");
      expect(formatStroopsToDecimal("100")).toBe("0.00001");
      expect(formatStroopsToDecimal("0")).toBe("0");
    });
  });
});
