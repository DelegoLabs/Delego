/**
 * Client-side EXIF stripping for user uploads (#1020).
 *
 * Evidence photos and profile pictures straight off a phone carry GPS
 * coordinates, camera make/model/serial numbers and capture timestamps.
 * `stripExifData` re-renders the decoded pixels onto an (offscreen) canvas at
 * the original resolution and re-encodes them as a fresh JPEG or WebP. The
 * canvas only ever sees pixels, so no EXIF/GPS/XMP block can survive — and
 * the result is verified byte-for-byte before it is handed back, so a
 * misbehaving encoder fails loudly instead of leaking location data.
 *
 * Browsers apply the EXIF orientation when decoding, so the drawn pixels are
 * already upright and nothing visual depends on the stripped tags.
 *
 * Builds on the same canvas technique as `lib/exif.ts` (dispute evidence,
 * #789), but always emits a lossy photo format suitable for avatars and
 * evidence uploads.
 */

import { isScrubbableImage } from "../lib/exif";

export interface SanitizedImageFile {
  file: File;
  exifStripped: boolean;
  originalSizeBytes: number;
  sanitizedSizeBytes: number;
}

export type SanitizedImageType = "image/jpeg" | "image/webp";

export interface StripExifOptions {
  /** Output format. Defaults to WebP for WebP sources, JPEG otherwise. */
  outputType?: SanitizedImageType;
  /** Encoder quality, 0–1. High by default so evidence stays legible. */
  quality?: number;
}

const DEFAULT_QUALITY = 0.92;

const EXTENSIONS: Record<SanitizedImageType, string> = {
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/** Thrown when an image can't be sanitized; the upload must not proceed. */
export class ImageSanitizeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageSanitizeError";
  }
}

/**
 * Removes all embedded metadata from `imageFile` and returns a clean JPEG or
 * WebP with the same pixel dimensions.
 */
export async function stripExifData(
  imageFile: File,
  options: StripExifOptions = {}
): Promise<SanitizedImageFile> {
  if (!isScrubbableImage(imageFile)) {
    throw new ImageSanitizeError(
      "Only image files (JPEG, PNG, WebP, …) can be uploaded."
    );
  }

  const requestedType: SanitizedImageType =
    options.outputType ??
    (imageFile.type === "image/webp" ? "image/webp" : "image/jpeg");
  const quality = options.quality ?? DEFAULT_QUALITY;

  const image = await decodeImage(imageFile);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) {
    throw new ImageSanitizeError(
      "The selected image has no readable dimensions."
    );
  }

  let blob = await renderToBlob(image, width, height, requestedType, quality);
  // Some engines (older Safari) silently fall back to PNG when they can't
  // encode WebP — retry as JPEG so the output is always a photo format.
  if (blob.type !== requestedType && requestedType === "image/webp") {
    blob = await renderToBlob(image, width, height, "image/jpeg", quality);
  }
  const outputType: SanitizedImageType =
    blob.type === "image/webp" ? "image/webp" : "image/jpeg";

  const bytes = await readBytes(blob);
  if (containsExifMetadata(bytes)) {
    throw new ImageSanitizeError(
      "Image metadata could not be removed, so the upload was stopped."
    );
  }

  const file = new File([blob], renameExtension(imageFile.name, outputType), {
    type: outputType,
    lastModified: Date.now(),
  });

  return {
    file,
    exifStripped: true,
    originalSizeBytes: imageFile.size,
    sanitizedSizeBytes: file.size,
  };
}

// ---------------------------------------------------------------------------
// Metadata detection
// ---------------------------------------------------------------------------

const EXIF_HEADER = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]; // "Exif\0\0"
const GPS_IFD_POINTER_TAG = 0x8825;

