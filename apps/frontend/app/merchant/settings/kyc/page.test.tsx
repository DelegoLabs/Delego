import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "../../../../messages/en.json";
import MerchantKycSettingsPage from "./page";

function renderPage() {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <MerchantKycSettingsPage />
    </NextIntlClientProvider>
  );
}

describe("MerchantKycSettingsPage (#1013)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders the three tier requirements with a domain verification link", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Identity verification" })).toBeInTheDocument();
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining("Email address verified"),
      expect.stringContaining("Business domain verified"),
      expect.stringContaining("On-chain business entity verified"),
    ]);
    expect(screen.getByRole("link", { name: "Verify now: Business domain verified" })).toHaveAttribute(
      "href",
      "/merchant/register"
    );
  });

  it("reflects a domain verified during onboarding", async () => {
    window.localStorage.setItem("delego_merchant_onboarding", JSON.stringify({ isDomainVerified: true }));
    renderPage();
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    await screen.findByText("1 of 3 verifications complete");
    expect(items[1]).toHaveAttribute("data-state", "verified");
  });
});
