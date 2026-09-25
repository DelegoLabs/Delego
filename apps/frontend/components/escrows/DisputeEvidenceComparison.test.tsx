import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DisputeEvidenceComparison } from "./DisputeEvidenceComparison";
import type { DisputeEvidenceBundle } from "../../types/dispute-evidence";

describe("DisputeEvidenceComparison", () => {
  const mockEvidence: DisputeEvidenceBundle = {
    disputeId: "dispute-123",
    buyerStatement: "Item not received",
    buyerImages: ["https://example.com/image1.jpg"],
    merchantStatement: "Item was delivered",
    merchantImages: ["https://example.com/proof1.jpg"],
    status: "under_review",
  };

  it("renders buyer and merchant evidence sections", () => {
    render(<DisputeEvidenceComparison evidence={mockEvidence} />);
    
    expect(screen.getByText("Buyer Claim")).toBeInTheDocument();
    expect(screen.getByText("Merchant Response")).toBeInTheDocument();
    expect(screen.getByText("Item not received")).toBeInTheDocument();
    expect(screen.getByText("Item was delivered")).toBeInTheDocument();
  });

  it("displays status badge", () => {
    render(<DisputeEvidenceComparison evidence={mockEvidence} />);
    
    expect(screen.getByText("Under Review")).toBeInTheDocument();
  });

  it("renders countdown when deadline is provided", () => {
    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    render(
      <DisputeEvidenceComparison 
        evidence={mockEvidence} 
        resolutionDeadline={futureDate}
      />
    );
    
    expect(screen.getByRole("timer")).toBeInTheDocument();
  });

  it("does not render countdown for settled disputes", () => {
    const settledEvidence: DisputeEvidenceBundle = {
      ...mockEvidence,
      status: "settled",
    };
    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    
    render(
      <DisputeEvidenceComparison 
        evidence={settledEvidence} 
        resolutionDeadline={futureDate}
      />
    );
    
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  });

  it("shows no response message when merchant has not responded", () => {
    const noResponseEvidence: DisputeEvidenceBundle = {
      ...mockEvidence,
      merchantStatement: undefined,
      merchantImages: undefined,
    };
    
    render(<DisputeEvidenceComparison evidence={noResponseEvidence} />);
    
    expect(screen.getByText("Merchant has not yet provided a response.")).toBeInTheDocument();
  });

  it("renders request button for open disputes without merchant response", () => {
    const openEvidence: DisputeEvidenceBundle = {
      ...mockEvidence,
      status: "open",
      merchantStatement: undefined,
      merchantImages: undefined,
    };
    const mockCallback = vi.fn();
    
    render(
      <DisputeEvidenceComparison 
        evidence={openEvidence}
        onRequestMoreEvidence={mockCallback}
      />
    );
    
    expect(screen.getByText("Request Merchant Response")).toBeInTheDocument();
  });

  it("displays arbitrator verdict when available", () => {
    const evidenceWithVerdict: DisputeEvidenceBundle = {
      ...mockEvidence,
      arbitratorVerdict: "Ruling in favor of buyer",
      status: "settled",
    };
    
    render(<DisputeEvidenceComparison evidence={evidenceWithVerdict} />);
    
    expect(screen.getByText("Arbitrator Verdict")).toBeInTheDocument();
    expect(screen.getByText("Ruling in favor of buyer")).toBeInTheDocument();
  });

  it("renders image thumbnails for buyer evidence", () => {
    render(<DisputeEvidenceComparison evidence={mockEvidence} />);
    
    const buyerImages = screen.getAllByAltText(/Buyer evidence/);
    expect(buyerImages).toHaveLength(1);
  });

  it("renders image thumbnails for merchant evidence", () => {
    render(<DisputeEvidenceComparison evidence={mockEvidence} />);
    
    const merchantImages = screen.getAllByAltText(/Merchant proof/);
    expect(merchantImages).toHaveLength(1);
  });
});
