import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import { MobileBottomNav } from "./MobileBottomNav";
import messages from "../../messages/en.json";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const mockPathname = vi.fn(() => "/");
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname(),
}));

const mockOpenDrawer = vi.fn();
const mockSummary = { totalQuantity: 0 };
let mockDrawerOpen = false;
vi.mock("../../hooks/useCart", () => ({
  useCart: () => ({
    summary: mockSummary,
    openDrawer: mockOpenDrawer,
    drawerOpen: mockDrawerOpen,
  }),
}));

// NavPendingBadge reads from usePendingApprovalBadge — keep it silent.
vi.mock("../../hooks/usePendingApprovalBadge", () => ({
  usePendingApprovalBadge: () => 0,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderNav() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <MobileBottomNav />
    </NextIntlClientProvider>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MobileBottomNav", () => {
  beforeEach(() => {
    mockPathname.mockReturnValue("/");
    mockSummary.totalQuantity = 0;
    mockDrawerOpen = false;
    mockOpenDrawer.mockReset();
  });

  it("renders the four quick-action destinations", () => {
    renderNav();
    expect(screen.getByTestId("mobile-bottom-nav-store")).toBeInTheDocument();
    expect(screen.getByTestId("mobile-bottom-nav-orders")).toBeInTheDocument();
    expect(screen.getByTestId("mobile-bottom-nav-cart")).toBeInTheDocument();
    expect(screen.getByTestId("mobile-bottom-nav-copilot")).toBeInTheDocument();
  });

  it("marks the Store link active when pathname is /store", () => {
    mockPathname.mockReturnValue("/store");
    renderNav();
    const storeLink = screen.getByTestId("mobile-bottom-nav-store");
    expect(storeLink).toHaveClass("mobile-bottom-nav__item--active");
    expect(storeLink).toHaveAttribute("aria-current", "page");
  });

  it("marks the Store link active on a nested /store/* route", () => {
    mockPathname.mockReturnValue("/store/merchant-1");
    renderNav();
    const storeLink = screen.getByTestId("mobile-bottom-nav-store");
    expect(storeLink).toHaveClass("mobile-bottom-nav__item--active");
    expect(storeLink).toHaveAttribute("aria-current", "page");
  });

  it("marks the Cart button active when the cart drawer is open", () => {
    mockDrawerOpen = true;
    renderNav();
    expect(screen.getByTestId("mobile-bottom-nav-cart")).toHaveClass(
      "mobile-bottom-nav__item--active"
    );
  });

  it("marks the Orders link active when pathname is /orders", () => {
    mockPathname.mockReturnValue("/orders");
    renderNav();
    const ordersLink = screen.getByTestId("mobile-bottom-nav-orders");
    expect(ordersLink).toHaveClass("mobile-bottom-nav__item--active");
    expect(ordersLink).toHaveAttribute("aria-current", "page");
  });

  it("marks the Orders link active on a nested /orders/* route", () => {
    mockPathname.mockReturnValue("/orders/abc-123");
    renderNav();
    expect(screen.getByTestId("mobile-bottom-nav-orders")).toHaveClass(
      "mobile-bottom-nav__item--active"
    );
  });

  it("does not mark any item active when no route matches", () => {
    mockPathname.mockReturnValue("/settings");
    renderNav();
    expect(screen.getByTestId("mobile-bottom-nav-store")).not.toHaveClass(
      "mobile-bottom-nav__item--active"
    );
    expect(screen.getByTestId("mobile-bottom-nav-orders")).not.toHaveClass(
      "mobile-bottom-nav__item--active"
    );
    expect(screen.getByTestId("mobile-bottom-nav-cart")).not.toHaveClass(
      "mobile-bottom-nav__item--active"
    );
  });

  it("hides the cart badge when the cart is empty", () => {
    mockSummary.totalQuantity = 0;
    renderNav();
    expect(
      screen.queryByTestId("mobile-bottom-nav-cart-badge")
    ).not.toBeInTheDocument();
  });

  it("shows the cart badge with the item count when cart has items", () => {
    mockSummary.totalQuantity = 3;
    renderNav();
    const badge = screen.getByTestId("mobile-bottom-nav-cart-badge");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("3");
  });

  it("caps the cart badge at 99+ for large counts", () => {
    mockSummary.totalQuantity = 150;
    renderNav();
    expect(screen.getByTestId("mobile-bottom-nav-cart-badge")).toHaveTextContent(
      "99+"
    );
  });

  it("calls openDrawer when the Cart button is tapped", () => {
    renderNav();
    fireEvent.click(screen.getByTestId("mobile-bottom-nav-cart"));
    expect(mockOpenDrawer).toHaveBeenCalledTimes(1);
  });

  it("dispatches the open-agent event when Copilot is tapped", () => {
    const listener = vi.fn();
    window.addEventListener("open-agent", listener);
    renderNav();
    fireEvent.click(screen.getByTestId("mobile-bottom-nav-copilot"));
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener("open-agent", listener);
  });

  it("renders the accessible nav landmark with an aria-label", () => {
    renderNav();
    expect(
      screen.getByRole("navigation", { name: /bottom navigation/i })
    ).toBeInTheDocument();
  });
});
