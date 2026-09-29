import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { VerificationBadge } from "./VerificationBadge.js";

describe("VerificationBadge", () => {
  it("has no accessibility violations", async () => {
    const { container } = render(
      <>
        <VerificationBadge tier="verified" reputationScoreBps={9850} />
        <VerificationBadge tier="gold" reputationScoreBps={9900} />
        <VerificationBadge tier="pro" reputationScoreBps={9999} />
      </>
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("renders verified tier correctly", () => {
    render(<VerificationBadge tier="verified" reputationScoreBps={9850} />);
    const badge = screen.getByTestId("verification-badge-verified");
    expect(badge).toBeDefined();
    expect(badge.textContent).toBe("Verified Merchant");
  });

  it("renders gold tier correctly", () => {
    render(<VerificationBadge tier="gold" reputationScoreBps={9900} />);
    const badge = screen.getByTestId("verification-badge-gold");
    expect(badge).toBeDefined();
    expect(badge.textContent).toBe("Top Rated");
  });

  it("renders pro tier correctly", () => {
    render(<VerificationBadge tier="pro" reputationScoreBps={9999} />);
    const badge = screen.getByTestId("verification-badge-pro");
    expect(badge).toBeDefined();
    expect(badge.textContent).toBe("Fast Shipper");
  });

  it("renders tooltip with calculated percentage", () => {
    render(<VerificationBadge tier="verified" reputationScoreBps={9850} />);
    const badge = screen.getByTestId("verification-badge-verified");
    // 9850 bps = 98.50%
    expect(badge.getAttribute("title")).toBe("Verified Merchant: Requires a solid track record. Current reputation score is 98.50%.");
    expect(badge.getAttribute("aria-label")).toBe("Verified Merchant: Requires a solid track record. Current reputation score is 98.50%.");
  });

  it("hides tooltip when showTooltip is false", () => {
    render(<VerificationBadge tier="verified" reputationScoreBps={9850} showTooltip={false} />);
    const badge = screen.getByTestId("verification-badge-verified");
    expect(badge.hasAttribute("title")).toBe(false);
    expect(badge.getAttribute("aria-label")).toBe("Verified Merchant");
  });
});
