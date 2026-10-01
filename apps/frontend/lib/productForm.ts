/**
 * Add/Edit product form helpers (#688): client-side validation, image-file
 * checks, and decimal → stroops conversion for submission.
 */

export type ProductAssetCode = "USDC" | "XLM" | "EURC";

export interface ProductFormData {
  title: string;
  description: string;
  priceDecimal: string;
  assetCode: ProductAssetCode;
  stockQuantity: number;
  imageFile?: File;
  category: string;
}

/** What the modal hands to `onSubmit`: the form data plus the price in stroops. */
export interface ProductSubmitPayload extends ProductFormData {
  priceStroops: string;
}

export type ProductFormErrors = Partial<Record<keyof ProductFormData, string>>;

export const PRODUCT_ASSET_CODES: ProductAssetCode[] = ["USDC", "XLM", "EURC"];

export const STROOP_DECIMALS = 7;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

const DECIMAL_PATTERN = new RegExp(`^\\d+(\\.\\d{1,${STROOP_DECIMALS}})?$`);

/**
 * Converts a standard decimal amount ("12.5") to stroops (125000000n) using
 * string math, so no float rounding creeps in. Returns null for anything that
 * isn't a plain non-negative decimal with at most 7 fractional digits.
 */
export function decimalToStroops(decimal: string): bigint | null {
  const trimmed = decimal.trim();
  if (!DECIMAL_PATTERN.test(trimmed)) return null;
  const [whole, fraction = ""] = trimmed.split(".");
  return BigInt(whole + fraction.padEnd(STROOP_DECIMALS, "0"));
}

/** Inverse of `decimalToStroops`, trimming trailing zeros ("125000000" → "12.5"). */
export function stroopsToDecimal(stroops: string | bigint): string {
  const digits = BigInt(stroops)
    .toString()
    .padStart(STROOP_DECIMALS + 1, "0");
  const whole = digits.slice(0, -STROOP_DECIMALS);
  const fraction = digits.slice(-STROOP_DECIMALS).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

/** Returns an error message for an unacceptable image, or null if it's fine. */
export function validateImageFile(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return "Image must be a JPEG, PNG, WebP or GIF.";
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return "Image must be 5 MB or smaller.";
  }
  return null;
}

export function validateProductForm(data: ProductFormData): ProductFormErrors {
  const errors: ProductFormErrors = {};

  if (!data.title.trim()) errors.title = "Title is required.";

  const stroops = decimalToStroops(data.priceDecimal);
  if (stroops === null) {
    errors.priceDecimal = "Enter a price like 12.50 (up to 7 decimal places).";
  } else if (stroops <= 0n) {
    errors.priceDecimal = "Price must be greater than 0.";
  }

  if (!Number.isInteger(data.stockQuantity) || data.stockQuantity < 0) {
    errors.stockQuantity = "Stock must be a whole number of 0 or more.";
  }

  if (data.imageFile) {
    const imageError = validateImageFile(data.imageFile);
    if (imageError) errors.imageFile = imageError;
  }

  return errors;
}
