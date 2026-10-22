import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  QuorumApprovalChecklist,
  type QuorumSignerStatus,
} from "./QuorumApprovalChecklist";

describe("QuorumApprovalChecklist", () => {
  const sampleSigners: QuorumSignerStatus[] = [
    {
      signerAddress: "GBX11111111111111111111111111111111111111111111111111111",
      signerName: "Alice",
      hasSigned: true,
      signatureTimestamp: "2025-01-01T12:00:00Z",
    },
    {
      signerAddress: "GBX22222222222222222222222222222222222222222222222222222",
      signerName: "Bob",
      hasSigned: false,
    },
    {
      signerAddress: "GBX33333333333333333333333333333333333333333333333333333",
      signerName: "Charlie",
      hasSigned: false,
    },
  ];

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders authorized signers, signature status, and threshold progress", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ signers: sampleSigners }),
    } as Response);

    render(
      <QuorumApprovalChecklist
        requiredThreshold={2}
        signers={sampleSigners}
        orderId="order-123"
      />
    );

    expect(screen.getByTestId("quorum-threshold-badge")).toHaveTextContent("1 of 2 Required");
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();

    const cta = screen.getByTestId("execute-disbursement-cta");
    expect(cta).toBeDisabled();
  });

  it("enables Execute Disbursement CTA when threshold is met and verifies on-chain", async () => {
    const metSigners: QuorumSignerStatus[] = [
      { ...sampleSigners[0] },
      { ...sampleSigners[1], hasSigned: true, signatureTimestamp: "2025-01-01T12:05:00Z" },
      { ...sampleSigners[2] },
    ];

    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ signers: metSigners }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ verified: true }),
      } as Response);

    const onDisburse = vi.fn();

    render(
      <QuorumApprovalChecklist
        requiredThreshold={2}
        signers={metSigners}
        orderId="order-123"
        onDisburse={onDisburse}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId("quorum-threshold-badge")).toHaveTextContent("2 of 2 Required");
    });

    const cta = screen.getByTestId("execute-disbursement-cta");
    expect(cta).not.toBeDisabled();

    await userEvent.click(cta);

    await waitFor(() => {
      expect(onDisburse).toHaveBeenCalledWith("order-123");
    });
  });

  it("handles RPC errors gracefully during polling", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response);

    render(
      <QuorumApprovalChecklist
        requiredThreshold={2}
        signers={sampleSigners}
        orderId="order-123"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId("quorum-rpc-error")).toBeInTheDocument();
    });
  });
});
