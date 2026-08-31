import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("canonicalHost", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("isAllowlistedHost", () => {
    it("allowlists localhost and 127.0.0.1 regardless of case", async () => {
      const { isAllowlistedHost } = await import("./canonicalHost.js");
      expect(isAllowlistedHost("localhost")).toBe(true);
      expect(isAllowlistedHost("LOCALHOST")).toBe(true);
      expect(isAllowlistedHost("127.0.0.1")).toBe(true);
    });

    it("allowlists Vercel preview hosts", async () => {
      const { isAllowlistedHost } = await import("./canonicalHost.js");
      expect(isAllowlistedHost("delego-pr-42.vercel.app")).toBe(true);
      expect(isAllowlistedHost("DELEGO-PR-42.VERCEL.APP")).toBe(true);
    });

    it("does not allowlist an arbitrary host", async () => {
      const { isAllowlistedHost } = await import("./canonicalHost.js");
      expect(isAllowlistedHost("delego.app.evil.com")).toBe(false);
    });
  });

  describe("CANONICAL_HOSTS", () => {
    it("is empty when NEXT_PUBLIC_CANONICAL_HOSTS is unset", async () => {
      delete process.env.NEXT_PUBLIC_CANONICAL_HOSTS;
      const { CANONICAL_HOSTS } = await import("./canonicalHost.js");
      expect(CANONICAL_HOSTS).toEqual([]);
    });

    it("parses a comma-separated list, trimming and lowercasing entries", async () => {
      process.env.NEXT_PUBLIC_CANONICAL_HOSTS = " Delego.app , www.delego.app ,,";
      const { CANONICAL_HOSTS } = await import("./canonicalHost.js");
      expect(CANONICAL_HOSTS).toEqual(["delego.app", "www.delego.app"]);
    });
  });

  describe("isLookalikeHost", () => {
    it("is always false when no canonical hosts are configured (feature inert)", async () => {
      delete process.env.NEXT_PUBLIC_CANONICAL_HOSTS;
      const { isLookalikeHost } = await import("./canonicalHost.js");
      expect(isLookalikeHost("totally-not-delego.com")).toBe(false);
      expect(isLookalikeHost("localhost")).toBe(false);
    });

    it("is false for a host matching the canonical list", async () => {
      process.env.NEXT_PUBLIC_CANONICAL_HOSTS = "delego.app";
      const { isLookalikeHost } = await import("./canonicalHost.js");
      expect(isLookalikeHost("delego.app")).toBe(false);
      expect(isLookalikeHost("DELEGO.APP")).toBe(false);
    });

    it("is false for allowlisted dev/preview hosts even with canonical hosts configured", async () => {
      process.env.NEXT_PUBLIC_CANONICAL_HOSTS = "delego.app";
      const { isLookalikeHost } = await import("./canonicalHost.js");
      expect(isLookalikeHost("localhost")).toBe(false);
      expect(isLookalikeHost("delego-pr-7.vercel.app")).toBe(false);
    });

    it("is true for a lookalike host simulation", async () => {
      process.env.NEXT_PUBLIC_CANONICAL_HOSTS = "delego.app";
      const { isLookalikeHost } = await import("./canonicalHost.js");
      expect(isLookalikeHost("de1ego.app")).toBe(true);
      expect(isLookalikeHost("delego-app.phishing.com")).toBe(true);
    });

    it("accepts an explicit canonical host list, ignoring the parsed env default", async () => {
      const { isLookalikeHost } = await import("./canonicalHost.js");
      expect(isLookalikeHost("staging.delego.app", ["staging.delego.app"])).toBe(
        false
      );
      expect(isLookalikeHost("delego.app", ["staging.delego.app"])).toBe(true);
    });
  });
});
