import React from "react";
import { act, render, screen } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GlobalSearch } from "./GlobalSearch";
import { ThemeProvider } from "../../context/ThemeContext";

const DEBOUNCE_WAIT = 300;

const mockDelegations = [
  {
    id: "deleg-abc123",
    userId: "user-1",
    agentId: "agent-1",
    status: "active",
    policy: {
      maxPerTransaction: 1000n,
      maxTotal: 5000n,
      allowedMerchants: [],
      expiresAt: null,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

const mockOrders = [
  {
    id: "order-abc123",
    userId: "user-1",
    delegationId: "deleg-abc123",
    merchantId: "merchant-1",
    status: "settled",
    lineItems: [],
    totalStroops: 100n,
    escrowContractId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

vi.mock("../../hooks/useDelegations", () => ({
  useDelegations: () => ({
    delegations: mockDelegations,
    loading: false,
    error: null,
  }),
}));

vi.mock("../../hooks/useOrders", () => ({
  useOrders: () => ({
    orders: mockOrders,
    loading: false,
    error: null,
  }),
}));

describe("GlobalSearch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const renderWithTheme = (ui: React.ReactElement) =>
    render(<ThemeProvider>{ui}</ThemeProvider>);

  it("debounces input before filtering results", () => {
    renderWithTheme(<GlobalSearch />);

    const input = screen.getByRole("searchbox");
    fireEvent.change(input, { target: { value: "abc123" } });

    // Immediately after typing, the debounce window has not elapsed yet.
    expect(screen.queryByRole("listbox")).toBeNull();

    // Advance partway through the debounce window — still no results.
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.queryByRole("listbox")).toBeNull();

    // Advance past the debounce window — results now render.
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.getByRole("listbox")).toBeDefined();
  });

  it("shows results grouped by entity type", () => {
    renderWithTheme(<GlobalSearch />);

    const input = screen.getByRole("searchbox");
    fireEvent.change(input, { target: { value: "abc123" } });

    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_WAIT);
    });

    expect(screen.getByText("Delegations")).toBeDefined();
    expect(screen.getByText("Orders")).toBeDefined();
    expect(screen.getByText(/Delegation deleg-abc123/)).toBeDefined();
    expect(screen.getByText(/Order order-abc123/)).toBeDefined();
  });

  it("shows an empty state when no results match", () => {
    renderWithTheme(<GlobalSearch />);

    const input = screen.getByRole("searchbox");
    fireEvent.change(input, { target: { value: "no-such-match" } });

    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_WAIT);
    });

    expect(screen.getByText(/no results found/i)).toBeDefined();
  });

  it("applies the dark theme class when theme is set to dark", () => {
    localStorage.setItem("theme", "dark");
    renderWithTheme(<GlobalSearch />);

    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("applies the high-contrast theme class when theme is set to high-contrast", () => {
    localStorage.setItem("theme", "high-contrast");
    renderWithTheme(<GlobalSearch />);

    expect(
      document.documentElement.classList.contains("high-contrast"),
    ).toBe(true);
  });

  it("resolves system preference to dark when prefers-color-scheme is dark", () => {
    localStorage.setItem("theme", "system");
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === "(prefers-color-scheme: dark)",
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    renderWithTheme(<GlobalSearch />);

    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("persists the theme selection to localStorage", () => {
    localStorage.setItem("theme", "light");
    renderWithTheme(<GlobalSearch />);

    expect(localStorage.getItem("theme")).toBe("light");
  });
});
