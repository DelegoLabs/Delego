import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConsentBanner } from "./ConsentBanner";

const mockHasConsentChoice = vi.fn();
const mockAcceptAllConsent = vi.fn();
const mockAcceptEssentialOnlyConsent = vi.fn();
vi.mock("../../lib/consent", () => ({
  hasConsentChoice: () => mockHasConsentChoice(),
  acceptAllConsent: () => mockAcceptAllConsent(),
  acceptEssentialOnlyConsent: () => mockAcceptEssentialOnlyConsent(),
}));

describe("ConsentBanner (#612)", () => {
  beforeEach(() => {
    mockHasConsentChoice.mockReset();
    mockAcceptAllConsent.mockReset();
    mockAcceptEssentialOnlyConsent.mockReset();
  });

  it("renders nothing once a choice has already been made", async () => {
    mockHasConsentChoice.mockReturnValue(true);
    const { container } = render(<ConsentBanner />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("shows the banner on first run, before any choice", async () => {
    mockHasConsentChoice.mockReturnValue(false);
    render(<ConsentBanner />);
    await waitFor(() =>
      expect(screen.getByRole("region", { name: "Privacy preferences" })).toBeInTheDocument()
    );
  });

  it("is non-modal: renders alongside other content rather than blocking it", async () => {
    mockHasConsentChoice.mockReturnValue(false);
    render(
      <div>
        <ConsentBanner />
        <button type="button">Somewhere else on the page</button>
      </div>
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Somewhere else on the page" })).toBeEnabled()
    );
  });

  it("Accept all records consent and dismisses the banner", async () => {
    mockHasConsentChoice.mockReturnValue(false);
    const user = userEvent.setup();
    render(<ConsentBanner />);
    await waitFor(() => screen.getByRole("button", { name: "Accept all" }));

    await user.click(screen.getByRole("button", { name: "Accept all" }));

    expect(mockAcceptAllConsent).toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: "Privacy preferences" })).toBeNull();
  });

  it("dismissing via Essential only records essential-only consent", async () => {
    mockHasConsentChoice.mockReturnValue(false);
    const user = userEvent.setup();
    render(<ConsentBanner />);
    await waitFor(() => screen.getByRole("button", { name: "Essential only" }));

    await user.click(screen.getByRole("button", { name: "Essential only" }));

    expect(mockAcceptEssentialOnlyConsent).toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: "Privacy preferences" })).toBeNull();
  });

  it("Customize links to Settings", async () => {
    mockHasConsentChoice.mockReturnValue(false);
    render(<ConsentBanner />);
    await waitFor(() => screen.getByRole("link", { name: "Customize" }));
    expect(screen.getByRole("link", { name: "Customize" })).toHaveAttribute("href", "/settings");
  });
});
