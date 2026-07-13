import { createLogger } from "@delego/utils";

const log = createLogger("notifications:errorClassifier", process.env.LOG_LEVEL ?? "info");

export type ErrorClassification = "transient" | "permanent";

/**
 * Classifies SendGrid and network errors as transient or permanent.
 * Transient errors should be retried; permanent errors should go to DLQ immediately.
 */
export function classifyError(error: unknown): ErrorClassification {
  // Handle SendGrid API errors
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    const code = (error as any).code || "";

    // HTTP 429: Rate limiting (transient)
    if (message.includes("429") || message.includes("rate limit")) {
      return "transient";
    }

    // HTTP 5xx: Server errors (transient)
    if (
      message.includes("500") ||
      message.includes("502") ||
      message.includes("503") ||
      message.includes("504") ||
      message.includes("5xx")
    ) {
      return "transient";
    }

    // HTTP 4xx client errors (permanent, except 429)
    // 400: Bad request
    // 401: Unauthorized
    // 403: Forbidden
    // 404: Not found
    if (
      message.includes("400") ||
      message.includes("bad request") ||
      message.includes("invalid email") ||
      message.includes("malformed")
    ) {
      return "permanent";
    }

    if (message.includes("401") || message.includes("unauthorized")) {
      return "permanent";
    }

    if (message.includes("403") || message.includes("forbidden")) {
      return "permanent";
    }

    if (message.includes("404") || message.includes("not found")) {
      return "permanent";
    }

    // Network errors (transient)
    if (
      message.includes("econnrefused") ||
      message.includes("econnreset") ||
      message.includes("etimedout") ||
      message.includes("timeout") ||
      message.includes("enotfound") ||
      message.includes("epipe") ||
      message.includes("emfile") ||
      message.includes("ehostunreach") ||
      message.includes("enetunreach")
    ) {
      return "transient";
    }

    // Specific error codes
    if (code === "ECONNREFUSED" || code === "ETIMEDOUT" || code === "EMFILE") {
      return "transient";
    }

    // Template/rendering errors (permanent)
    if (message.includes("template") && message.includes("not found")) {
      return "permanent";
    }
    if (
      message.includes("missing required template variables") ||
      message.includes("unsubstituted placeholders")
    ) {
      return "permanent";
    }

    // Authentication errors (permanent)
    if (message.includes("api_key") || message.includes("credentials")) {
      return "permanent";
    }

    // DNS errors (transient - DNS can recover)
    if (message.includes("getaddrinfo") || message.includes("eai_again")) {
      return "transient";
    }

    log.debug("Unknown error type, defaulting to transient", {
      message: error.message,
      code,
    });
  }

  // Default to transient for unknown errors to avoid permanent data loss
  return "transient";
}

/**
 * Calculates exponential backoff delay in milliseconds.
 * Formula: delay = 2^(attempt-1) * baseDelaySeconds, max 120 seconds
 * 
 * Examples with baseDelay=2:
 * - Attempt 1: 2^0 * 2 = 2 seconds
 * - Attempt 2: 2^1 * 2 = 4 seconds
 * - Attempt 3: 2^2 * 2 = 8 seconds
 */
export function calculateBackoffDelay(
  attempt: number,
  baseDelaySeconds: number
): number {
  const exponent = Math.max(0, attempt - 1);
  const delaySeconds = Math.pow(2, exponent) * baseDelaySeconds;
  const cappedDelaySeconds = Math.min(delaySeconds, 120);
  return cappedDelaySeconds * 1000; // Convert to milliseconds
}
