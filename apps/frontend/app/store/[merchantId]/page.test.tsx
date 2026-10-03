import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateMetadata } from "./page";

// Mock the storefront module
vi.mock("../../../lib/storefront", () => ({
  fetchStorefront: vi.fn(),
  isSafeMerchantId: vi.fn(),
}));

describe("Store Page Metadata Generation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return fallback metadata when merchant ID is invalid", async () => {
    const { isSafeMerchantId } = await import("../../../lib/storefront");
    vi.mocked(isSafeMerchantId).mockReturnValue(false);

    const metadata = await generateMetadata({
      params: Promise.resolve({ merchantId: "invalid-id" }),
    });

    expect(metadata.title).toBe("Merchant Store | Delego");
    expect(metadata.description).toBe(
      "Products from a verified Delego merchant."
    );
    expect(metadata.openGraph).toEqual({
      title: "Merchant Store | Delego",
      description: "Products from a verified Delego merchant.",
      type: "website",
    });
  });

  it("should return fallback metadata when API lookup times out", async () => {
    const { isSafeMerchantId, fetchStorefront } = await import(
      "../../../lib/storefront"
    );
    vi.mocked(isSafeMerchantId).mockReturnValue(true);
    vi.mocked(fetchStorefront).mockRejectedValue(new Error("Timeout"));

    const metadata = await generateMetadata({
      params: Promise.resolve({ merchantId: "valid-id" }),
    });

    expect(metadata.title).toBe("Merchant Store | Delego");
    expect(metadata.description).toBe(
      "Products from a verified Delego merchant."
    );
    expect(metadata.openGraph).toEqual({
      title: "Merchant Store | Delego",
      description: "Products from a verified Delego merchant.",
      type: "website",
    });
  });

  it("should return fallback metadata when merchant is not found", async () => {
    const { isSafeMerchantId, fetchStorefront } = await import(
      "../../../lib/storefront"
    );
    vi.mocked(isSafeMerchantId).mockReturnValue(true);
    vi.mocked(fetchStorefront).mockResolvedValue(null);

    const metadata = await generateMetadata({
      params: Promise.resolve({ merchantId: "unknown-merchant" }),
    });

    expect(metadata.title).toBe("Merchant Store | Delego");
    expect(metadata.description).toBe(
      "Products from a verified Delego merchant."
    );
    expect(metadata.openGraph).toEqual({
      title: "Merchant Store | Delego",
      description: "Products from a verified Delego merchant.",
      type: "website",
    });
  });

  it("should return custom metadata when merchant is found successfully", async () => {
    const { isSafeMerchantId, fetchStorefront } = await import(
      "../../../lib/storefront"
    );
    vi.mocked(isSafeMerchantId).mockReturnValue(true);
    vi.mocked(fetchStorefront).mockResolvedValue({
      merchantId: "test-merchant",
      storeName: "Test Store",
      description: "A test merchant store",
      stellarAddress: "GABC123",
      reputationScore: 95,
      products: [],
    });

    const metadata = await generateMetadata({
      params: Promise.resolve({ merchantId: "test-merchant" }),
    });

    expect(metadata.title).toBe("Test Store");
    expect(metadata.description).toBe("A test merchant store");
    expect(metadata.openGraph).toEqual({
      title: "Test Store",
      description: "A test merchant store",
      type: "website",
    });
  });
});
