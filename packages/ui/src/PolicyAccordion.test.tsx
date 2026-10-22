import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { PolicyAccordion, type MerchantPolicyInfo } from "./PolicyAccordion";

const mockPolicy: MerchantPolicyInfo = {
  returnWindowDays: 30,
  restockingFeePercent: 10,
  freeShippingThresholdStroops: "500000000", // 50 XLM
  escrowProtectionNotice: "Your funds are securely held until you inspect your package and confirm delivery.",
};

describe("PolicyAccordion", () => {
  it("renders with no axe accessibility violations", async () => {
    const { container } = render(
      <PolicyAccordion
        policy={mockPolicy}
        merchantName="Acme Stellar Goods"
      />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("renders all four policy sections with appropriate headings", () => {
    render(<PolicyAccordion policy={mockPolicy} />);

    expect(screen.getByRole("heading", { name: /Delego Escrow Buyer Protection/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Returns & Refund Policy/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Warranty Information/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Fulfillment & Shipping Terms/i })).toBeInTheDocument();
  });

  it("highlights the Delego escrow buyer protection guarantee", () => {
    render(<PolicyAccordion policy={mockPolicy} />);

    // Delego Escrow guarantee badge
    expect(screen.getByText("Guaranteed")).toBeInTheDocument();
    expect(screen.getByText(/Delego Escrow Protection:/i)).toBeInTheDocument();
    expect(screen.getByText(mockPolicy.escrowProtectionNotice)).toBeInTheDocument();

    const escrowItem = screen.getByTestId("accordion-item-escrow");
    expect(escrowItem.style.border).toContain("rgb(16, 185, 129)"); // #10b981
  });

  it("populates merchant-specific return window and restocking fee", () => {
    render(<PolicyAccordion policy={mockPolicy} defaultOpenSectionId="returns" />);

    expect(screen.getByText(/30 calendar days from product delivery/i)).toBeInTheDocument();
    expect(screen.getByText(/10% restocking fee applied on returned items/i)).toBeInTheDocument();
  });

  it("displays 0% restocking fee when restockingFeePercent is 0", () => {
    const policyZeroFee: MerchantPolicyInfo = {
      ...mockPolicy,
      restockingFeePercent: 0,
    };
    render(<PolicyAccordion policy={policyZeroFee} defaultOpenSectionId="returns" />);

    expect(screen.getByText(/0% — No restocking fee on eligible returns/i)).toBeInTheDocument();
  });

  it("formats and displays free shipping threshold stroops", () => {
    render(<PolicyAccordion policy={mockPolicy} defaultOpenSectionId="fulfillment" />);

    expect(screen.getByText(/Free Shipping:/i)).toBeInTheDocument();
    expect(screen.getAllByText(/50\.00 XLM/i).length).toBeGreaterThanOrEqual(1);
  });

  it("displays custom warranty and fulfillment terms when provided", () => {
    render(
      <PolicyAccordion
        policy={mockPolicy}
        merchantName="Stellar Hardware"
        warrantyInfo="2-year limited manufacturer warranty on all electronic components."
        fulfillmentTerms="Same-day dispatch for orders placed before 2 PM UTC."
        defaultOpenSectionId="warranty"
      />
    );

    expect(
      screen.getByText("2-year limited manufacturer warranty on all electronic components.")
    ).toBeInTheDocument();
  });

  it("verifies ARIA expanded states and attributes", () => {
    render(<PolicyAccordion policy={mockPolicy} defaultOpenSectionId="escrow" />);

    const escrowBtn = screen.getByTestId("accordion-btn-escrow");
    const returnsBtn = screen.getByTestId("accordion-btn-returns");
    const warrantyBtn = screen.getByTestId("accordion-btn-warranty");
    const fulfillmentBtn = screen.getByTestId("accordion-btn-fulfillment");

    // Escrow is initially expanded
    expect(escrowBtn).toHaveAttribute("aria-expanded", "true");
    expect(returnsBtn).toHaveAttribute("aria-expanded", "false");
    expect(warrantyBtn).toHaveAttribute("aria-expanded", "false");
    expect(fulfillmentBtn).toHaveAttribute("aria-expanded", "false");

    // Check panels correspond to aria-controls
    const escrowPanel = screen.getByTestId("accordion-panel-escrow");
    expect(escrowBtn.getAttribute("aria-controls")).toBe(escrowPanel.id);
    expect(escrowPanel.getAttribute("aria-labelledby")).toBe(escrowBtn.id);
    expect(escrowPanel).not.toHaveAttribute("hidden");

    const returnsPanel = screen.getByTestId("accordion-panel-returns");
    expect(returnsPanel).toHaveAttribute("hidden");
  });

  it("toggles section expansion on click", () => {
    render(<PolicyAccordion policy={mockPolicy} defaultOpenSectionId="escrow" />);

    const returnsBtn = screen.getByTestId("accordion-btn-returns");
    const returnsPanel = screen.getByTestId("accordion-panel-returns");

    // Initially collapsed
    expect(returnsBtn).toHaveAttribute("aria-expanded", "false");
    expect(returnsPanel).toHaveAttribute("hidden");

    // Click to expand
    fireEvent.click(returnsBtn);
    expect(returnsBtn).toHaveAttribute("aria-expanded", "true");
    expect(returnsPanel).not.toHaveAttribute("hidden");

    // Click to collapse
    fireEvent.click(returnsBtn);
    expect(returnsBtn).toHaveAttribute("aria-expanded", "false");
    expect(returnsPanel).toHaveAttribute("hidden");
  });

  it("respects allowMultiple=false by closing other sections when opening a new one", () => {
    render(<PolicyAccordion policy={mockPolicy} defaultOpenSectionId="escrow" allowMultiple={false} />);

    const escrowBtn = screen.getByTestId("accordion-btn-escrow");
    const returnsBtn = screen.getByTestId("accordion-btn-returns");

    expect(escrowBtn).toHaveAttribute("aria-expanded", "true");
    expect(returnsBtn).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(returnsBtn);
    expect(escrowBtn).toHaveAttribute("aria-expanded", "false");
    expect(returnsBtn).toHaveAttribute("aria-expanded", "true");
  });

  it("supports keyboard navigation with ArrowDown, ArrowUp, Home, and End", async () => {
    const user = userEvent.setup();
    render(<PolicyAccordion policy={mockPolicy} />);

    const escrowBtn = screen.getByTestId("accordion-btn-escrow");
    const returnsBtn = screen.getByTestId("accordion-btn-returns");
    const warrantyBtn = screen.getByTestId("accordion-btn-warranty");
    const fulfillmentBtn = screen.getByTestId("accordion-btn-fulfillment");

    // Focus initial button
    escrowBtn.focus();
    expect(document.activeElement).toBe(escrowBtn);

    // ArrowDown -> next button (returns)
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(returnsBtn);

    // ArrowDown -> next button (warranty)
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(warrantyBtn);

    // ArrowDown -> next button (fulfillment)
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(fulfillmentBtn);

    // ArrowDown from last wraps to first (escrow)
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(escrowBtn);

    // ArrowUp from first wraps to last (fulfillment)
    await user.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(fulfillmentBtn);

    // ArrowUp -> warranty
    await user.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(warrantyBtn);

    // Home -> first button (escrow)
    await user.keyboard("{Home}");
    expect(document.activeElement).toBe(escrowBtn);

    // End -> last button (fulfillment)
    await user.keyboard("{End}");
    expect(document.activeElement).toBe(fulfillmentBtn);
  });

  it("supports Enter and Space to toggle accordion panels via keyboard", async () => {
    const user = userEvent.setup();
    render(<PolicyAccordion policy={mockPolicy} defaultOpenSectionId={null} />);

    const returnsBtn = screen.getByTestId("accordion-btn-returns");
    returnsBtn.focus();
    expect(returnsBtn).toHaveAttribute("aria-expanded", "false");

    // Press Enter to expand
    await user.keyboard("{Enter}");
    expect(returnsBtn).toHaveAttribute("aria-expanded", "true");

    // Press Space to collapse
    await user.keyboard(" ");
    expect(returnsBtn).toHaveAttribute("aria-expanded", "false");
  });

  it("honors custom headingLevel prop", () => {
    render(<PolicyAccordion policy={mockPolicy} headingLevel={4} />);

    expect(screen.getByRole("heading", { level: 4, name: /Delego Escrow Buyer Protection/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 3 })).not.toBeInTheDocument();
  });
});
