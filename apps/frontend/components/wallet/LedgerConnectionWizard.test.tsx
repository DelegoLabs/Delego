import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { LedgerConnectionWizard } from "./LedgerConnectionWizard";
import { ledgerAdapter } from "@/lib/wallet/ledgerAdapter";

vi.mock("@/lib/wallet/ledgerAdapter", () => ({
  DEFAULT_LEDGER_BIP32_PATH: "44'/148'/0'",
  ledgerAdapter: {
    connectLedger: vi.fn(),
  },
}));

describe("LedgerConnectionWizard", () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onConnected: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders wizard steps and handles connection button", async () => {
    vi.mocked(ledgerAdapter.connectLedger).mockResolvedValueOnce({
      isConnected: true,
      bip32Path: "44'/148'/0'",
      publicKey: "GABCLEDGER1234567890",
      deviceModel: "nanoX",
      isAppOpen: true,
    });

    render(<LedgerConnectionWizard {...defaultProps} />);

    expect(screen.getByText("Connect Ledger Hardware Wallet")).toBeInTheDocument();

    const connectBtn = screen.getByRole("button", { name: /Connect Ledger/i });
    fireEvent.click(connectBtn);

    await waitFor(() => {
      expect(ledgerAdapter.connectLedger).toHaveBeenCalledWith("44'/148'/0'");
      expect(screen.getByText("Ledger Connected Successfully!")).toBeInTheDocument();
      expect(screen.getByText("Device: nanoX")).toBeInTheDocument();
      expect(defaultProps.onConnected).toHaveBeenCalled();
    });
  });
});
