import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CNAME_TARGET,
  CUSTOM_DOMAIN_STORAGE_KEY,
  DOMAIN_ROUTING_STATUS_STORAGE_KEY,
  checkDomainRouting,
  clearDomainRoutingStatus,
  extractCnameTargets,
  hasExpectedCname,
  isValidDomain,
  loadCustomDomain,
  loadDomainRoutingStatus,
  normalizeDomain,
  saveCustomDomain,
  saveDomainRoutingStatus,
  type DomainRoutingStatus,
} from "./domainRouting";

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

function cnameFetch(data: string | null) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("https://cloudflare-dns.com/dns-query")) {
      return jsonResponse(
        data === null
          ? { Status: 3 }
          : {
              Status: 0,
              Answer: [{ name: "shop.mybrand.com.", type: 5, data }],
            }
      );
    }
    if (url.startsWith("https://shop.mybrand.com/")) {
      return jsonResponse({});
    }
    throw new Error(`Unexpected request: ${url}`);
  }) as unknown as typeof fetch;
}

const storedStatus: DomainRoutingStatus = {
  domain: "shop.mybrand.com",
  cnameTarget: CNAME_TARGET,
  isCnameConfigured: true,
  sslStatus: "active",
  lastCheckedAt: "2026-10-23T12:00:00.000Z",
};

describe("domainRouting", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  describe("normalizeDomain", () => {
    it("strips protocol, path, port, whitespace, and trailing dots", () => {
      expect(normalizeDomain("  HTTPS://Shop.MyBrand.com:443/storefront?ref=1  ")).toBe(
        "shop.mybrand.com"
      );
      expect(normalizeDomain("shop.mybrand.com.")).toBe("shop.mybrand.com");
    });
  });

  describe("isValidDomain", () => {
    it("accepts storefront subdomains", () => {
      expect(isValidDomain("shop.mybrand.com")).toBe(true);
      expect(isValidDomain("https://shop.mybrand.co.uk")).toBe(true);
      expect(isValidDomain("my-store.io")).toBe(true);
    });

    it("rejects malformed domains", () => {
      expect(isValidDomain("")).toBe(false);
      expect(isValidDomain("example")).toBe(false);
      expect(isValidDomain("example..com")).toBe(false);
      expect(isValidDomain("-shop.mybrand.com")).toBe(false);
      expect(isValidDomain("shop.mybrand.c")).toBe(false);
    });
  });

  describe("CNAME matching", () => {
    it("extracts only CNAME answers and normalizes trailing dots", () => {
      expect(
        extractCnameTargets({
          Answer: [
            { type: 1, data: "203.0.113.10" },
            { type: 5, data: "CNAME.delego.market." },
          ],
        })
      ).toEqual(["cname.delego.market"]);
    });

    it("matches the configured target case-insensitively", () => {
      expect(hasExpectedCname(["CNAME.DELEGO.MARKET."])).toBe(true);
      expect(hasExpectedCname(["edge.cdn.example.com"])).toBe(false);
    });
  });

  describe("checkDomainRouting", () => {
    it("reports a configured CNAME and active SSL certificate", async () => {
      const result = await checkDomainRouting("Shop.MyBrand.com", {
        fetchImpl: cnameFetch("cname.delego.market."),
        now: () => new Date("2026-10-23T12:00:00Z"),
      });

      expect(result).toEqual({
        domain: "shop.mybrand.com",
        cnameTarget: CNAME_TARGET,
        isCnameConfigured: true,
        sslStatus: "active",
        lastCheckedAt: "2026-10-23T12:00:00.000Z",
      });
    });

    it("reports a misconfigured CNAME and marks SSL as errored", async () => {
      const fetchImpl = cnameFetch("shop.other-provider.com.");
      const result = await checkDomainRouting("shop.mybrand.com", {
        fetchImpl,
        now: () => new Date("2026-10-23T12:00:00Z"),
      });

      expect(result.isCnameConfigured).toBe(false);
      expect(result.sslStatus).toBe("error");
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it("reports a pending certificate when HTTPS is not reachable yet", async () => {
      const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith("https://cloudflare-dns.com/dns-query")) {
          return jsonResponse({
            Status: 0,
            Answer: [{ type: 5, data: "cname.delego.market." }],
          });
        }
        throw new Error("TLS handshake failed");
      }) as unknown as typeof fetch;

      const result = await checkDomainRouting("shop.mybrand.com", {
        fetchImpl,
        now: () => new Date("2026-10-23T12:00:00Z"),
      });

      expect(result.isCnameConfigured).toBe(true);
      expect(result.sslStatus).toBe("pending");
    });

    it("treats NXDOMAIN as a missing CNAME record", async () => {
      const result = await checkDomainRouting("shop.mybrand.com", {
        fetchImpl: cnameFetch(null),
        now: () => new Date("2026-10-23T12:00:00Z"),
      });

      expect(result.isCnameConfigured).toBe(false);
      expect(result.sslStatus).toBe("error");
    });

    it("throws when the DNS lookup itself fails", async () => {
      const fetchImpl = vi.fn(async () => jsonResponse({}, 503)) as unknown as typeof fetch;

      await expect(
        checkDomainRouting("shop.mybrand.com", { fetchImpl })
      ).rejects.toThrow("DNS lookup failed (503).");
    });

    it("rejects invalid domains before making a request", async () => {
      const fetchImpl = vi.fn() as unknown as typeof fetch;

      await expect(checkDomainRouting("not a domain", { fetchImpl })).rejects.toThrow(
        "Enter a valid domain name"
      );
      expect(fetchImpl).not.toHaveBeenCalled();
    });
  });

  describe("persistence", () => {
    it("stores and reloads the custom domain", () => {
      saveCustomDomain("https://Shop.MyBrand.com/store");
      expect(window.localStorage.getItem(CUSTOM_DOMAIN_STORAGE_KEY)).toBe(
        "shop.mybrand.com"
      );
      expect(loadCustomDomain()).toBe("shop.mybrand.com");
    });

    it("stores and reloads a routing status", () => {
      saveDomainRoutingStatus(storedStatus);
      expect(window.localStorage.getItem(DOMAIN_ROUTING_STATUS_STORAGE_KEY)).not.toBeNull();
      expect(loadDomainRoutingStatus()).toEqual(storedStatus);

      clearDomainRoutingStatus();
      expect(loadDomainRoutingStatus()).toBeNull();
    });

    it("ignores malformed persisted status", () => {
      window.localStorage.setItem(DOMAIN_ROUTING_STATUS_STORAGE_KEY, '{"domain":42}');
      expect(loadDomainRoutingStatus()).toBeNull();
    });
  });
});
