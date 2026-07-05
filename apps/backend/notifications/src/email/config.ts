import { createLogger } from "@delego/utils";

const log = createLogger("notifications:config", process.env.LOG_LEVEL ?? "info");

export interface RetryConfig {
  maxRetries: number;
  baseDelaySeconds: number;
  dlqEnabled: boolean;
}

/**
 * Loads and validates email retry configuration from environment variables.
 * Throws error if configuration is invalid.
 * Logs configuration values at INFO level.
 */
export function loadRetryConfig(): RetryConfig {
  const maxRetriesEnv = process.env.EMAIL_MAX_RETRIES ?? "3";
  const baseDelayEnv = process.env.EMAIL_RETRY_BASE_DELAY_SECONDS ?? "2";
  const dlqEnabledEnv = process.env.EMAIL_DLQ_ENABLED ?? "true";

  // Parse max retries
  const maxRetries = parseInt(maxRetriesEnv, 10);
  if (isNaN(maxRetries) || maxRetries < 1 || maxRetries > 10) {
    const errorMsg = `EMAIL_MAX_RETRIES must be an integer between 1 and 10, got: ${maxRetriesEnv}`;
    log.error(errorMsg);
    throw new Error(errorMsg);
  }

  // Parse base delay
  const baseDelaySeconds = parseInt(baseDelayEnv, 10);
  if (isNaN(baseDelaySeconds) || baseDelaySeconds < 1) {
    const errorMsg = `EMAIL_RETRY_BASE_DELAY_SECONDS must be a positive integer, got: ${baseDelayEnv}`;
    log.error(errorMsg);
    throw new Error(errorMsg);
  }

  // Parse DLQ enabled
  const dlqEnabled = dlqEnabledEnv.toLowerCase() === "true";

  // Log configuration
  log.info("Email retry configuration loaded", {
    EMAIL_MAX_RETRIES: maxRetries,
    EMAIL_RETRY_BASE_DELAY_SECONDS: baseDelaySeconds,
    EMAIL_DLQ_ENABLED: dlqEnabled,
  });

  return {
    maxRetries,
    baseDelaySeconds,
    dlqEnabled,
  };
}

// Create singleton configuration
let cachedConfig: RetryConfig | null = null;

export function getRetryConfig(): RetryConfig {
  if (!cachedConfig) {
    cachedConfig = loadRetryConfig();
  }
  return cachedConfig;
}
