import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Sep24InteractiveModal } from "./Sep24InteractiveModal";
import type { Sep0024InteractiveSession } from "@delegolabs/types";
import * as sep24Module from "@/lib/anchor/sep24";

vi.mock("@/lib/anchor/sep24", async () => {
  const actual = await vi.importActual<typeof import("@/lib/anchor/sep24")>("@/lib/anchor/sep24");
  return {
    ...actual,
    verifySep24Transaction: vi.fn(),
  };
});

describe("Sep24InteractiveModal", () => {
  const mockSession: Sep0024InteractiveSession = {
    anchorDomain: "anchor.usd.example.com",
    assetCode: "USD",
    action: "deposit",
    interactiveUrl: "https://anchor.usd.example.com/sep24/interactive?id=tx123",
    transactionId: "tx123",
  };

  const defaultProps = {
    isOpen: true,
    session: mockSession,
    onClose: vi.fn(),
    onSuccess: vi.fn(),
    onRefreshBalance: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders modal with sandboxed iframe when open", () => {
    render(<Sep24InteractiveModal {...defaultProps} />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Deposit USD")).toBeInTheDocument();

    const iframe = screen.getByTitle("SEP-0024 deposit flow");
    expect(iframe).toBeInTheDocument();
    expect(iframe).toHaveAttribute("src", mockSession.interactiveUrl);
    expect(iframe).toHaveAttribute(
      "sandbox",
      "allow-scripts allow-same-origin allow-forms allow-popups"
    );
  });

  it("handles valid postMessage completion event after verifying status", async () => {
    vi.mocked(sep24Module.verifySep24Transaction).mockResolvedValueOnce({
      id: "tx123",
      status: "completed",
    });

    render(<Sep24InteractiveModal {...defaultProps} />);

    fireEvent(
      window,
      new MessageEvent("message", {
        origin: "https://anchor.usd.example.com",
        data: { type: "transaction_complete" },
      })
    );

    await waitFor(() => {
      expect(sep24Module.verifySep24Transaction).toHaveBeenCalledWith(
        "tx123",
        "anchor.usd.example.com",
        undefined
      );
      expect(defaultProps.onRefreshBalance).toHaveBeenCalled();
      expect(defaultProps.onSuccess).toHaveBeenCalledWith("tx123");
    });
  });

  it("ignores postMessage events from untrusted origins", async () => {
    render(<Sep24InteractiveModal {...defaultProps} />);

    fireEvent(
      window,
      new MessageEvent("message", {
        origin: "https://untrusted-attacker.com",
        data: { type: "transaction_complete" },
      })
    );

    expect(sep24Module.verifySep24Transaction).not.toHaveBeenCalled();
  });
});
