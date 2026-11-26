import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import StoreDirectoryPage from "./page";
import { useMerchantDirectory } from "../../hooks/useMerchantDirectory";

vi.mock("../../hooks/useMerchantDirectory", () => ({
  useMerchantDirectory: vi.fn(),
}));

describe("StoreDirectoryPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders loading skeletons while directory is loading", () => {
    vi.mocked(useMerchantDirectory).mockReturnValue({
      merchants: [],
      loading: true,
      error: null,
    });

    render(<StoreDirectoryPage />);
    expect(screen.getByLabelText("Loading merchants")).toBeTruthy();
  });

  it("renders error alert when directory fails to load", () => {
    vi.mocked(useMerchantDirectory).mockReturnValue({
      merchants: [],
      loading: false,
      error: "Failed to load merchant directory (500)",
    });

    render(<StoreDirectoryPage />);
    expect(screen.getByRole("alert").textContent).toContain(
      "Unable to load merchants"
    );
  });

  it("lists merchants with links to /store/[merchantId] and supports search and category filter", () => {
    vi.mocked(useMerchantDirectory).mockReturnValue({
      merchants: [
        {
          id: "acme-coffee",
          name: "Acme Coffee",
          category: "Food & Drink",
          description: "Specialty roasted beans",
        },
        {
          id: "stellar-gear",
          name: "Stellar Gear",
          category: "Hardware",
        },
      ],
      loading: false,
      error: null,
    });

    render(<StoreDirectoryPage />);

    expect(screen.getByText("Acme Coffee")).toBeTruthy();
    expect(screen.getByText("Stellar Gear")).toBeTruthy();

    const links = screen.getAllByRole("link", { name: /^Visit / });
    expect(links.map((el) => el.getAttribute("href"))).toEqual([
      "/store/acme-coffee",
      "/store/stellar-gear",
    ]);

    // Filter by category
    const categorySelect = screen.getByLabelText("Category");
    fireEvent.change(categorySelect, { target: { value: "Hardware" } });
    expect(screen.queryByText("Acme Coffee")).toBeNull();
    expect(screen.getByText("Stellar Gear")).toBeTruthy();

    // Filter by search with no match and clear filters
    const searchInput = screen.getByLabelText("Search merchants");
    fireEvent.change(searchInput, { target: { value: "nonexistent" } });
    expect(
      screen.getByText(
        "No merchants match your filters. Try a different search or clear filters."
      )
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByText("Acme Coffee")).toBeTruthy();
    expect(screen.getByText("Stellar Gear")).toBeTruthy();
  });
});
