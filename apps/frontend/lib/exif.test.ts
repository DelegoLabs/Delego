import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SCRUBBED_IMAGE_TYPE,
  blobToDataUrl,
  isScrubbableImage,
  scrubExifMetadata,
  scrubbedOutputType,
} from "./exif";

interface ImageMockOptions {
  width?: number;
  height?: number;
  fail?: boolean;
}

/** Minimal `HTMLImageElement` stand-in: "loads" (or fails) as soon as src is set. */
function installImageMock({ width = 4032, height = 3024, fail = false }: ImageMockOptions = {}) {
  class MockImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = width;
    naturalHeight = height;
    width = width;
    height = height;
    private currentSrc = "";

    set src(value: string) {
      this.currentSrc = value;
      queueMicrotask(() => {
        if (fail) this.onerror?.();
        else this.onload?.();
      });
    }

    get src() {
      return this.currentSrc;
    }
  }

  vi.stubGlobal("Image", MockImage);
}

/** Canvas stand-in that records the dimensions/type it was asked to encode. */
function installCanvasMock() {
  const drawImage = vi.fn();
  const encoded: Array<{ width: number; height: number; type?: string }> = [];
  const toBlob = vi.fn(function (
    this: HTMLCanvasElement,
    callback: BlobCallback,
    type?: string
  ) {
    encoded.push({ width: this.width, height: this.height, type });
    callback(new Blob(["re-encoded-pixels"], { type: type ?? DEFAULT_SCRUBBED_IMAGE_TYPE }));
  });

  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    drawImage,
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.toBlob = toBlob as unknown as typeof HTMLCanvasElement.prototype.toBlob;

  return { drawImage, toBlob, encoded };
}

const createObjectURL = vi.fn(() => "blob:delego-scrub-test");
const revokeObjectURL = vi.fn();

beforeEach(() => {
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function makeImageFile(type = "image/jpeg", name = "evidence.jpg") {
  return new File(["exif-bytes"], name, { type });
}

/** Reads a blob's text via FileReader (independent of Blob.text polyfills). */
function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

describe("scrubbedOutputType", () => {
  it("preserves common photo formats on re-encode", () => {
    expect(scrubbedOutputType("image/jpeg")).toBe("image/jpeg");
    expect(scrubbedOutputType("image/png")).toBe("image/png");
    expect(scrubbedOutputType("image/webp")).toBe("image/webp");
  });

  it("falls back to PNG for unknown formats", () => {
    expect(scrubbedOutputType("image/heic")).toBe(DEFAULT_SCRUBBED_IMAGE_TYPE);
    expect(scrubbedOutputType("")).toBe(DEFAULT_SCRUBBED_IMAGE_TYPE);
  });
});

describe("isScrubbableImage", () => {
  it("accepts raster image files", () => {
    expect(isScrubbableImage({ type: "image/jpeg" })).toBe(true);
    expect(isScrubbableImage({ type: "image/png" })).toBe(true);
  });

  it("rejects non-images and SVG documents", () => {
    expect(isScrubbableImage({ type: "application/pdf" })).toBe(false);
    expect(isScrubbableImage({ type: "image/svg+xml" })).toBe(false);
  });
});

describe("scrubExifMetadata (#789)", () => {
  it("re-renders the image at its original resolution", async () => {
    installImageMock({ width: 4032, height: 3024 });
    const { drawImage, encoded } = installCanvasMock();

    const result = await scrubExifMetadata(makeImageFile());

    // No downscaling: the canvas matches the decoded pixel dimensions.
    expect(encoded).toEqual([{ width: 4032, height: 3024, type: "image/jpeg" }]);
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(drawImage.mock.calls[0].slice(1)).toEqual([0, 0, 4032, 3024]);
    expect(result.type).toBe("image/jpeg");
  });

  it("keeps PNG inputs lossless", async () => {
    installImageMock({ width: 800, height: 600 });
    const { encoded } = installCanvasMock();

    const result = await scrubExifMetadata(makeImageFile("image/png", "shot.png"));

    expect(encoded[0]).toMatchObject({ width: 800, height: 600, type: "image/png" });
    expect(result.type).toBe("image/png");
  });

  it("re-encodes unknown raster formats as PNG", async () => {
    installImageMock();
    const { encoded } = installCanvasMock();

    const result = await scrubExifMetadata(makeImageFile("image/heic", "shot.heic"));

    expect(encoded[0].type).toBe(DEFAULT_SCRUBBED_IMAGE_TYPE);
    expect(result.type).toBe(DEFAULT_SCRUBBED_IMAGE_TYPE);
  });

  it("never carries the original EXIF payload into the scrubbed blob", async () => {
    installImageMock();
    const { drawImage } = installCanvasMock();

    const exifPayload =
      "GPSLatitude=51.5074;GPSLongitude=-0.1278;SerialNumber=SN-12345678";
    const file = new File([exifPayload], "evidence.jpg", { type: "image/jpeg" });

    const result = await scrubExifMetadata(file);
    const text = await readBlobText(result);

    expect(text).not.toContain("GPSLatitude");
    expect(text).not.toContain("SerialNumber");
    expect(text).not.toContain("SN-12345678");
    // Output is a fresh re-encode, never the original file handle.
    expect(result).not.toBe(file);
    expect(drawImage).toHaveBeenCalledTimes(1);
  });

  it("reads the source through a transient object URL and always revokes it", async () => {
    installImageMock();
    installCanvasMock();
    const file = makeImageFile();

    await scrubExifMetadata(file);

    expect(createObjectURL).toHaveBeenCalledWith(file);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:delego-scrub-test");
  });

  it("rejects non-image files without touching the canvas", async () => {
    const { drawImage } = installCanvasMock();

    await expect(
      scrubExifMetadata(new File(["x"], "notes.txt", { type: "text/plain" }))
    ).rejects.toMatchObject({ name: "ExifScrubError", code: "unsupported_type" });
    expect(drawImage).not.toHaveBeenCalled();
  });

  it("surfaces a decode failure and still cleans up the object URL", async () => {
    installImageMock({ fail: true });
    installCanvasMock();

    await expect(scrubExifMetadata(makeImageFile())).rejects.toMatchObject({
      code: "decode_failed",
    });
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:delego-scrub-test");
  });

  it("errors clearly when canvas 2D is unavailable", async () => {
    installImageMock();
    HTMLCanvasElement.prototype.getContext = vi.fn(
      () => null
    ) as unknown as typeof HTMLCanvasElement.prototype.getContext;

    await expect(scrubExifMetadata(makeImageFile())).rejects.toMatchObject({
      code: "canvas_unavailable",
    });
  });

  it("falls back to a data URL when canvas.toBlob is unavailable", async () => {
    installImageMock({ width: 10, height: 10 });
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      drawImage: vi.fn(),
    })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.toBlob = undefined as unknown as typeof HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toDataURL = vi.fn(
      () => "data:image/png;base64,aGVsbG8="
    ) as unknown as typeof HTMLCanvasElement.prototype.toDataURL;

    const result = await scrubExifMetadata(makeImageFile("image/png", "shot.png"));

    expect(result.type).toBe("image/png");
    expect(await readBlobText(result)).toBe("hello");
  });
});

describe("blobToDataUrl", () => {
  it("reads a scrubbed blob back as a base64 data URL", async () => {
    const url = await blobToDataUrl(new Blob(["hello"], { type: "image/png" }));
    expect(url.startsWith("data:image/png;base64,")).toBe(true);
  });
});
