import type { CropArea } from "@delegolabs/types";

export const MIN_BANNER_WIDTH = 1200;
export const MIN_BANNER_HEIGHT = 400;
export const BANNER_ASPECT_RATIOS = {
  landscape: 16 / 9,
  panoramic: 3,
} as const;

export type BannerAspectRatio = (typeof BANNER_ASPECT_RATIOS)[keyof typeof BANNER_ASPECT_RATIOS];

export interface ImageDimensions {
  width: number;
  height: number;
}

export class BannerCropError extends Error {
  constructor(
    readonly code: "unsupported_type" | "decode_failed" | "dimensions_too_small" | "invalid_crop" | "canvas_unavailable" | "encode_failed",
    message: string
  ) {
    super(message);
    this.name = "BannerCropError";
  }
}

export function validateBannerDimensions({ width, height }: ImageDimensions): string | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return "The selected image could not be decoded.";
  }
  if (width < MIN_BANNER_WIDTH || height < MIN_BANNER_HEIGHT) {
    return `Banner images must be at least ${MIN_BANNER_WIDTH} × ${MIN_BANNER_HEIGHT} pixels. Your image is ${width} × ${height} pixels.`;
  }
  return null;
}

export function centeredCrop(dimensions: ImageDimensions, aspectRatio: number): CropArea {
  if (!isPositiveRatio(aspectRatio) || dimensions.width <= 0 || dimensions.height <= 0) {
    throw new BannerCropError("invalid_crop", "Choose a valid banner aspect ratio.");
  }
  const sourceRatio = dimensions.width / dimensions.height;
  const width = sourceRatio > aspectRatio ? dimensions.height * aspectRatio : dimensions.width;
  const height = width / aspectRatio;
  return { x: (dimensions.width - width) / 2, y: (dimensions.height - height) / 2, width, height, aspectRatio };
}

/** Clamp a source-pixel crop rectangle to its decoded image bounds. */
export function clampCropArea(crop: CropArea, dimensions: ImageDimensions): CropArea {
  if (!isPositiveRatio(crop.aspectRatio) || !Number.isFinite(dimensions.width) || !Number.isFinite(dimensions.height) || dimensions.width <= 0 || dimensions.height <= 0 || !Number.isFinite(crop.width) || !Number.isFinite(crop.height) || crop.width <= 0 || crop.height <= 0) {
    throw new BannerCropError("invalid_crop", "The crop area must have positive dimensions.");
  }
  const maxWidth = Math.min(crop.width, dimensions.width);
  const maxHeight = Math.min(crop.height, dimensions.height);
  const width = Math.min(maxWidth, maxHeight * crop.aspectRatio);
  const height = width / crop.aspectRatio;
  const x = clamp(Number.isFinite(crop.x) ? crop.x : 0, 0, dimensions.width - width);
  const y = clamp(Number.isFinite(crop.y) ? crop.y : 0, 0, dimensions.height - height);
  return { x, y, width, height, aspectRatio: crop.aspectRatio };
}

/** Maps a rectangle from rendered-image pixels to decoded source-image pixels. */
export function mapDisplayCropToSource(crop: CropArea, displayed: ImageDimensions, source: ImageDimensions): CropArea {
  if (displayed.width <= 0 || displayed.height <= 0) throw new BannerCropError("invalid_crop", "The displayed image has no size.");
  return clampCropArea({
    x: crop.x * (source.width / displayed.width),
    y: crop.y * (source.height / displayed.height),
    width: crop.width * (source.width / displayed.width),
    height: crop.height * (source.height / displayed.height),
    aspectRatio: crop.aspectRatio,
  }, source);
}

/** Output sizing never enlarges the source crop and always has an exact ratio. */
export function bannerOutputDimensions(crop: CropArea): ImageDimensions {
  if (
    crop.aspectRatio !== BANNER_ASPECT_RATIOS.landscape &&
    crop.aspectRatio !== BANNER_ASPECT_RATIOS.panoramic
  ) {
    throw new BannerCropError("invalid_crop", "Choose either the 16:9 or 3:1 banner aspect ratio.");
  }
  const preferredWidth = crop.aspectRatio === BANNER_ASPECT_RATIOS.panoramic ? 1500 : 1600;
  const ratioWidth = crop.aspectRatio === BANNER_ASPECT_RATIOS.panoramic ? 3 : 16;
  const ratioHeight = crop.aspectRatio === BANNER_ASPECT_RATIOS.panoramic ? 1 : 9;
  const units = Math.floor(Math.min(preferredWidth, crop.width) / ratioWidth);
  if (units < 1) throw new BannerCropError("invalid_crop", "The crop area is too small to export.");
  return { width: units * ratioWidth, height: units * ratioHeight };
}

export async function decodeBannerImage(file: File): Promise<{ image: HTMLImageElement; dimensions: ImageDimensions; objectUrl: string }> {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
    throw new BannerCropError("unsupported_type", "Upload a JPEG, PNG, WebP, or other raster image file.");
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    const dimensions = { width: image.naturalWidth || image.width, height: image.naturalHeight || image.height };
    const error = validateBannerDimensions(dimensions);
    if (error) throw new BannerCropError("dimensions_too_small", error);
    return { image, dimensions, objectUrl };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

export async function renderBannerCrop(image: CanvasImageSource, source: ImageDimensions, crop: CropArea): Promise<File> {
  const bounded = clampCropArea(crop, source);
  const output = bannerOutputDimensions(bounded);
  const canvas = document.createElement("canvas");
  canvas.width = output.width;
  canvas.height = output.height;
  const context = canvas.getContext("2d");
  if (!context) throw new BannerCropError("canvas_unavailable", "Your browser cannot process banner images.");
  context.drawImage(image, bounded.x, bounded.y, bounded.width, bounded.height, 0, 0, output.width, output.height);
  let blob = await canvasToBlob(canvas, "image/webp", 0.9);
  if (blob.type !== "image/webp") blob = await canvasToBlob(canvas, "image/jpeg", 0.92);
  if (!blob.type.startsWith("image/")) throw new BannerCropError("encode_failed", "The browser could not encode the cropped banner.");
  const extension = blob.type === "image/webp" ? "webp" : "jpg";
  return new File([blob], `storefront-banner.${extension}`, { type: blob.type });
}

function isPositiveRatio(value: number): boolean { return Number.isFinite(value) && value > 0; }
function clamp(value: number, min: number, max: number): number { return Math.min(Math.max(value, min), max); }

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new BannerCropError("decode_failed", "The selected image could not be decoded. Try a JPEG, PNG, or WebP file."));
    image.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new BannerCropError("encode_failed", "The browser could not encode the cropped banner.")), type, quality));
}
