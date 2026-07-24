import { describe, it, expect, beforeEach } from "vitest";
import {
  parseVersion,
  formatVersion,
  isVersionSupported,
  isVersionDeprecated,
  negotiateVersion,
  getCurrentVersion,
  getSupportedVersions,
  registerDeprecatedVersion,
  getDeprecationHeaders,
  type ApiVersion,
} from "./versioning.js";

describe("API Versioning", () => {
  beforeEach(() => {
    // Clear any registered deprecated versions
    // Note: In a real implementation, we'd have a reset function
  });

  describe("parseVersion", () => {
    it("parses valid version string", () => {
      const version = parseVersion("1.0.0");
      expect(version).toEqual({ major: 1, minor: 0, patch: 0 });
    });

    it("parses version with multiple digits", () => {
      const version = parseVersion("12.34.56");
      expect(version).toEqual({ major: 12, minor: 34, patch: 56 });
    });

    it("returns null for invalid version string", () => {
      expect(parseVersion("invalid")).toBeNull();
      expect(parseVersion("1.0")).toBeNull();
      expect(parseVersion("v1.0.0")).toBeNull();
      expect(parseVersion("")).toBeNull();
    });
  });

  describe("formatVersion", () => {
    it("formats version correctly", () => {
      const version: ApiVersion = { major: 1, minor: 2, patch: 3 };
      expect(formatVersion(version)).toBe("1.2.3");
    });
  });

  describe("isVersionSupported", () => {
    it("returns true for supported version", () => {
      const version: ApiVersion = { major: 1, minor: 0, patch: 0 };
      expect(isVersionSupported(version)).toBe(true);
    });

    it("returns false for unsupported version", () => {
      const version: ApiVersion = { major: 2, minor: 0, patch: 0 };
      expect(isVersionSupported(version)).toBe(false);
    });
  });

  describe("negotiateVersion", () => {
    it("returns current version when no version requested", () => {
      const result = negotiateVersion(null);
      expect(result.version).toEqual({ major: 1, minor: 0, patch: 0 });
    });

    it("returns requested version when supported", () => {
      const result = negotiateVersion("1.0.0");
      expect(result.version).toEqual({ major: 1, minor: 0, patch: 0 });
    });

    it("returns current version when unsupported version requested", () => {
      const result = negotiateVersion("2.0.0");
      expect(result.version).toEqual({ major: 1, minor: 0, patch: 0 });
    });

    it("returns current version when invalid version requested", () => {
      const result = negotiateVersion("invalid");
      expect(result.version).toEqual({ major: 1, minor: 0, patch: 0 });
    });
  });

  describe("getCurrentVersion", () => {
    it("returns current version", () => {
      const version = getCurrentVersion();
      expect(version).toEqual({ major: 1, minor: 0, patch: 0 });
    });
  });

  describe("getSupportedVersions", () => {
    it("returns supported versions", () => {
      const versions = getSupportedVersions();
      expect(versions).toEqual([{ major: 1, minor: 0, patch: 0 }]);
    });
  });

  describe("getDeprecationHeaders", () => {
    it("returns version headers", () => {
      const version: ApiVersion = { major: 1, minor: 0, patch: 0 };
      const headers = getDeprecationHeaders(version);
      expect(headers["X-API-Version"]).toBe("1.0.0");
      expect(headers["X-API-Current-Version"]).toBe("1.0.0");
    });
  });
});