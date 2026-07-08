import { describe, it, expect, beforeEach, vi } from "vitest";
import { loadRetryConfig } from "./config.js";

describe("loadRetryConfig", () => {
  beforeEach(() => {
    vi.resetModules();
    // Clear environment variables
    delete process.env.EMAIL_MAX_RETRIES;
    delete process.env.EMAIL_RETRY_BASE_DELAY_SECONDS;
    delete process.env.EMAIL_DLQ_ENABLED;
  });

  it("uses default values when environment variables are not set", () => {
    const config = loadRetryConfig();
    expect(config).toEqual({
      maxRetries: 3,
      baseDelaySeconds: 2,
      dlqEnabled: true,
    });
  });

  it("loads configured EMAIL_MAX_RETRIES", () => {
    process.env.EMAIL_MAX_RETRIES = "5";
    const config = loadRetryConfig();
    expect(config.maxRetries).toBe(5);
  });

  it("loads configured EMAIL_RETRY_BASE_DELAY_SECONDS", () => {
    process.env.EMAIL_RETRY_BASE_DELAY_SECONDS = "10";
    const config = loadRetryConfig();
    expect(config.baseDelaySeconds).toBe(10);
  });

  it("loads configured EMAIL_DLQ_ENABLED as false", () => {
    process.env.EMAIL_DLQ_ENABLED = "false";
    const config = loadRetryConfig();
    expect(config.dlqEnabled).toBe(false);
  });

  it("throws error when EMAIL_MAX_RETRIES is not an integer", () => {
    process.env.EMAIL_MAX_RETRIES = "not-a-number";
    expect(() => loadRetryConfig()).toThrow();
  });

  it("throws error when EMAIL_MAX_RETRIES is below minimum (1)", () => {
    process.env.EMAIL_MAX_RETRIES = "0";
    expect(() => loadRetryConfig()).toThrow();
  });

  it("throws error when EMAIL_MAX_RETRIES is above maximum (10)", () => {
    process.env.EMAIL_MAX_RETRIES = "11";
    expect(() => loadRetryConfig()).toThrow();
  });

  it("throws error when EMAIL_RETRY_BASE_DELAY_SECONDS is not an integer", () => {
    process.env.EMAIL_RETRY_BASE_DELAY_SECONDS = "not-a-number";
    expect(() => loadRetryConfig()).toThrow();
  });

  it("throws error when EMAIL_RETRY_BASE_DELAY_SECONDS is not positive", () => {
    process.env.EMAIL_RETRY_BASE_DELAY_SECONDS = "0";
    expect(() => loadRetryConfig()).toThrow();
  });

  it("accepts valid configuration values at boundaries", () => {
    process.env.EMAIL_MAX_RETRIES = "1";
    process.env.EMAIL_RETRY_BASE_DELAY_SECONDS = "1";
    const config = loadRetryConfig();
    expect(config.maxRetries).toBe(1);
    expect(config.baseDelaySeconds).toBe(1);
  });

  it("accepts valid configuration values at upper boundary", () => {
    process.env.EMAIL_MAX_RETRIES = "10";
    const config = loadRetryConfig();
    expect(config.maxRetries).toBe(10);
  });

  it("treats EMAIL_DLQ_ENABLED case-insensitively", () => {
    process.env.EMAIL_DLQ_ENABLED = "TRUE";
    const config1 = loadRetryConfig();
    expect(config1.dlqEnabled).toBe(true);

    delete process.env.EMAIL_DLQ_ENABLED;
    process.env.EMAIL_DLQ_ENABLED = "False";
    const config2 = loadRetryConfig();
    expect(config2.dlqEnabled).toBe(false);
  });
});
