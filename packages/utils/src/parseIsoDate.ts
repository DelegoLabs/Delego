// Issue #219 — Shared ISO-8601 date string parser

export interface IsoDateParseResult {
  valid: boolean;
  date?: Date;
  error?: string;
}

export interface ParseIsoDateOptions {
  /** When true, reject dates strictly in the future. */
  rejectFuture?: boolean;
  /** When true, reject dates strictly in the past. */
  rejectPast?: boolean;
}

/**
 * Strict ISO-8601 parser for API boundaries (auth, delegation, workflow).
 * Accepts full date-time strings with `Z` or numeric offset; rejects date-only values.
 */
export function parseIsoDate(
  input: unknown,
  options: ParseIsoDateOptions = {}
): IsoDateParseResult {
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

  if (!isStrictIsoDateTime(trimmed)) {
    return { valid: false, error: "invalid_format" };
  }

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return { valid: false, error: "invalid_date" };
  }

  if (options.rejectFuture && date.getTime() > Date.now()) {
    return { valid: false, error: "future_not_allowed" };
  }

  if (options.rejectPast && date.getTime() < Date.now()) {
    return { valid: false, error: "past_not_allowed" };
  }

  return { valid: true, date };
}

function isStrictIsoDateTime(value: string): boolean {
  // Require calendar date + time + timezone (Z or ±HH:MM).
  const isoDateTimePattern =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
  return isoDateTimePattern.test(value);
}
