import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { StorefrontBannerUploader } from "./StorefrontBannerUploader";

vi.mock("../../lib/bannerCrop", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/bannerCrop")>();
  return {
    ...actual,
    decodeBannerImage: vi.fn(async () => ({
      image: {} as HTMLImageElement,
      dimensions: { width: 2400, height: 1200 },
      objectUrl: "blob:selected",
    })),
  };
});

describe("StorefrontBannerUploader previews", () => {
  beforeAll(() => {
    // jsdom does not implement object URLs.
    URL.createObjectURL ??= vi.fn(() => "blob:mock");
    URL.revokeObjectURL ??= vi.fn();
  });

  it("styles the saved banner preview with stylesheet classes, not inline styles", () => {
    render(<StorefrontBannerUploader bannerUrl="https://cdn.test/banner.png" onUpload={vi.fn()} />);
    const preview = screen.getByAltText("Current storefront banner preview");
    expect(preview).toHaveClass("storefront-banner-preview");
    expect(preview).toHaveAttribute("data-aspect", "landscape");
    expect(preview).not.toHaveAttribute("style");
  });

  it("uses classes for the crop frame and switches aspect via data attribute", async () => {
    render(<StorefrontBannerUploader onUpload={vi.fn()} />);
    const input = screen.getByLabelText("Select storefront banner image");
    fireEvent.change(input, { target: { files: [new File(["x"], "b.png", { type: "image/png" })] } });

    const source = await screen.findByAltText("Selected banner crop preview");
    expect(source).toHaveClass("storefront-banner-crop-source");
    expect(source.style.position).toBe("");

    const frame = source.parentElement!;
    expect(frame).toHaveClass("storefront-banner-crop-frame");
    expect(frame).toHaveAttribute("data-aspect", "landscape");
    expect(frame).not.toHaveAttribute("style");

    fireEvent.click(screen.getByRole("button", { name: "3:1" }));
    expect(frame).toHaveAttribute("data-aspect", "panoramic");
  });
});
