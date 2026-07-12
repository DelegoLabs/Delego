// Issue #218 — Shared bigint-safe amount string parser

export interface BigIntStringParseResult {
  valid: boolean;
  value?: bigint;
  error?: string;
}

export interface ParseBigIntStringOptions {
  /** When true (default), reject negative values. */
  allowNegative?: boolean;
  /** When true, reject zero. */
  requirePositive?: boolean;
  /** When set, reject values greater than this bigint. */
  max?: bigint;
}

const INTEGER_STRING_PATTERN = /^-?\d+$/;
const NON_NEGATIVE_INTEGER_PATTERN = /^\d+$/;

/**
 * Parses a decimal string into a bigint without passing through Number.
 * Rejects decimals, unsafe number inputs, and optionally negatives.
 */
export function parseBigIntString(
  input: unknown,
  options: ParseBigIntStringOptions = {}
): BigIntStringParseResult {
  const allowNegative = options.allowNegative ?? false;
  const requirePositive = options.requirePositive ?? false;

  if (input == null) {
    return { valid: false, error: "missing" };
  }

  if (typeof input !== "string") {
    return { valid: false, error: "invalid_type" };
  }

  const trimmed = input.trim();
  if (trimmed === "") {
    return { valid: false, error: "missing" };
  }

  const pattern = allowNegative ? INTEGER_STRING_PATTERN : NON_NEGATIVE_INTEGER_PATTERN;
  if (!pattern.test(trimmed)) {
    return { valid: false, error: "invalid_format" };
  }

  if (!allowNegative && trimmed.startsWith("-")) {
    return { valid: false, error: "negative_not_allowed" };
  }

  let value: bigint;
  try {
    value = BigInt(trimmed);
  } catch {
    return { valid: false, error: "invalid_format" };
  }

  if (requirePositive && value <= 0n) {
    return { valid: false, error: "must_be_positive" };
  }

  if (!allowNegative && value < 0n) {
    return { valid: false, error: "negative_not_allowed" };
  }

  if (options.max != null && value > options.max) {
    return { valid: false, error: "exceeds_max" };
  }

  return { valid: true, value };
}
