// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import DemoEntryPage from "./page";
import { isDemoMode } from "../../lib/demoMode";

const { mockReplace, mockPush, searchState } = vi.hoisted(() => ({
  mockReplace: vi.fn(),
  mockPush: vi.fn(),
  searchState: { value: "" },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  useSearchParams: () => new URLSearchParams(searchState.value),
}));

describe("DemoEntryPage", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    searchState.value = "";
    mockReplace.mockClear();
    mockPush.mockClear();
  });

  it("turns on demo mode and redirects to the dashboard for ?auto=1", async () => {
    searchState.value = "?auto=1";
    render(<DemoEntryPage />);

    await waitFor(() => expect(isDemoMode()).toBe(true));
    expect(mockReplace).toHaveBeenCalledWith("/");
    expect(
      screen.queryByRole("button", { name: /buyer dashboard/i })
    ).toBeNull();
  });

  it("waits for the evaluator to choose a scenario", () => {
    render(<DemoEntryPage />);

    expect(
      screen.getByRole("heading", { name: /explore the delego demo/i })
    ).toBeDefined();
    expect(
      screen.getByRole("button", { name: /buyer dashboard/i })
    ).toBeDefined();
    expect(
      screen.getByRole("button", { name: /merchant portal/i })
    ).toBeDefined();
    expect(
      screen.getByRole("button", { name: /dispute review/i })
    ).toBeDefined();
    expect(isDemoMode()).toBe(false);
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it.each([
    ["Buyer Dashboard", "/"],
    ["Merchant Portal", "/merchant"],
    ["Dispute Review", "/escrows"],
  ])("enables demo mode and launches %s", (name, href) => {
    render(<DemoEntryPage />);

    fireEvent.click(
      screen.getByRole("button", { name: new RegExp(name, "i") })
    );

    expect(isDemoMode()).toBe(true);
    expect(mockPush).toHaveBeenCalledWith(href);
  });
});
