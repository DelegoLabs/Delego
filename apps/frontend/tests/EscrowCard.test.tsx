import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { EscrowCard } from "../components/escrows/EscrowCard";
import type { Escrow } from "@delego/types";

const fundedEscrow: Escrow = {
  escrowId: "42",
  buyer: "GBVNN…EXAMPLE…BUYER",
  seller: "GCSV4…EXAMPLE…SELLER",
  token: "CAS3J…TOKEN…ADDR",
  amount: "15000000000", // 1,500 XLM
  status: "Funded",
  orderId: "0a1b2c3d4e5f6789abcdef0123456789abcdef0123456789abcdef0123456789",
  createdAt: "2026-07-20T10:00:00.000Z",
  timeoutLedger: 5_500_000,
  currentLedger: 5_499_000,
};

const releasedEscrow: Escrow = {
  ...fundedEscrow,
  escrowId: "99",
  status: "Released",
  currentLedger: undefined,
};

const refundedEscrow: Escrow = {
  ...fundedEscrow,
  escrowId: "7",
  status: "Refunded",
  currentLedger: undefined,
};

const disputedEscrow: Escrow = {
  ...fundedEscrow,
  escrowId: "3",
  status: "Disputed",
  currentLedger: undefined,
};

describe("EscrowCard", () => {
  it("renders the escrow ID", () => {
    render(<EscrowCard escrow={fundedEscrow} />);
    expect(screen.getByText(/Escrow #42/)).toBeInTheDocument();
  });

  it("renders the formatted amount", () => {
    render(<EscrowCard escrow={fundedEscrow} />);
    expect(screen.getByTestId("escrow-amount")).toHaveTextContent("1,500.00 XLM");
  });

  it("renders the status badge with correct label", () => {
    render(<EscrowCard escrow={fundedEscrow} />);
    const badge = screen.getByTestId("escrow-status-badge");
    expect(badge).toHaveTextContent("Funded");
  });

  it("shows Released badge when status is Released", () => {
    render(<EscrowCard escrow={releasedEscrow} />);
    expect(screen.getByTestId("escrow-status-badge")).toHaveTextContent("Released");
  });

  it("shows Refunded badge when status is Refunded", () => {
    render(<EscrowCard escrow={refundedEscrow} />);
    expect(screen.getByTestId("escrow-status-badge")).toHaveTextContent("Refunded");
  });

  it("shows Disputed badge when status is Disputed", () => {
    render(<EscrowCard escrow={disputedEscrow} />);
    expect(screen.getByTestId("escrow-status-badge")).toHaveTextContent("Disputed");
  });

  it("renders buyer and seller addresses shortened", () => {
    render(<EscrowCard escrow={fundedEscrow} />);
    expect(screen.getByText(/GBVNN…/)).toBeInTheDocument();
    expect(screen.getByText(/GCSV4…/)).toBeInTheDocument();
  });

  it("renders timeout countdown for funded escrows", () => {
    render(<EscrowCard escrow={fundedEscrow} />);
    const countdown = screen.getByTestId("escrow-countdown");
    expect(countdown).toBeInTheDocument();
    // 1,000 ledgers × 5s ≈ 1h 23m
    expect(countdown.textContent).toMatch(/~1h 23m/);
  });

  it("shows urgent countdown when less than 1 hour remains", () => {
    const urgentEscrow: Escrow = {
      ...fundedEscrow,
      timeoutLedger: 5_500_000,
      currentLedger: 5_499_950, // 50 ledgers ≈ 4m 10s
    };
    render(<EscrowCard escrow={urgentEscrow} />);
    const countdown = screen.getByTestId("escrow-countdown");
    expect(countdown).toHaveTextContent("Expiring soon:");
    expect(countdown).toHaveTextContent("~4m");
  });

  it("does not render countdown for non-funded escrows", () => {
    render(<EscrowCard escrow={releasedEscrow} />);
    expect(screen.queryByTestId("escrow-countdown")).not.toBeInTheDocument();
  });
});
