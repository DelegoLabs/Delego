import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("env validation", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("uses a development fallback when NEXT_PUBLIC_API_URL is missing", async () => {
    delete process.env.NEXT_PUBLIC_API_URL;
    (process.env as Record<string, string | undefined>).NODE_ENV = "test";
    const { env } = await import("./env.js");
    expect(env.NEXT_PUBLIC_API_URL).toBe("http://localhost:3000");
  });

  it("throws when NEXT_PUBLIC_API_URL is invalid URL", async () => {
    process.env.NEXT_PUBLIC_API_URL = "not-a-url";
    await expect(import("./env.js")).rejects.toThrow();
  });

  it("throws in production when NEXT_PUBLIC_API_URL is missing", async () => {
    delete process.env.NEXT_PUBLIC_API_URL;
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    await expect(import("./env.js")).rejects.toThrow(
      "Missing NEXT_PUBLIC_API_URL"
    );
  });

  it("returns parsed value for valid URL", async () => {
    process.env.NEXT_PUBLIC_API_URL = "https://api.example.com";
    const { env } = await import("./env.js");
    expect(env.NEXT_PUBLIC_API_URL).toBe("https://api.example.com");
  });
});
