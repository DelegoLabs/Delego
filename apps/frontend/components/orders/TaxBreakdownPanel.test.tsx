import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { CurrencyProvider } from "../../hooks/useCurrency";
import { TaxBreakdownPanel } from "./TaxBreakdownPanel";
import { computeTaxBreakdown } from "../../lib/taxBreakdown";

const XLM = 10_000_000n;

function renderPanel(
  breakdown = computeTaxBreakdown({
    subtotalStroops: 100n * XLM,
    category: "electronics",
    jurisdictionCode: "EU",
  }),
  props: Partial<React.ComponentProps<typeof TaxBreakdownPanel>> = {}
) {
  return render(
    <CurrencyProvider>
      <TaxBreakdownPanel breakdown={breakdown} {...props} />
    </CurrencyProvider>
  );
}

describe("TaxBreakdownPanel", () => {
  it("always shows the base price, the tax line, and the total", () => {
    renderPanel();

    expect(screen.getByTestId("tax-subtotal")).toHaveTextContent(/^100\.00/);
    expect(screen.getByTestId("tax-rate")).toHaveTextContent("(20%)");
    expect(screen.getByTestId("tax-amount")).toHaveTextContent(/^20\.00/);
    expect(screen.getByTestId("tax-total")).toHaveTextContent(/^120\.00/);
  });

  it("keeps the detail section collapsed by default", () => {
    renderPanel();

    expect(screen.queryByTestId("tax-breakdown-detail")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Show tax details/ })
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("expands and collapses the detail section on click", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("button", { name: /Show tax details/ }));
    expect(screen.getByTestId("tax-breakdown-detail")).toBeInTheDocument();
    expect(screen.getByTestId("tax-jurisdiction")).toHaveTextContent("EU VAT");

    await user.click(screen.getByRole("button", { name: /Hide tax details/ }));
    expect(screen.queryByTestId("tax-breakdown-detail")).not.toBeInTheDocument();
  });

  it("starts expanded when defaultExpanded is set", () => {
    renderPanel(undefined, { defaultExpanded: true });
    expect(screen.getByTestId("tax-breakdown-detail")).toBeInTheDocument();
  });

  // ─── 0% for non-taxable digital goods (#723 acceptance criterion) ────────

  it("displays 0% tax for non-taxable digital goods", () => {
    renderPanel(
      computeTaxBreakdown({
        subtotalStroops: 100n * XLM,
        category: "digital",
        jurisdictionCode: "EU",
      })
    );

    expect(screen.getByTestId("tax-rate")).toHaveTextContent("(0%)");
    expect(screen.getByTestId("tax-amount")).toHaveTextContent(/^0\.00/);
    // Subtotal and total must match, since no tax is charged.
    expect(screen.getByTestId("tax-total")).toHaveTextContent(/^100\.00/);
  });

  it("says so explicitly in the detail view for non-taxable goods", async () => {
    const user = userEvent.setup();
    renderPanel(
      computeTaxBreakdown({
        subtotalStroops: 100n * XLM,
        category: "digital",
        jurisdictionCode: "EU",
      })
    );

    await user.click(screen.getByRole("button", { name: /Show tax details/ }));
    expect(screen.getByTestId("tax-jurisdiction")).toHaveTextContent(
      "Non-taxable digital goods"
    );
    expect(screen.getByTestId("tax-caveat")).toHaveTextContent(
      /no tax is charged/i
    );
  });

  it("labels the tax as an estimate at checkout", async () => {
    renderPanel(undefined, { defaultExpanded: true, variant: "checkout" });

    expect(screen.getByTestId("tax-caveat")).toHaveTextContent(/estimated/i);
    expect(screen.getByTestId("tax-caveat")).toHaveTextContent(/settlement/i);
  });

  it("omits the settlement caveat on a receipt", () => {
    renderPanel(undefined, { defaultExpanded: true, variant: "receipt" });
    expect(screen.getByTestId("tax-caveat")).not.toHaveTextContent(/settlement/i);
  });

  // ─── Network fee ──────────────────────────────────────────────────────────

  it("shows the network fee and marks it as excluded from tax", async () => {
    renderPanel(undefined, {
      networkFeeStroops: (2n * XLM).toString(),
      defaultExpanded: true,
    });

    expect(screen.getByTestId("tax-network-fee")).toHaveTextContent(/^2\.00/);
    expect(screen.getByText("Network fee (excluded from tax)")).toBeInTheDocument();
    // The total still excludes the fee — it is the taxable base plus tax only.
    expect(screen.getByTestId("tax-total")).toHaveTextContent(/^120\.00/);
  });

  it("hides the network-fee rows when there is no fee", () => {
    renderPanel(undefined, { networkFeeStroops: "0", defaultExpanded: true });
    expect(screen.queryByTestId("tax-network-fee")).not.toBeInTheDocument();
  });
});
