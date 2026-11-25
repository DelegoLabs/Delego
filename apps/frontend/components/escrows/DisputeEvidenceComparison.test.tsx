import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { http, HttpResponse } from "msw";
import { server } from "../../mocks/server";
import { DisputeEvidenceComparison } from "./DisputeEvidenceComparison";
import type { DisputeEvidenceBundle } from "../../types/dispute-evidence";
import messages from "../../messages/en.json";

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>
  );
}

describe("DisputeEvidenceComparison", () => {
  const mockEvidence: DisputeEvidenceBundle = {
    disputeId: "dispute-123",
    buyerStatement: "Item not received",
    buyerImages: ["https://example.com/image1.jpg"],
    merchantStatement: "Item was delivered",
    merchantImages: ["https://example.com/proof1.jpg"],
    resolutionDeadline: "2099-01-01T00:00:00.000Z",
    status: "under_review",
  };

  it("renders buyer and merchant evidence sections", () => {
    renderWithIntl(<DisputeEvidenceComparison evidence={mockEvidence} />);
    
    expect(screen.getByText("Buyer Claim")).toBeInTheDocument();
    expect(screen.getByText("Merchant Response")).toBeInTheDocument();
    expect(screen.getByText("Item not received")).toBeInTheDocument();
    expect(screen.getByText("Item was delivered")).toBeInTheDocument();
  });

  it("displays status badge", () => {
    renderWithIntl(<DisputeEvidenceComparison evidence={mockEvidence} />);
    
    expect(screen.getByText("Under Review")).toBeInTheDocument();
  });

  it("renders countdown when deadline is provided", () => {
    renderWithIntl(<DisputeEvidenceComparison evidence={mockEvidence} />);

    expect(screen.getByRole("timer")).toBeInTheDocument();
  });

  it("does not render countdown for settled disputes", () => {
    const settledEvidence: DisputeEvidenceBundle = {
      ...mockEvidence,
      status: "settled",
    };

    renderWithIntl(<DisputeEvidenceComparison evidence={settledEvidence} />);

    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  });

  it("shows no response message when merchant has not responded", () => {
    const noResponseEvidence: DisputeEvidenceBundle = {
      ...mockEvidence,
      merchantStatement: undefined,
      merchantImages: undefined,
    };
    
    renderWithIntl(<DisputeEvidenceComparison evidence={noResponseEvidence} />);
    
    expect(screen.getByText("Merchant has not yet provided a response.")).toBeInTheDocument();
  });

  it("renders request button for open disputes without merchant response", () => {
    const openEvidence: DisputeEvidenceBundle = {
      ...mockEvidence,
      status: "open",
      merchantStatement: undefined,
      merchantImages: undefined,
    };

    renderWithIntl(<DisputeEvidenceComparison evidence={openEvidence} />);

    expect(screen.getByText("Request Merchant Response")).toBeInTheDocument();
  });

  it("requests more evidence and shows confirmation feedback", async () => {
    const openEvidence: DisputeEvidenceBundle = {
      ...mockEvidence,
      status: "open",
      merchantStatement: undefined,
      merchantImages: undefined,
    };
    const requestMock = vi.fn();
    server.use(
      http.post("https://api.example.com/disputes/dispute-123/request-evidence", () => {
        requestMock();
        return HttpResponse.json({ data: { requested: true }, error: null });
      })
    );

    renderWithIntl(<DisputeEvidenceComparison evidence={openEvidence} />);
    await userEvent.click(screen.getByRole("button", { name: "Request Merchant Response" }));

    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Merchant response requested.")).toBeInTheDocument();
  });

  it("displays arbitrator verdict when available", () => {
    const evidenceWithVerdict: DisputeEvidenceBundle = {
      ...mockEvidence,
      arbitratorVerdict: "Ruling in favor of buyer",
      status: "settled",
    };
    
    renderWithIntl(<DisputeEvidenceComparison evidence={evidenceWithVerdict} />);
    
    expect(screen.getByText("Arbitrator Verdict")).toBeInTheDocument();
    expect(screen.getByText("Ruling in favor of buyer")).toBeInTheDocument();
  });

  it("renders image thumbnails for buyer evidence", () => {
    renderWithIntl(<DisputeEvidenceComparison evidence={mockEvidence} />);
    
    const buyerImages = screen.getAllByAltText(/Buyer evidence/);
    expect(buyerImages).toHaveLength(1);
  });

  it("renders image thumbnails for merchant evidence", () => {
    renderWithIntl(<DisputeEvidenceComparison evidence={mockEvidence} />);
    
    const merchantImages = screen.getAllByAltText(/Merchant proof/);
    expect(merchantImages).toHaveLength(1);
  });
});
