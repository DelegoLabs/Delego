import { afterEach, describe, expect, it } from "vitest";
import {
  BANNER_ASPECT_RATIOS,
  bannerOutputDimensions,
  centeredCrop,
  clampCropArea,
  mapDisplayCropToSource,
  renderBannerCrop,
  validateBannerDimensions,
} from "./bannerCrop";

const originalToBlob = HTMLCanvasElement.prototype.toBlob;
afterEach(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, "toBlob", { configurable: true, value: originalToBlob });
});

describe("storefront banner crop geometry", () => {
  it("centres a 16:9 crop within a wider source image", () => {
    const crop = centeredCrop({ width: 2000, height: 1000 }, BANNER_ASPECT_RATIOS.landscape);
    expect(crop.x).toBeCloseTo(111.111, 3);
    expect(crop.y).toBe(0);
    expect(crop.width).toBeCloseTo(1777.778, 3);
    expect(crop.height).toBe(1000);
    expect(crop.width / crop.height).toBe(BANNER_ASPECT_RATIOS.landscape);
  });

  it("centres a 3:1 crop within a taller source image", () => {
    const crop = centeredCrop({ width: 1200, height: 800 }, BANNER_ASPECT_RATIOS.panoramic);
    expect(crop).toMatchObject({ x: 0, y: 200, width: 1200, height: 400 });
  });

  it("maps rendered-image coordinates into original image pixels", () => {
    const crop = mapDisplayCropToSource(
      { x: 100, y: 50, width: 400, height: 225, aspectRatio: 16 / 9 },
      { width: 800, height: 450 },
      { width: 2400, height: 1350 }
    );
    expect(crop).toMatchObject({ x: 300, y: 150, width: 1200, height: 675 });
  });

  it("clamps partially outside crop coordinates safely", () => {
    const crop = clampCropArea({ x: -100, y: 900, width: 900, height: 300, aspectRatio: 3 }, { width: 1200, height: 1000 });
    expect(crop).toMatchObject({ x: 0, y: 700, width: 900, height: 300 });
  });

  it("rejects zero, negative, and invalid crop dimensions", () => {
    expect(() => clampCropArea({ x: 0, y: 0, width: 0, height: 1, aspectRatio: 3 }, { width: 1200, height: 400 })).toThrow("positive dimensions");
    expect(() => clampCropArea({ x: 0, y: 0, width: -1, height: 1, aspectRatio: 3 }, { width: 1200, height: 400 })).toThrow("positive dimensions");
  });

  it("does not let crop dimensions exceed image bounds", () => {
    const crop = clampCropArea({ x: 0, y: 0, width: 3000, height: 1000, aspectRatio: 3 }, { width: 1200, height: 400 });
    expect(crop).toMatchObject({ x: 0, y: 0, width: 1200, height: 400 });
  });

  it("generates exact output ratios without upscaling", () => {
    expect(bannerOutputDimensions({ x: 0, y: 0, width: 1200, height: 675, aspectRatio: 16 / 9 })).toEqual({ width: 1200, height: 675 });
    expect(bannerOutputDimensions({ x: 0, y: 0, width: 1200, height: 400, aspectRatio: 3 })).toEqual({ width: 1200, height: 400 });
  });

  it("uses the actual canvas MIME type and falls back to JPEG when WebP is unavailable", async () => {
    const encoded: Array<{ type?: string; width: number; height: number }> = [];
    Object.defineProperty(HTMLCanvasElement.prototype, "toBlob", {
      configurable: true,
      value(callback: BlobCallback, type?: string) {
        encoded.push({ type, width: this.width, height: this.height });
        callback(new Blob(["banner"], { type: type === "image/webp" ? "image/png" : "image/jpeg" }));
      },
    });
    const file = await renderBannerCrop({} as CanvasImageSource, { width: 1200, height: 400 }, { x: 0, y: 0, width: 1200, height: 400, aspectRatio: 3 });
    expect(encoded).toEqual([
      { type: "image/webp", width: 1200, height: 400 },
      { type: "image/jpeg", width: 1200, height: 400 },
    ]);
    expect(file.type).toBe("image/jpeg");
  });

  it("does not produce an uploadable file when canvas encoding fails", async () => {
    Object.defineProperty(HTMLCanvasElement.prototype, "toBlob", {
      configurable: true,
      value(callback: BlobCallback) { callback(null); },
    });
    await expect(renderBannerCrop({} as CanvasImageSource, { width: 1200, height: 400 }, { x: 0, y: 0, width: 1200, height: 400, aspectRatio: 3 })).rejects.toThrow("could not encode");
  });
});

describe("storefront banner dimensions", () => {
  it("accepts source images at or above the minimum", () => {
    expect(validateBannerDimensions({ width: 1200, height: 400 })).toBeNull();
    expect(validateBannerDimensions({ width: 2400, height: 800 })).toBeNull();
  });

  it("rejects images that are too narrow or too short independently", () => {
    expect(validateBannerDimensions({ width: 1199, height: 800 })).toContain("1200 × 400");
    expect(validateBannerDimensions({ width: 2400, height: 399 })).toContain("1200 × 400");
  });
});
