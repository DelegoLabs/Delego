import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DisputeEvidenceClient } from "./DisputeEvidenceClient";
import type { DisputeEvidenceBundle } from "../../../../types/dispute-evidence";

const apiFetchMock = vi.fn();

vi.mock("../../../../lib/apiFetch", () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

const sampleEvidence: DisputeEvidenceBundle = {
  disputeId: "dispute-42",
  buyerStatement: "Package arrived empty.",
  buyerImages: ["https://cdn.example.com/buyer-1.jpg"],
  status: "open",
  resolutionDeadline: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
};

describe("DisputeEvidenceClient", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it("shows loading state and then renders fetched evidence bundle", async () => {
    apiFetchMock.mockResolvedValueOnce({ data: sampleEvidence, error: null });

    render(<DisputeEvidenceClient escrowId="escrow-42" />);

    expect(screen.getByText(/Loading dispute evidence/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Package arrived empty.")).toBeInTheDocument();
    });

    expect(apiFetchMock).toHaveBeenCalledWith("/escrows/escrow-42/evidence");
  });

  it("renders not-found state when API returns 404 or null", async () => {
    apiFetchMock.mockResolvedValueOnce({
      data: null,
      error: { code: "404", message: "Not found" },
    });

    render(<DisputeEvidenceClient escrowId="escrow-missing" />);

    await waitFor(() => {
      expect(screen.getByText("Dispute evidence not found")).toBeInTheDocument();
    });
  });

  it("renders error state and allows retrying", async () => {
    const user = userEvent.setup();
    apiFetchMock
      .mockResolvedValueOnce({
        data: null,
        error: { code: "500", message: "Upstream failure" },
      })
      .mockResolvedValueOnce({ data: sampleEvidence, error: null });

    render(<DisputeEvidenceClient escrowId="escrow-42" />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Upstream failure");
    });

    await user.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(screen.getByText("Package arrived empty.")).toBeInTheDocument();
    });
    expect(apiFetchMock).toHaveBeenCalledTimes(2);
  });

  it("triggers POST mutation and displays confirmation banner on Request Merchant Response", async () => {
    const user = userEvent.setup();
    apiFetchMock
      .mockResolvedValueOnce({ data: sampleEvidence, error: null })
      .mockResolvedValueOnce({
        data: { message: "Merchant notified for more evidence." },
        error: null,
      });

    render(<DisputeEvidenceClient escrowId="escrow-42" />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Request Merchant Response" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Request Merchant Response" }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("Merchant notified for more evidence.");
    });

    expect(apiFetchMock).toHaveBeenLastCalledWith("/escrows/escrow-42/evidence/request", {
      method: "POST",
      body: JSON.stringify({ disputeId: "dispute-42" }),
    });
  });

  it("shows error banner when Request Merchant Response fails", async () => {
    const user = userEvent.setup();
    apiFetchMock
      .mockResolvedValueOnce({ data: sampleEvidence, error: null })
      .mockResolvedValueOnce({
        data: null,
        error: { code: "403", message: "Not authorized to request evidence" },
      });

    render(<DisputeEvidenceClient escrowId="escrow-42" />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Request Merchant Response" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Request Merchant Response" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Not authorized to request evidence");
    });
  });
});
