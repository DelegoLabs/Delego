import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConsentSettingsCard } from "./ConsentSettingsCard";

const mockSetCategory = vi.fn();
let mockConsentState: {
  preferences: { essential: true; productAnalytics: boolean; marketing: boolean };
  log: { timestamp: string; category: string; granted: boolean; source: string }[];
};
vi.mock("../../hooks/useConsent", () => ({
  useConsent: () => ({ ...mockConsentState, setCategory: mockSetCategory }),
}));

describe("ConsentSettingsCard (#612)", () => {
  beforeEach(() => {
    mockSetCategory.mockReset();
    mockConsentState = {
      preferences: { essential: true, productAnalytics: false, marketing: false },
      log: [],
    };
  });

  it("shows essential as always-on and disabled", () => {
    render(<ConsentSettingsCard />);
    const essential = screen.getByLabelText("Essential (always on)") as HTMLInputElement;
    expect(essential.checked).toBe(true);
    expect(essential).toBeDisabled();
  });

  it("reflects the current productAnalytics and marketing state", () => {
    mockConsentState.preferences = { essential: true, productAnalytics: true, marketing: false };
    render(<ConsentSettingsCard />);
    expect((screen.getByLabelText("Product analytics") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Marketing") as HTMLInputElement).checked).toBe(false);
  });

  it("toggling product analytics calls setCategory immediately", async () => {
    const user = userEvent.setup();
    render(<ConsentSettingsCard />);

    await user.click(screen.getByLabelText("Product analytics"));

    expect(mockSetCategory).toHaveBeenCalledWith("productAnalytics", true);
  });

  it("toggling marketing calls setCategory immediately", async () => {
    const user = userEvent.setup();
    render(<ConsentSettingsCard />);

    await user.click(screen.getByLabelText("Marketing"));

    expect(mockSetCategory).toHaveBeenCalledWith("marketing", true);
  });

  it("shows plain-language disclosures for each category", () => {
    render(<ConsentSettingsCard />);
    expect(screen.getByText(/Required for the app to function/)).toBeInTheDocument();
    expect(screen.getByText(/never your transaction details/)).toBeInTheDocument();
    expect(screen.getByText(/measure the effectiveness of marketing/)).toBeInTheDocument();
  });

  it("hides the consent history by default and reveals it on demand", async () => {
    mockConsentState.log = [
      { timestamp: "2026-01-01T00:00:00.000Z", category: "productAnalytics", granted: true, source: "settings" },
    ];
    const user = userEvent.setup();
    render(<ConsentSettingsCard />);

    expect(screen.queryByText(/Product analytics granted/)).toBeNull();

    await user.click(screen.getByRole("button", { name: "View consent history" }));

    expect(screen.getByText(/Product analytics granted/)).toBeInTheDocument();
  });

  it("shows a message when the log is empty", async () => {
    const user = userEvent.setup();
    render(<ConsentSettingsCard />);
    await user.click(screen.getByRole("button", { name: "View consent history" }));
    expect(screen.getByText("No consent changes recorded yet.")).toBeInTheDocument();
  });

  it("shows the most recent log entry first", async () => {
    mockConsentState.log = [
      { timestamp: "2026-01-01T00:00:00.000Z", category: "productAnalytics", granted: true, source: "settings" },
      { timestamp: "2026-01-02T00:00:00.000Z", category: "marketing", granted: true, source: "settings" },
    ];
    const user = userEvent.setup();
    render(<ConsentSettingsCard />);
    await user.click(screen.getByRole("button", { name: "View consent history" }));

    const entries = screen.getAllByText(/granted/);
    expect(entries[0]).toHaveTextContent("Marketing granted");
  });
});
