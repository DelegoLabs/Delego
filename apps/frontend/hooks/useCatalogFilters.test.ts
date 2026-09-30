import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useCatalogFilters } from "./useCatalogFilters";

// ---------------------------------------------------------------------------
// Mock next/navigation
// ---------------------------------------------------------------------------

const mockPush = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/merchant/catalog",
  useSearchParams: () => mockSearchParams,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setup(qs = "") {
  mockSearchParams = new URLSearchParams(qs);
  return renderHook(() => useCatalogFilters());
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useCatalogFilters", () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockSearchParams = new URLSearchParams();
  });

  it("starts at the default filter state and reports hydrated after mount", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    expect(result.current.filters.categories).toEqual([]);
    expect(result.current.filters.inStockOnly).toBe(false);
    expect(result.current.filters.minPrice).toBeUndefined();
    expect(result.current.filters.maxPrice).toBeUndefined();
    expect(result.current.filters.minRating).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // URL → filter state (hydration)
  // -------------------------------------------------------------------------

  it("restores filter state from URL params on hydration", async () => {
    const { result } = setup("cat=Electronics%2CClothing&minPrice=100&maxPrice=500&inStock=1&minRating=4");
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    expect(result.current.filters.categories).toEqual(["Electronics", "Clothing"]);
    expect(result.current.filters.minPrice).toBe(100);
    expect(result.current.filters.maxPrice).toBe(500);
    expect(result.current.filters.inStockOnly).toBe(true);
    expect(result.current.filters.minRating).toBe(4);
  });

  it("restores a single category correctly", async () => {
    const { result } = setup("cat=Electronics");
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.filters.categories).toEqual(["Electronics"]);
  });

  it("handles invalid URL params without crashing (falls back to defaults)", async () => {
    const { result } = setup("minPrice=not-a-number&maxPrice=-100&minRating=9&inStock=yes");
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    expect(result.current.filters.minPrice).toBeUndefined();
    expect(result.current.filters.maxPrice).toBeUndefined();
    expect(result.current.filters.minRating).toBeUndefined();
    expect(result.current.filters.inStockOnly).toBe(false);
  });

  // -------------------------------------------------------------------------
  // filter state → URL (setFilters)
  // -------------------------------------------------------------------------

  it("pushes updated URL when setFilters is called with categories", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => {
      result.current.setFilters({ categories: ["Electronics"] });
    });

    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining("cat=Electronics"),
      { scroll: false }
    );
  });

  it("pushes updated URL with inStock=1 when inStockOnly is set", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => {
      result.current.setFilters({ inStockOnly: true });
    });

    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining("inStock=1"),
      { scroll: false }
    );
  });

  it("pushes updated URL with minPrice and maxPrice when set", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => {
      result.current.setFilters({ minPrice: 50, maxPrice: 200 });
    });

    const calledUrl: string = mockPush.mock.calls[0][0] as string;
    expect(calledUrl).toContain("minPrice=50");
    expect(calledUrl).toContain("maxPrice=200");
  });

  it("pushes updated URL with minRating when set", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => {
      result.current.setFilters({ minRating: 3 });
    });

    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining("minRating=3"),
      { scroll: false }
    );
  });

  it("removes filter params from the URL when setFilters clears them", async () => {
    const { result } = setup("inStock=1&minRating=4");
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => {
      result.current.setFilters({ inStockOnly: false, minRating: undefined });
    });

    const calledUrl: string = mockPush.mock.calls[0][0] as string;
    expect(calledUrl).not.toContain("inStock");
    expect(calledUrl).not.toContain("minRating");
  });

  // -------------------------------------------------------------------------
  // Multiple categories
  // -------------------------------------------------------------------------

  it("encodes multiple categories as a comma-separated cat param", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => {
      result.current.setFilters({ categories: ["Electronics", "Clothing"] });
    });

    const calledUrl: string = mockPush.mock.calls[0][0] as string;
    // The param value is URL-encoded, so commas might be %2C
    expect(calledUrl).toContain("cat=");
    expect(decodeURIComponent(calledUrl)).toContain("cat=Electronics,Clothing");
  });

  // -------------------------------------------------------------------------
  // Reset
  // -------------------------------------------------------------------------

  it("clears all filter params from the URL on resetFilters", async () => {
    const { result } = setup("cat=Electronics&inStock=1&minRating=3");
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => {
      result.current.resetFilters();
    });

    const calledUrl: string = mockPush.mock.calls[0][0] as string;
    expect(calledUrl).not.toContain("cat=");
    expect(calledUrl).not.toContain("inStock");
    expect(calledUrl).not.toContain("minRating");
  });

  it("pushes to pathname only (no query string) after full reset", async () => {
    const { result } = setup("cat=Electronics");
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => {
      result.current.resetFilters();
    });

    expect(mockPush).toHaveBeenCalledWith("/merchant/catalog", { scroll: false });
  });

  // -------------------------------------------------------------------------
  // Optional params omitted when unset
  // -------------------------------------------------------------------------

  it("does not write minPrice/maxPrice/minRating params when they are undefined", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => {
      result.current.setFilters({ categories: ["Electronics"] });
    });

    const calledUrl: string = mockPush.mock.calls[0][0] as string;
    expect(calledUrl).not.toContain("minPrice");
    expect(calledUrl).not.toContain("maxPrice");
    expect(calledUrl).not.toContain("minRating");
  });

  it("does not write inStock param when inStockOnly is false", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => {
      result.current.setFilters({ categories: ["Electronics"], inStockOnly: false });
    });

    const calledUrl: string = mockPush.mock.calls[0][0] as string;
    expect(calledUrl).not.toContain("inStock");
  });
});
