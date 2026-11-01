import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MobileBottomNav, MobileNavItem } from "./MobileBottomNav";

// Mock next/navigation
const mockUsePathname = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}));

// Mock usePendingApprovalBadge
const mockUsePendingApprovalBadge = vi.fn();
vi.mock("../../hooks/usePendingApprovalBadge", () => ({
  usePendingApprovalBadge: () => mockUsePendingApprovalBadge(),
}));

describe("MobileBottomNav Component (Issue #1027)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePathname.mockReturnValue("/store");
    mockUsePendingApprovalBadge.mockReturnValue(0);
  });

  it("renders with md:hidden and pb-safe classes for mobile viewport isolation", () => {
    render(<MobileBottomNav />);
    const nav = screen.getByTestId("mobile-bottom-nav");
    expect(nav).toBeDefined();
    expect(nav.className).toContain("md:hidden");
    expect(nav.className).toContain("pb-safe");
    expect(nav.className).toContain("fixed");
    expect(nav.className).toContain("bottom-0");
  });

  it("renders default navigation items: Store, Orders, Cart, and Copilot", () => {
    render(<MobileBottomNav />);
    expect(screen.getByText("Store")).toBeDefined();
    expect(screen.getByText("Orders")).toBeDefined();
    expect(screen.getByText("Cart")).toBeDefined();
    expect(screen.getByText("Copilot")).toBeDefined();
  });

  it("highlights the active route based on the current pathname", () => {
    mockUsePathname.mockReturnValue("/orders");
    render(<MobileBottomNav />);

    const ordersTab = screen.getByTestId("mobile-nav-item-orders");
    const storeTab = screen.getByTestId("mobile-nav-item-store");

    expect(ordersTab.getAttribute("aria-current")).toBe("page");
    expect(ordersTab.className).toContain("active-nav-tab");
    expect(storeTab.getAttribute("aria-current")).toBeNull();
  });

  it("renders the badge count on Orders when pending approvals exist", () => {
    mockUsePendingApprovalBadge.mockReturnValue(3);
    render(<MobileBottomNav />);

    const badge = screen.getByTestId("badge-orders");
    expect(badge).toBeDefined();
    expect(badge.textContent).toBe("3");
    expect(badge.getAttribute("aria-label")).toContain("3 pending approvals");
  });

  it("caps badge display at 99+ when pending approvals exceed 99", () => {
    mockUsePendingApprovalBadge.mockReturnValue(125);
    render(<MobileBottomNav />);

    const badge = screen.getByTestId("badge-orders");
    expect(badge.textContent).toBe("99+");
  });

  it("does not render any badge when pending approvals count is 0", () => {
    mockUsePendingApprovalBadge.mockReturnValue(0);
    render(<MobileBottomNav />);

    expect(screen.queryByTestId("badge-orders")).toBeNull();
  });

  it("supports custom navigation items and invokes onItemClick callback", () => {
    const handleClick = vi.fn();
    const customItems: MobileNavItem[] = [
      { label: "Home", icon: "🏠", route: "/", isActive: true },
      { label: "Profile", icon: "👤", route: "/profile", badgeCount: 2, isActive: false },
    ];

    render(<MobileBottomNav items={customItems} onItemClick={handleClick} />);

    expect(screen.getByText("Home")).toBeDefined();
    expect(screen.getByText("Profile")).toBeDefined();
    expect(screen.getByText("2")).toBeDefined();

    const profileTab = screen.getByTestId("mobile-nav-item-profile");
    fireEvent.click(profileTab);

    expect(handleClick).toHaveBeenCalledTimes(1);
    expect(handleClick).toHaveBeenCalledWith(
      expect.objectContaining({ label: "Profile", route: "/profile" })
    );
  });
});
