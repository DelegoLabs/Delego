import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { TokenAllowancesTable, formatStroopsToDecimal } from "./TokenAllowancesTable";
import type { TokenAllowanceEntry } from "@delegolabs/types";
import messages from "../../messages/en.json";

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>
  );
}

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
    renderWithIntl(
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
    renderWithIntl(
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
    renderWithIntl(
      <TokenAllowancesTable
        allowances={mockAllowances}
        onRevoke={vi.fn()}
        networkId="testnet"
      />
    );

    expect(screen.getByText("Escrow Contract")).toBeInTheDocument();
    expect(screen.getByText("Router Contract")).toBeInTheDocument();
    expect(screen.getByText("5 USDC")).toBeInTheDocument();
    expect(screen.getByText("1 XLM")).toBeInTheDocument();
    expect(screen.getByText("#123456")).toBeInTheDocument();
    expect(screen.getByText("No expiry")).toBeInTheDocument();

    const revokeButtons = screen.getAllByRole("button", { name: /Revoke allowance for/i });
    expect(revokeButtons).toHaveLength(2);
  });

  it("renders per-row checkboxes and a select-all checkbox", () => {
    renderWithIntl(
      <TokenAllowancesTable
        allowances={mockAllowances}
        onRevoke={vi.fn()}
        networkId="testnet"
      />
    );

    expect(screen.getByTestId("select-all-checkbox")).toBeInTheDocument();
    expect(
      screen.getByTestId(`select-checkbox-${mockAllowances[0].spenderAddress}`)
    ).toBeInTheDocument();
    expect(
      screen.getByTestId(`select-checkbox-${mockAllowances[1].spenderAddress}`)
    ).toBeInTheDocument();
  });

  it("shows Revoke selected toolbar when at least one row is checked", () => {
    renderWithIntl(
      <TokenAllowancesTable
        allowances={mockAllowances}
        onRevoke={vi.fn()}
        networkId="testnet"
      />
    );

    expect(screen.queryByTestId("revoke-selected-btn")).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByTestId(`select-checkbox-${mockAllowances[0].spenderAddress}`)
    );

    expect(screen.getByTestId("revoke-selected-btn")).toBeInTheDocument();
    expect(screen.getByText(/1 allowance selected/i)).toBeInTheDocument();
  });

  it("select-all checkbox selects all rows and updates toolbar count", () => {
    renderWithIntl(
      <TokenAllowancesTable
        allowances={mockAllowances}
        onRevoke={vi.fn()}
        networkId="testnet"
      />
    );

    fireEvent.click(screen.getByTestId("select-all-checkbox"));

    expect(screen.getByText(/2 allowances selected/i)).toBeInTheDocument();
    expect(
      (screen.getByTestId(`select-checkbox-${mockAllowances[0].spenderAddress}`) as HTMLInputElement).checked
    ).toBe(true);
    expect(
      (screen.getByTestId(`select-checkbox-${mockAllowances[1].spenderAddress}`) as HTMLInputElement).checked
    ).toBe(true);
  });

  it("clicking select-all again deselects all rows", () => {
    renderWithIntl(
      <TokenAllowancesTable
        allowances={mockAllowances}
        onRevoke={vi.fn()}
        networkId="testnet"
      />
    );

    const selectAll = screen.getByTestId("select-all-checkbox");
    fireEvent.click(selectAll);
    fireEvent.click(selectAll);

    expect(screen.queryByTestId("revoke-selected-btn")).not.toBeInTheDocument();
  });

  it("opens confirmation modal when Revoke selected is clicked", () => {
    renderWithIntl(
      <TokenAllowancesTable
        allowances={mockAllowances}
        onRevoke={vi.fn()}
        networkId="testnet"
      />
    );

    fireEvent.click(
      screen.getByTestId(`select-checkbox-${mockAllowances[0].spenderAddress}`)
    );
    fireEvent.click(screen.getByTestId("revoke-selected-btn"));

    expect(screen.getByTestId("batch-revoke-modal")).toBeInTheDocument();
    expect(screen.getByText("Revoke selected allowances")).toBeInTheDocument();
    expect(screen.getByText(/about to revoke 1 allowance/i)).toBeInTheDocument();
    expect(screen.getByText("Escrow Contract")).toBeInTheDocument();
  });

  it("lists all selected entries in the modal", () => {
    renderWithIntl(
      <TokenAllowancesTable
        allowances={mockAllowances}
        onRevoke={vi.fn()}
        networkId="testnet"
      />
    );

    fireEvent.click(screen.getByTestId("select-all-checkbox"));
    fireEvent.click(screen.getByTestId("revoke-selected-btn"));

    expect(screen.getByText(/about to revoke 2 allowances/i)).toBeInTheDocument();
    expect(screen.getAllByText("Escrow Contract").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Router Contract").length).toBeGreaterThan(0);
  });

  it("closes modal on Cancel without calling onRevoke", () => {
    const onRevoke = vi.fn();
    renderWithIntl(
      <TokenAllowancesTable
        allowances={mockAllowances}
        onRevoke={onRevoke}
        networkId="testnet"
      />
    );

    fireEvent.click(
      screen.getByTestId(`select-checkbox-${mockAllowances[0].spenderAddress}`)
    );
    fireEvent.click(screen.getByTestId("revoke-selected-btn"));
    fireEvent.click(screen.getByTestId("batch-revoke-cancel"));

    expect(screen.queryByTestId("batch-revoke-modal")).not.toBeInTheDocument();
    expect(onRevoke).not.toHaveBeenCalled();
  });

  it("calls onRevoke sequentially for selected entries and shows success", async () => {
    const onRevoke = vi.fn().mockResolvedValue(undefined);
    renderWithIntl(
      <TokenAllowancesTable
        allowances={mockAllowances}
        onRevoke={onRevoke}
        networkId="testnet"
      />
    );

    fireEvent.click(screen.getByTestId("select-all-checkbox"));
    fireEvent.click(screen.getByTestId("revoke-selected-btn"));
    fireEvent.click(screen.getByTestId("batch-revoke-confirm"));

    await waitFor(() =>
      expect(screen.getByTestId("batch-revoke-success")).toBeInTheDocument()
    );

    expect(onRevoke).toHaveBeenCalledTimes(2);
    expect(onRevoke).toHaveBeenNthCalledWith(1, mockAllowances[0]);
    expect(onRevoke).toHaveBeenNthCalledWith(2, mockAllowances[1]);
  });

  it("delegates to onRevokeSelected when provided", async () => {
    const onRevoke = vi.fn();
    const onRevokeSelected = vi.fn().mockResolvedValue(undefined);
    renderWithIntl(
      <TokenAllowancesTable
        allowances={mockAllowances}
        onRevoke={onRevoke}
        onRevokeSelected={onRevokeSelected}
        networkId="testnet"
      />
    );

    fireEvent.click(screen.getByTestId("select-all-checkbox"));
    fireEvent.click(screen.getByTestId("revoke-selected-btn"));
    fireEvent.click(screen.getByTestId("batch-revoke-confirm"));

    await waitFor(() =>
      expect(screen.getByTestId("batch-revoke-success")).toBeInTheDocument()
    );

    expect(onRevokeSelected).toHaveBeenCalledWith(mockAllowances);
    expect(onRevoke).not.toHaveBeenCalled();
  });

  it("shows error message when a batch revoke fails", async () => {
    const error = new Error("Ledger rejected transaction");
    const onRevoke = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(error);

    renderWithIntl(
      <TokenAllowancesTable
        allowances={mockAllowances}
        onRevoke={onRevoke}
        networkId="testnet"
      />
    );

    fireEvent.click(screen.getByTestId("select-all-checkbox"));
    fireEvent.click(screen.getByTestId("revoke-selected-btn"));
    fireEvent.click(screen.getByTestId("batch-revoke-confirm"));

    await waitFor(() =>
      expect(screen.getByTestId("batch-revoke-error")).toBeInTheDocument()
    );

    expect(screen.getByText("Ledger rejected transaction")).toBeInTheDocument();
  });

  it("calls onRevoke when Revoke button is clicked for a single row", async () => {
    const handleRevoke = vi.fn().mockResolvedValue(undefined);
    renderWithIntl(
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
    renderWithIntl(
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

  it("disables all Revoke buttons and checkboxes when disabled prop is true", () => {
    renderWithIntl(
      <TokenAllowancesTable
        allowances={mockAllowances}
        disabled={true}
        onRevoke={vi.fn()}
        networkId="testnet"
      />
    );

    expect(screen.getByTestId(`revoke-btn-${mockAllowances[0].spenderAddress}`)).toBeDisabled();
    expect(screen.getByTestId(`revoke-btn-${mockAllowances[1].spenderAddress}`)).toBeDisabled();
    expect(screen.getByTestId("select-all-checkbox")).toBeDisabled();
    expect(screen.getByTestId(`select-checkbox-${mockAllowances[0].spenderAddress}`)).toBeDisabled();
  });

  describe("formatStroopsToDecimal helper", () => {
    it("correctly converts stroops to decimal string", () => {
      expect(formatStroopsToDecimal("10000000")).toBe("1");
      expect(formatStroopsToDecimal("15000000")).toBe("1.5");
      expect(formatStroopsToDecimal("100")).toBe("0.00001");
      expect(formatStroopsToDecimal("0")).toBe("0");
    });

    it("formats whole part with a fixed en-US grouping locale regardless of environment", () => {
      expect(formatStroopsToDecimal("12345670000000", "en-US")).toBe("1,234,567");
      expect(formatStroopsToDecimal("12345670000000", "en-US")).toBe(
        formatStroopsToDecimal("12345670000000", "en-US")
      );
    });
  });
});
