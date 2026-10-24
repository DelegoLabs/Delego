import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ImageSanitizeError,
  containsExifMetadata,
  containsGpsData,
  stripExifData,
} from "../../utils/imageSanitizer";

// ---------------------------------------------------------------------------
// Sample images
// ---------------------------------------------------------------------------

/**
 * Builds a tiny JPEG whose APP1 segment holds a little-endian TIFF block with
 * Make ("Canon"), a body serial number and a GPS IFD (lat/long) — the shape a
 * phone camera writes.
 */
function jpegWithGpsExif(): Uint8Array {
  const tiff: number[] = [];
  const u16 = (v: number) => tiff.push(v & 0xff, (v >> 8) & 0xff);
  const u32 = (v: number) =>
    tiff.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff);

  // Header: "II", 42, IFD0 at offset 8.
  tiff.push(0x49, 0x49);
  u16(42);
  u32(8);

  // IFD0 with 3 entries: Make, BodySerialNumber, GPS pointer.
  const ifd0Entries = 3;
  const ifd0Size = 2 + ifd0Entries * 12 + 4;
  const makeOffset = 8 + ifd0Size;
  const serialOffset = makeOffset + 6;
  const gpsOffset = serialOffset + 10;
  u16(ifd0Entries);
  u16(0x010f); u16(2); u32(6); u32(makeOffset); // Make
  u16(0xa431); u16(2); u32(10); u32(serialOffset); // BodySerialNumber
  u16(0x8825); u16(4); u32(1); u32(gpsOffset); // GPSInfo IFD pointer
  u32(0); // no IFD1
  tiff.push(...Array.from("Canon\0", (c) => c.charCodeAt(0)));
  tiff.push(...Array.from("SN1234567\0", (c) => c.charCodeAt(0)));

  // GPS IFD: GPSLatitudeRef "N", GPSLongitudeRef "W".
  u16(2);
  u16(0x0001); u16(2); u32(2); tiff.push(0x4e, 0, 0, 0);
  u16(0x0003); u16(2); u32(2); tiff.push(0x57, 0, 0, 0);
  u32(0);

  const exif = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const app1Length = exif.length + 2;
  return new Uint8Array([
    0xff, 0xd8, // SOI
    0xff, 0xe1, (app1Length >> 8) & 0xff, app1Length & 0xff, ...exif,
    0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0x33, // SOS + fake scan data
    0xff, 0xd9, // EOI
  ]);
}

/** What a canvas encoder emits: JFIF/APP0 header, pixels, no APP1. */
const CLEAN_JPEG = new Uint8Array([
  0xff, 0xd8,
  0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00,
  0x01, 0x00, 0x01, 0x00, 0x00,
  0xff, 0xda, 0x00, 0x02, 0x44, 0x55,
  0xff, 0xd9,
]);

function webp(chunks: Array<[string, number[]]>): Uint8Array {
  const body: number[] = [..."WEBP"].map((c) => c.charCodeAt(0));
  for (const [id, data] of chunks) {
    body.push(...[...id].map((c) => c.charCodeAt(0)));
    const n = data.length;
    body.push(n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff);
    body.push(...data);
    if (n % 2) body.push(0);
  }
  const n = body.length;
  return new Uint8Array([
    ...[..."RIFF"].map((c) => c.charCodeAt(0)),
    n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff,
    ...body,
  ]);
}

// ---------------------------------------------------------------------------
// Browser API stand-ins (jsdom has no image decoder or canvas encoder)
// ---------------------------------------------------------------------------

function installImageMock(width = 4032, height = 3024) {
  class MockImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = width;
    naturalHeight = height;
    width = width;
    height = height;
    set src(_value: string) {
      queueMicrotask(() => this.onload?.());
    }
  }
  vi.stubGlobal("Image", MockImage);
}

function installCanvasMock(output: (type?: string) => Uint8Array = () => CLEAN_JPEG) {
  const drawImage = vi.fn();
  const encoded: Array<{ width: number; height: number; type?: string }> = [];
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    drawImage,
    fillRect: vi.fn(),
    fillStyle: "",
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.toBlob = vi.fn(function (
    this: HTMLCanvasElement,
    callback: BlobCallback,
    type?: string
  ) {
    encoded.push({ width: this.width, height: this.height, type });
    callback(new Blob([toArrayBuffer(output(type))], { type }));
  }) as unknown as typeof HTMLCanvasElement.prototype.toBlob;
  return { drawImage, encoded };
}

