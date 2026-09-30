/**
 * Client-side EXIF scrubbing for dispute evidence photos (#789).
 *
 * Evidence photos routinely carry sensitive metadata baked in by the device
 * that captured them — GPS coordinates, camera/body serial numbers, capture
 * timestamps, owner names, software versions. Disputes are shared with the
 * counterparty and arbiters, so that metadata must never leave the browser.
 *
 * `scrubExifMetadata` re-renders the image onto a canvas at its original
 * pixel dimensions and re-encodes it. The canvas API only ever sees decoded
 * pixels, so every EXIF/GPS/IPTC/XMP block is dropped by construction — there
 * is no tag denylist that can drift out of date as new tags are discovered.
 */

/** Output MIME type used when the source format can't safely be re-encoded. */
export const DEFAULT_SCRUBBED_IMAGE_TYPE = "image/png";

/** Formats we preserve on re-encode; anything else becomes PNG. */
const PRESERVED_OUTPUT_TYPES: Readonly<Record<string, string>> = {
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/png": "image/png",
  "image/webp": "image/webp",
};

/** JPEG is lossy, so re-encode at high quality to keep evidence legible. */
const JPEG_QUALITY = 0.92;

export type ExifScrubErrorCode =
  | "unsupported_type"
  | "decode_failed"
  | "canvas_unavailable"
  | "encode_failed";

/** Thrown when an evidence photo can't be scrubbed. */
export class ExifScrubError extends Error {
  readonly code: ExifScrubErrorCode;

  constructor(code: ExifScrubErrorCode, message: string) {
    super(message);
    this.name = "ExifScrubError";
    this.code = code;
  }
}

/**
 * True for files the browser can rasterize and re-encode.
 *
 * SVG is excluded on purpose: it's a live document (not a photo), can
 * reference external resources, and has no pixel resolution to preserve.
 */
export function isScrubbableImage(file: Pick<File, "type">): boolean {
  return file.type.startsWith("image/") && file.type !== "image/svg+xml";
}

/** The MIME type the scrubbed blob is produced in for a given source type. */
export function scrubbedOutputType(sourceType: string): string {
  return PRESERVED_OUTPUT_TYPES[sourceType] ?? DEFAULT_SCRUBBED_IMAGE_TYPE;
}

/**
 * Strips all embedded metadata from `file` by re-rendering it to a canvas at
 * its original resolution and re-encoding the pixels.
 *
 * The returned blob keeps the source's pixel dimensions (no downscaling), so
 * evidence stays just as detailed as the original — it simply no longer
 * carries GPS coordinates, camera serial numbers, or any other EXIF tags.
 */
export async function scrubExifMetadata(file: File): Promise<Blob> {
  if (!isScrubbableImage(file)) {
    throw new ExifScrubError(
      "unsupported_type",
      "Only image files (JPEG, PNG, WebP, …) can be attached as photo evidence."
    );
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);

    // Original resolution: `naturalWidth`/`naturalHeight` are the decoded
    // pixel dimensions, independent of any CSS sizing.
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) {
      throw new ExifScrubError(
        "decode_failed",
        "The selected image has no readable dimensions."
      );
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new ExifScrubError(
        "canvas_unavailable",
        "This browser can't scrub image metadata (canvas 2D is unavailable)."
      );
    }

    // Only decoded pixels survive this step — no EXIF/GPS/serial tags.
    context.drawImage(image, 0, 0, width, height);

    const outputType = scrubbedOutputType(file.type);
    return await canvasToBlob(
      canvas,
      outputType,
      outputType === "image/jpeg" ? JPEG_QUALITY : undefined
    );
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** Reads a (scrubbed) blob back as a base64 data URL for previewing/attaching. */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(reader.error ?? new Error("Could not read the scrubbed image."));
    reader.readAsDataURL(blob);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(
        new ExifScrubError(
          "decode_failed",
          "Could not decode the selected image. Try a JPEG, PNG, or WebP file."
        )
      );
    image.src = src;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (typeof canvas.toBlob === "function") {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new ExifScrubError("encode_failed", "Could not re-encode the image."));
        },
        type,
        quality
      );
      return;
    }

    // Fallback for engines without `canvas.toBlob`.
    try {
      resolve(dataUrlToBlob(canvas.toDataURL(type, quality)));
    } catch {
      reject(new ExifScrubError("encode_failed", "Could not re-encode the image."));
    }
  });
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [meta = "", payload = ""] = dataUrl.split(",");
  const mime = /:(.*?);/.exec(meta)?.[1] ?? DEFAULT_SCRUBBED_IMAGE_TYPE;
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}
