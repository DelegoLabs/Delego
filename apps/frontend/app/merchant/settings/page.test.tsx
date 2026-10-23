import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import MerchantSettingsPage from "./page";

describe("MerchantSettingsPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders the custom domain card alongside inventory settings", () => {
    render(<MerchantSettingsPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Merchant Settings" })
    ).toBeInTheDocument();
    expect(screen.getByTestId("custom-domain-card")).toBeInTheDocument();
    expect(screen.getByTestId("merchant-inventory-settings")).toBeInTheDocument();
  });
});
