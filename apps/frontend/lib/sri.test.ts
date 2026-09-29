import { describe, it, expect } from "vitest";
import {
  EXTERNAL_SCRIPTS,
  computeSha384,
  verifySubresourceIntegrity,
  isValidSriHash,
  validateExternalAssetSecurity,
} from "./sri";

describe("Subresource Integrity (SRI) utilities (#763)", () => {
  describe("computeSha384", () => {
    it("computes standard sha384-<base64> hash for string content", async () => {
      const sampleScript = 'console.log("hello world");';
      const hash = await computeSha384(sampleScript);

      expect(hash).toMatch(/^sha384-[A-Za-z0-9+/=]{64}$/);
    });

    it("produces deterministic hashes for identical inputs", async () => {
      const scriptA = 'window.__cf_turnstile = { ready: true };';
      const scriptB = 'window.__cf_turnstile = { ready: true };';

      const hashA = await computeSha384(scriptA);
      const hashB = await computeSha384(scriptB);

      expect(hashA).toBe(hashB);
    });
  });

  describe("verifySubresourceIntegrity (tamper detection)", () => {
    it("verifies genuine third-party script content successfully", async () => {
      const authenticScript = 'window.Turnstile = { render: function() {} };';
      const validHash = await computeSha384(authenticScript);

      const isValid = await verifySubresourceIntegrity(authenticScript, validHash);
      expect(isValid).toBe(true);
    });

    it("blocks tampered third-party scripts when content is modified", async () => {
      const authenticScript = 'window.Turnstile = { render: function() {} };';
      const validHash = await computeSha384(authenticScript);

      const tamperedScript = 'window.Turnstile = { render: function() { maliciousPayload(); } };';
      const isValid = await verifySubresourceIntegrity(tamperedScript, validHash);

      // Acceptance Criteria: Tampered third-party scripts are blocked
      expect(isValid).toBe(false);
    });

    it("rejects invalid or non-sha384 hashes", async () => {
      const script = 'console.log("test");';
      expect(await verifySubresourceIntegrity(script, "")).toBe(false);
      expect(await verifySubresourceIntegrity(script, "invalid-hash")).toBe(false);
      expect(await verifySubresourceIntegrity(script, "md5-12345")).toBe(false);
    });
  });

  describe("isValidSriHash", () => {
    it("accepts valid sha384, sha256, and sha512 hashes", () => {
      expect(
        isValidSriHash("sha384-hLYQBhIuOGH4Z+z13gHtLxBQQ4FBASOj8MUgbTLtSAA68VW/Q+njZLZ2BDqI+gSL")
      ).toBe(true);
      expect(
        isValidSriHash(
          "sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU="
        )
      ).toBe(true);
    });

    it("rejects invalid hash patterns", () => {
      expect(isValidSriHash("")).toBe(false);
      expect(isValidSriHash("sha1-abc")).toBe(false);
      expect(isValidSriHash("sha384-too-short")).toBe(false);
      // @ts-expect-error test invalid types
      expect(isValidSriHash(null)).toBe(false);
    });
  });

  describe("validateExternalAssetSecurity", () => {
    it("passes for valid external asset with SRI and crossorigin", () => {
      const result = validateExternalAssetSecurity({
        src: "https://challenges.cloudflare.com/turnstile/v0/api.js",
        integrity: "sha384-hLYQBhIuOGH4Z+z13gHtLxBQQ4FBASOj8MUgbTLtSAA68VW/Q+njZLZ2BDqI+gSL",
        crossOrigin: "anonymous",
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("fails when an external script lacks integrity hash", () => {
      const result = validateExternalAssetSecurity({
        src: "https://challenges.cloudflare.com/turnstile/v0/api.js",
        crossOrigin: "anonymous",
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("missing the 'integrity' attribute"))).toBe(
        true
      );
    });

    it("fails when an external script lacks crossorigin anonymous", () => {
      const result = validateExternalAssetSecurity({
        src: "https://challenges.cloudflare.com/turnstile/v0/api.js",
        integrity: "sha384-hLYQBhIuOGH4Z+z13gHtLxBQQ4FBASOj8MUgbTLtSAA68VW/Q+njZLZ2BDqI+gSL",
        crossOrigin: null,
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("crossorigin=\"anonymous\""))).toBe(true);
    });

    it("ignores local relative assets", () => {
      const result = validateExternalAssetSecurity({
        src: "/sw.js",
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("EXTERNAL_SCRIPTS registry", () => {
    it("includes Cloudflare Turnstile CAPTCHA dependency with sha384 SRI and crossorigin", () => {
      const turnstile = EXTERNAL_SCRIPTS.turnstile;

      expect(turnstile.src).toBe("https://challenges.cloudflare.com/turnstile/v0/api.js");
      expect(turnstile.crossOrigin).toBe("anonymous");
      expect(turnstile.integrity).toMatch(/^sha384-/);
      expect(isValidSriHash(turnstile.integrity)).toBe(true);
    });
  });
});
