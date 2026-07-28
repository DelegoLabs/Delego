import React from "react";
import { act, render, screen } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GlobalSearch } from "./GlobalSearch";

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

  it("debounces input before filtering results", () => {
    render(<GlobalSearch />);

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
    render(<GlobalSearch />);

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
    render(<GlobalSearch />);

    const input = screen.getByRole("searchbox");
    fireEvent.change(input, { target: { value: "no-such-match" } });

    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_WAIT);
    });

    expect(screen.getByText(/no results found/i)).toBeDefined();
  });
});