function readFileBytes(file: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

beforeEach(() => {
  vi.stubGlobal("OffscreenCanvas", undefined);
  URL.createObjectURL = vi.fn(() => "blob:sanitize-test") as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn() as typeof URL.revokeObjectURL;
  installImageMock();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------

describe("EXIF detection", () => {
  it("finds the EXIF block and GPS IFD in a camera JPEG", () => {
    const sample = jpegWithGpsExif();
    expect(containsExifMetadata(sample)).toBe(true);
    expect(containsGpsData(sample)).toBe(true);
  });

  it("reports a canvas-encoded JPEG as clean", () => {
    expect(containsExifMetadata(CLEAN_JPEG)).toBe(false);
    expect(containsGpsData(CLEAN_JPEG)).toBe(false);
  });

  it("detects EXIF chunks inside WebP containers", () => {
    expect(containsExifMetadata(webp([["VP8 ", [1, 2, 3]], ["EXIF", [9, 9]]]))).toBe(true);
    expect(containsExifMetadata(webp([["VP8 ", [1, 2, 3]]]))).toBe(false);
  });
});

describe("stripExifData", () => {
  it("removes GPS and camera tags while preserving pixel dimensions", async () => {
    const { drawImage, encoded } = installCanvasMock();
    const sample = jpegWithGpsExif();
    const input = new File([toArrayBuffer(sample)], "IMG_0042.JPG", { type: "image/jpeg" });

    const result = await stripExifData(input);
    const out = await readFileBytes(result.file);

    expect(containsExifMetadata(out)).toBe(false);
    expect(containsGpsData(out)).toBe(false);
    expect(new TextDecoder().decode(out)).not.toContain("SN1234567");
    expect(result.exifStripped).toBe(true);
    expect(result.originalSizeBytes).toBe(sample.byteLength);
    expect(result.sanitizedSizeBytes).toBe(result.file.size);
    expect(result.file.type).toBe("image/jpeg");
    expect(result.file.name).toBe("IMG_0042.jpg");
    expect(encoded).toEqual([{ width: 4032, height: 3024, type: "image/jpeg" }]);
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 4032, 3024);
  });

  it("keeps WebP sources as WebP", async () => {
    installCanvasMock(() => webp([["VP8 ", [1, 2, 3]]]));
    const input = new File([toArrayBuffer(new Uint8Array([1]))], "avatar.webp", { type: "image/webp" });
    const result = await stripExifData(input);
    expect(result.file.type).toBe("image/webp");
    expect(result.file.name).toBe("avatar.webp");
  });

  it("falls back to JPEG when the browser can't encode WebP", async () => {
    // Engines without a WebP encoder hand back PNG for an unknown type.
    const { encoded } = installCanvasMock();
    HTMLCanvasElement.prototype.toBlob = vi.fn(function (
      this: HTMLCanvasElement,
      callback: BlobCallback,
      type?: string
    ) {
      encoded.push({ width: this.width, height: this.height, type });
      callback(
        type === "image/webp"
          ? new Blob([toArrayBuffer(new Uint8Array([0x89, 0x50]))], { type: "image/png" })
          : new Blob([toArrayBuffer(CLEAN_JPEG)], { type: "image/jpeg" })
      );
    }) as unknown as typeof HTMLCanvasElement.prototype.toBlob;

    const input = new File([toArrayBuffer(new Uint8Array([1]))], "photo.webp", { type: "image/webp" });
    const result = await stripExifData(input);
    expect(encoded.map((e) => e.type)).toEqual(["image/webp", "image/jpeg"]);
    expect(result.file.type).toBe("image/jpeg");
  });

  it("refuses to return an image that still carries EXIF", async () => {
    installCanvasMock(() => jpegWithGpsExif());
    const input = new File([toArrayBuffer(jpegWithGpsExif())], "leaky.jpg", { type: "image/jpeg" });
    await expect(stripExifData(input)).rejects.toBeInstanceOf(ImageSanitizeError);
  });

  it("rejects non-image and SVG uploads", async () => {
    installCanvasMock();
    await expect(
      stripExifData(new File(["%PDF"], "doc.pdf", { type: "application/pdf" }))
    ).rejects.toBeInstanceOf(ImageSanitizeError);
    await expect(
      stripExifData(new File(["<svg/>"], "x.svg", { type: "image/svg+xml" }))
    ).rejects.toBeInstanceOf(ImageSanitizeError);
  });
});
