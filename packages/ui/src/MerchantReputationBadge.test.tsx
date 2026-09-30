import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MerchantReputationBadge } from "./MerchantReputationBadge.js";

describe("MerchantReputationBadge", () => {
  it("exposes the score, order count and verification in its accessible label", () => {
    render(<MerchantReputationBadge score={92} totalOrdersCompleted={12} isVerified />);
    const badge = screen.getByRole("img");
    const label = badge.getAttribute("aria-label") ?? "";
    expect(label).toContain("Reputation score 92/100");
    expect(label).toContain("12 completed on-chain orders");
    expect(label).toContain("Merchant identity is verified.");
    expect(badge.getAttribute("title")).toBe(label);
  });

  it("uses singular wording for a single completed order and omits verification", () => {
    render(<MerchantReputationBadge score={80} totalOrdersCompleted={1} isVerified={false} />);
    const label = screen.getByRole("img").getAttribute("aria-label") ?? "";
    expect(label).toContain("1 completed on-chain order (");
    expect(label).not.toContain("Merchant identity is verified.");
  });

  it("clamps a score above 100", () => {
    render(<MerchantReputationBadge score={140} totalOrdersCompleted={3} isVerified />);
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("score 100/100");
  });

  it("clamps a negative score to zero", () => {
    render(<MerchantReputationBadge score={-20} totalOrdersCompleted={0} isVerified={false} />);
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("score 0/100");
  });

  it("renders a badge for every score tier", () => {
    render(
      <>
        <MerchantReputationBadge score={95} totalOrdersCompleted={5} isVerified />
        <MerchantReputationBadge score={80} totalOrdersCompleted={5} isVerified />
        <MerchantReputationBadge score={60} totalOrdersCompleted={5} isVerified />
        <MerchantReputationBadge score={20} totalOrdersCompleted={5} isVerified />
      </>
    );
    expect(screen.getAllByRole("img")).toHaveLength(4);
    expect(screen.getByText("95")).toBeDefined();
    expect(screen.getByText("80")).toBeDefined();
    expect(screen.getByText("60")).toBeDefined();
    expect(screen.getByText("20")).toBeDefined();
  });

  it("shows a check mark only for verified merchants", () => {
    render(
      <>
        <MerchantReputationBadge score={70} totalOrdersCompleted={2} isVerified />
        <MerchantReputationBadge score={70} totalOrdersCompleted={2} isVerified={false} />
      </>
    );
    expect(screen.getAllByText("✓")).toHaveLength(1);
  });

  it("supports the small, medium and large sizes", () => {
    render(
      <>
        <MerchantReputationBadge score={70} totalOrdersCompleted={2} isVerified size="sm" />
        <MerchantReputationBadge score={70} totalOrdersCompleted={2} isVerified size="md" />
        <MerchantReputationBadge score={70} totalOrdersCompleted={2} isVerified size="lg" />
      </>
    );
    expect(screen.getAllByRole("img")).toHaveLength(3);
  });
});
