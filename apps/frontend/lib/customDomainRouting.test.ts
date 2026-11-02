import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  isValidCustomDomain,
  getRoutingDiagnosticInstructions,
  loadStoredDomainRouting,
  saveStoredDomainRouting,
  validateDomainRouting,
  DEFAULT_CNAME_TARGET,
  CUSTOM_DOMAIN_STORAGE_KEY,
  type DomainRoutingStatus,
} from "./customDomainRouting";

describe("customDomainRouting lib (#1008)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  describe("isValidCustomDomain", () => {
    it("accepts valid domain names and subdomains", () => {
      expect(isValidCustomDomain("shop.mybrand.com")).toBe(true);
      expect(isValidCustomDomain("store.stellar-pay.org")).toBe(true);
      expect(isValidCustomDomain("my-brand.co.uk")).toBe(true);
      expect(isValidCustomDomain("app.delego.market")).toBe(true);
    });

    it("rejects empty, localhost, IP addresses, or malformed inputs", () => {
      expect(isValidCustomDomain("")).toBe(false);
      expect(isValidCustomDomain("   ")).toBe(false);
      expect(isValidCustomDomain("localhost")).toBe(false);
      expect(isValidCustomDomain("127.0.0.1")).toBe(false);
      expect(isValidCustomDomain("192.168.1.1")).toBe(false);
      expect(isValidCustomDomain("http://shop.brand.com")).toBe(false);
      expect(isValidCustomDomain("invalid_domain")).toBe(false);
      expect(isValidCustomDomain("-bad-label.com")).toBe(false);
    });
  });

  describe("getRoutingDiagnosticInstructions", () => {
    it("returns CNAME instructions when CNAME is not configured", () => {
      const status: DomainRoutingStatus = {
        domain: "shop.mybrand.com",
        cnameTarget: DEFAULT_CNAME_TARGET,
        isCnameConfigured: false,
        sslStatus: "pending",
        lastCheckedAt: new Date().toISOString(),
      };
      const instructions = getRoutingDiagnosticInstructions(status);
      expect(instructions.length).toBeGreaterThanOrEqual(3);
      expect(instructions[0]).toContain(`pointing "shop.mybrand.com" to "cname.delego.market"`);
      expect(instructions[1]).toContain("DNS Only");
    });

    it("returns SSL error instruction when sslStatus is error", () => {
      const status: DomainRoutingStatus = {
        domain: "shop.mybrand.com",
        cnameTarget: DEFAULT_CNAME_TARGET,
        isCnameConfigured: true,
        sslStatus: "error",
        lastCheckedAt: new Date().toISOString(),
      };
      const instructions = getRoutingDiagnosticInstructions(status);
      expect(instructions.some((i) => i.includes("CAA records"))).toBe(true);
    });

    it("returns empty instructions when fully configured and active", () => {
      const status: DomainRoutingStatus = {
        domain: "shop.mybrand.com",
        cnameTarget: DEFAULT_CNAME_TARGET,
        isCnameConfigured: true,
        sslStatus: "active",
        lastCheckedAt: new Date().toISOString(),
      };
      const instructions = getRoutingDiagnosticInstructions(status);
      expect(instructions).toHaveLength(0);
    });
  });

  describe("localStorage persistence", () => {
    it("saves and loads routing status correctly", () => {
      const status: DomainRoutingStatus = {
        domain: "shop.mybrand.com",
        cnameTarget: DEFAULT_CNAME_TARGET,
        isCnameConfigured: true,
        sslStatus: "active",
        lastCheckedAt: "2026-11-02T10:00:00.000Z",
      };

      saveStoredDomainRouting(status);
      expect(window.localStorage.getItem(CUSTOM_DOMAIN_STORAGE_KEY)).toContain("shop.mybrand.com");

      const loaded = loadStoredDomainRouting();
      expect(loaded).toEqual(status);
    });

    it("returns null when storage is empty or invalid JSON", () => {
      expect(loadStoredDomainRouting()).toBeNull();
      window.localStorage.setItem(CUSTOM_DOMAIN_STORAGE_KEY, "invalid-json{");
      expect(loadStoredDomainRouting()).toBeNull();
    });
  });

  describe("validateDomainRouting", () => {
    it("handles invalid domain formats gracefully", async () => {
      const result = await validateDomainRouting("not-a-domain");
      expect(result.isCnameConfigured).toBe(false);
      expect(result.sslStatus).toBe("error");
    });

    it("detects configured CNAME via DoH mock response", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          Answer: [
            { name: "shop.mybrand.com.", type: 5, data: "cname.delego.market." },
          ],
        }),
      } as Response);

      const result = await validateDomainRouting("shop.mybrand.com", DEFAULT_CNAME_TARGET, mockFetch);
      expect(result.isCnameConfigured).toBe(true);
      expect(result.sslStatus).toBe("active");
      expect(mockFetch).toHaveBeenCalled();
    });

    it("detects unconfigured CNAME when DoH does not return matching target", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          Answer: [
            { name: "shop.mybrand.com.", type: 1, data: "192.0.2.1" },
          ],
        }),
      } as Response);

      const result = await validateDomainRouting("shop.mybrand.com", DEFAULT_CNAME_TARGET, mockFetch);
      expect(result.isCnameConfigured).toBe(false);
      expect(result.sslStatus).toBe("pending");
    });
  });
});