/** Locates the TIFF payload of a JPEG APP1 Exif segment or WebP EXIF chunk. */
export function findExifPayload(bytes: Uint8Array): Uint8Array | null {
  // JPEG: walk marker segments until start-of-scan.
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 0xff) return null;
      const marker = bytes[offset + 1]!;
      if (marker === 0xda || marker === 0xd9) return null; // SOS / EOI
      const length = (bytes[offset + 2]! << 8) | bytes[offset + 3]!;
      const start = offset + 4;
      if (
        marker === 0xe1 &&
        EXIF_HEADER.every((b, i) => bytes[start + i] === b)
      ) {
        return bytes.subarray(start + EXIF_HEADER.length, offset + 2 + length);
      }
      offset += 2 + length;
    }
    return null;
  }

  // WebP: RIFF container with an "EXIF" chunk.
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    let offset = 12;
    while (offset + 8 <= bytes.length) {
      const id = ascii(bytes, offset, 4);
      const size =
        bytes[offset + 4]! |
        (bytes[offset + 5]! << 8) |
        (bytes[offset + 6]! << 16) |
        (bytes[offset + 7]! << 24);
      if (id === "EXIF") return bytes.subarray(offset + 8, offset + 8 + size);
      offset += 8 + size + (size % 2);
    }
  }
  return null;
}

/** True when the encoded image still carries an EXIF block. */
export function containsExifMetadata(bytes: Uint8Array): boolean {
  return findExifPayload(bytes) !== null;
}

/** True when the image's EXIF IFD0 points at a GPS sub-IFD (location data). */
export function containsGpsData(bytes: Uint8Array): boolean {
  const tiff = findExifPayload(bytes);
  if (!tiff || tiff.length < 8) return false;
  const little = tiff[0] === 0x49 && tiff[1] === 0x49; // "II"
  const u16 = (o: number) =>
    little ? tiff[o]! | (tiff[o + 1]! << 8) : (tiff[o]! << 8) | tiff[o + 1]!;
  const u32 = (o: number) =>
    little
      ? (tiff[o]! | (tiff[o + 1]! << 8) | (tiff[o + 2]! << 16)) +
        tiff[o + 3]! * 0x1000000
      : tiff[o]! * 0x1000000 +
        ((tiff[o + 1]! << 16) | (tiff[o + 2]! << 8) | tiff[o + 3]!);

  const ifd0 = u32(4);
  if (ifd0 + 2 > tiff.length) return false;
  const count = u16(ifd0);
  for (let i = 0; i < count; i += 1) {
    const entry = ifd0 + 2 + i * 12;
    if (entry + 2 > tiff.length) break;
    if (u16(entry) === GPS_IFD_POINTER_TAG) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Canvas plumbing
// ---------------------------------------------------------------------------

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

function renameExtension(name: string, type: SanitizedImageType): string {
  const base = name.replace(/\.[^./\\]+$/, "") || "image";
  return `${base}.${EXTENSIONS[type]}`;
}

function decodeImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(
        new ImageSanitizeError(
          "Could not decode the selected image. Try a JPEG, PNG, or WebP file."
        )
      );
    image.src = url;
  }).finally(() => URL.revokeObjectURL(url));
}

async function renderToBlob(
  image: CanvasImageSource,
  width: number,
  height: number,
  type: SanitizedImageType,
  quality: number
): Promise<Blob> {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (context) {
      paint(context, image, width, height, type);
      return canvas.convertToBlob({ type, quality });
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new ImageSanitizeError(
      "This browser can't remove image metadata (canvas 2D is unavailable)."
    );
  }
  paint(context, image, width, height, type);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new ImageSanitizeError("Could not re-encode the image.")),
      type,
      quality
    );
  });
}

function paint(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  image: CanvasImageSource,
  width: number,
  height: number,
  type: SanitizedImageType
): void {
  // JPEG has no alpha channel — flatten transparent PNGs onto white instead
  // of the encoder's default black.
  if (type === "image/jpeg") {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
  }
  context.drawImage(image, 0, 0, width, height);
}

function readBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === "function") {
    return blob.arrayBuffer().then((buffer) => new Uint8Array(buffer));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () =>
      reject(reader.error ?? new Error("Could not read the sanitized image."));
    reader.readAsArrayBuffer(blob);
  });
}
