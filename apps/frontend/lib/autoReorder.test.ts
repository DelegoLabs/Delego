import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  DEFAULT_AUTO_REORDER_CONFIG,
  AUTO_REORDER_CONFIG_KEY,
  isValidSupplierWebhookUrl,
  maskAuthHeader,
  validateAutoReorderConfig,
  loadAutoReorderConfig,
  saveAutoReorderConfig,
  pingSupplierEndpoint,
  dispatchAutoReorderWebhook,
  triggerAutoReorderIfDepleted,
  type AutoReorderConfig,
} from "./autoReorder";

describe("autoReorder lib", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  describe("isValidSupplierWebhookUrl", () => {
    it("accepts valid https URLs", () => {
      expect(isValidSupplierWebhookUrl("https://supplier.example.com/api/restock")).toBe(true);
    });

    it("accepts http localhost URLs", () => {
      expect(isValidSupplierWebhookUrl("http://localhost:8080/restock")).toBe(true);
      expect(isValidSupplierWebhookUrl("http://127.0.0.1:4000/webhook")).toBe(true);
    });

    it("rejects non-URL strings and empty input", () => {
      expect(isValidSupplierWebhookUrl("")).toBe(false);
      expect(isValidSupplierWebhookUrl("invalid-url")).toBe(false);
      expect(isValidSupplierWebhookUrl("ftp://supplier.example.com")).toBe(false);
    });
  });

  describe("maskAuthHeader", () => {
    it("masks bearer token", () => {
      const masked = maskAuthHeader("Bearer secret_supplier_token_1234");
      expect(masked).toBe("Bearer ••••••1234");
    });

    it("masks short bearer token", () => {
      const masked = maskAuthHeader("Bearer 123");
      expect(masked).toBe("Bearer ••••••");
    });

    it("masks generic auth header", () => {
      const masked = maskAuthHeader("ApiKey 987654321");
      expect(masked).toContain("••••••••");
      expect(masked.endsWith("4321")).toBe(true);
    });

    it("handles short string", () => {
      expect(maskAuthHeader("short")).toBe("••••••••");
    });

    it("returns empty string for empty input", () => {
      expect(maskAuthHeader("")).toBe("");
    });
  });

  describe("validateAutoReorderConfig", () => {
    const validConfig: AutoReorderConfig = {
      supplierWebhookUrl: "https://supplier.example.com/api/v1/reorder",
      authHeaderMasked: "Bearer secret",
      minimumThreshold: 5,
      reorderQuantity: 50,
      isEnabled: true,
    };

    it("accepts a fully valid configuration", () => {
      const { isValid, errors } = validateAutoReorderConfig(validConfig);
      expect(isValid).toBe(true);
      expect(errors).toEqual({});
    });

    it("requires supplierWebhookUrl when isEnabled is true", () => {
      const { isValid, errors } = validateAutoReorderConfig({
        ...validConfig,
        supplierWebhookUrl: "",
        isEnabled: true,
      });
      expect(isValid).toBe(false);
      expect(errors.supplierWebhookUrl).toBeDefined();
    });

    it("rejects invalid webhook URL format", () => {
      const { isValid, errors } = validateAutoReorderConfig({
        ...validConfig,
        supplierWebhookUrl: "not-a-url",
      });
      expect(isValid).toBe(false);
      expect(errors.supplierWebhookUrl).toBeDefined();
    });

    it("allows empty webhook URL if auto-reorder is disabled", () => {
      const { isValid, errors } = validateAutoReorderConfig({
        ...validConfig,
        supplierWebhookUrl: "",
        isEnabled: false,
      });
      expect(isValid).toBe(true);
      expect(errors.supplierWebhookUrl).toBeUndefined();
    });

    it("rejects negative minimumThreshold", () => {
      const { isValid, errors } = validateAutoReorderConfig({
        ...validConfig,
        minimumThreshold: -1,
      });
      expect(isValid).toBe(false);
      expect(errors.minimumThreshold).toBeDefined();
    });

    it("rejects non-integer minimumThreshold", () => {
      const { isValid, errors } = validateAutoReorderConfig({
        ...validConfig,
        minimumThreshold: 3.5,
      });
      expect(isValid).toBe(false);
      expect(errors.minimumThreshold).toBeDefined();
    });

    it("allows 0 as minimumThreshold", () => {
      const { isValid, errors } = validateAutoReorderConfig({
        ...validConfig,
        minimumThreshold: 0,
      });
      expect(isValid).toBe(true);
      expect(errors.minimumThreshold).toBeUndefined();
    });

    it("rejects reorderQuantity of 0 or negative", () => {
      const zeroResult = validateAutoReorderConfig({
        ...validConfig,
        reorderQuantity: 0,
      });
      expect(zeroResult.isValid).toBe(false);
      expect(zeroResult.errors.reorderQuantity).toBeDefined();

      const negResult = validateAutoReorderConfig({
        ...validConfig,
        reorderQuantity: -10,
      });
      expect(negResult.isValid).toBe(false);
      expect(negResult.errors.reorderQuantity).toBeDefined();
    });

    it("rejects fractional reorderQuantity", () => {
      const { isValid, errors } = validateAutoReorderConfig({
        ...validConfig,
        reorderQuantity: 12.5,
      });
      expect(isValid).toBe(false);
      expect(errors.reorderQuantity).toBeDefined();
    });
  });

  describe("persistence (loadAutoReorderConfig / saveAutoReorderConfig)", () => {
    it("returns default config when storage is empty", () => {
      const loaded = loadAutoReorderConfig();
      expect(loaded).toEqual(DEFAULT_AUTO_REORDER_CONFIG);
    });

    it("saves and loads configuration from localStorage", () => {
      const customConfig: AutoReorderConfig = {
        supplierWebhookUrl: "https://erp.supplier.com/hooks",
        authHeaderMasked: "Bearer custom-key",
        minimumThreshold: 10,
        reorderQuantity: 100,
        isEnabled: true,
      };

      saveAutoReorderConfig(customConfig);
      const loaded = loadAutoReorderConfig();
      expect(loaded).toEqual(customConfig);
    });

    it("handles corrupted localStorage gracefully", () => {
      window.localStorage.setItem(AUTO_REORDER_CONFIG_KEY, "{ invalid json");
      const loaded = loadAutoReorderConfig();
      expect(loaded).toEqual(DEFAULT_AUTO_REORDER_CONFIG);
    });
  });

  describe("pingSupplierEndpoint", () => {
    it("returns error if URL is empty or invalid", async () => {
      const result = await pingSupplierEndpoint("invalid-url");
      expect(result.ok).toBe(false);
      expect(result.message).toContain("valid webhook URL");
    });

    it("sends mock ping request to endpoint with headers and body", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
      });
      vi.stubGlobal("fetch", mockFetch);

      const targetUrl = "https://supplier.example.com/api/ping";
      const result = await pingSupplierEndpoint(targetUrl, "Bearer token-123");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [calledUrl, options] = mockFetch.mock.calls[0];
      expect(calledUrl).toBe(targetUrl);
      expect(options.method).toBe("POST");
      expect(options.headers["Authorization"]).toBe("Bearer token-123");
      expect(options.headers["Content-Type"]).toBe("application/json");

      const body = JSON.parse(options.body);
      expect(body.event).toBe("supplier.ping");
      expect(body.data.message).toContain("mock ping");

      expect(result.ok).toBe(true);
      expect(result.status).toBe(200);
      expect(result.message).toContain("Endpoint reachable");
    });

    it("handles endpoint response failure (e.g. 500 Internal Server Error)", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await pingSupplierEndpoint("https://supplier.example.com/ping");
      expect(result.ok).toBe(false);
      expect(result.status).toBe(500);
      expect(result.message).toContain("HTTP 500");
    });

    it("handles network error rejection", async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error("Connection refused"));
      vi.stubGlobal("fetch", mockFetch);

      const result = await pingSupplierEndpoint("https://supplier.example.com/ping");
      expect(result.ok).toBe(false);
      expect(result.message).toContain("Connection failed: Connection refused");
    });
  });

  describe("dispatchAutoReorderWebhook", () => {
    const activeConfig: AutoReorderConfig = {
      supplierWebhookUrl: "https://erp.supplier.com/orders/restock",
      authHeaderMasked: "Bearer auth-token",
      minimumThreshold: 5,
      reorderQuantity: 25,
      isEnabled: true,
    };

    it("does not dispatch if isEnabled is false", async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal("fetch", mockFetch);

      const result = await dispatchAutoReorderWebhook({
        sku: "WIDGET-01",
        currentStock: 2,
        config: { ...activeConfig, isEnabled: false },
      });

      expect(result.ok).toBe(true);
      expect(result.dispatched).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("does not dispatch if stock is strictly above minimum threshold", async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal("fetch", mockFetch);

      const result = await dispatchAutoReorderWebhook({
        sku: "WIDGET-01",
        currentStock: 10,
        config: activeConfig,
      });

      expect(result.ok).toBe(true);
      expect(result.dispatched).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("dispatches webhook payload with SKU and restock quantity upon breaching minimum threshold", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await dispatchAutoReorderWebhook({
        sku: "SKU-SOLO-99",
        currentStock: 3,
        productId: "prod-123",
        title: "Gadget Pro",
        config: activeConfig,
      });

      expect(result.ok).toBe(true);
      expect(result.dispatched).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe("https://erp.supplier.com/orders/restock");
      expect(init.method).toBe("POST");
      expect(init.headers["Authorization"]).toBe("Bearer auth-token");

      const body = JSON.parse(init.body);
      expect(body.sku).toBe("SKU-SOLO-99");
      expect(body.quantity).toBe(25);
      expect(body.currentStock).toBe(3);
      expect(body.minimumThreshold).toBe(5);
      expect(body.productId).toBe("prod-123");
      expect(body.title).toBe("Gadget Pro");
      expect(body.timestamp).toBeDefined();
    });

    it("fires automatically when stock reaches exact minimum threshold", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await dispatchAutoReorderWebhook({
        sku: "SKU-BORDER",
        currentStock: 5,
        config: activeConfig,
      });

      expect(result.ok).toBe(true);
      expect(result.dispatched).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("fires automatically when stock drops to 0 (fully depleted)", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await dispatchAutoReorderWebhook({
        sku: "SKU-EMPTY",
        currentStock: 0,
        config: activeConfig,
      });

      expect(result.ok).toBe(true);
      expect(result.dispatched).toBe(true);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.sku).toBe("SKU-EMPTY");
      expect(body.currentStock).toBe(0);
      expect(body.quantity).toBe(25);
    });

    it("handles webhook dispatch HTTP error response", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await dispatchAutoReorderWebhook({
        sku: "SKU-FAIL",
        currentStock: 1,
        config: activeConfig,
      });

      expect(result.ok).toBe(false);
      expect(result.dispatched).toBe(true);
      expect(result.error).toContain("400");
    });
  });

  describe("triggerAutoReorderIfDepleted", () => {
    it("dispatches and suppresses duplicate dispatches within 5 seconds", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      });
      vi.stubGlobal("fetch", mockFetch);

      const config: AutoReorderConfig = {
        supplierWebhookUrl: "https://erp.supplier.com/hooks",
        authHeaderMasked: "",
        minimumThreshold: 5,
        reorderQuantity: 20,
        isEnabled: true,
      };

      // First call -> dispatches
      const first = await triggerAutoReorderIfDepleted({
        sku: "DEDUPE-SKU",
        currentStock: 2,
        config,
      });
      expect(first.dispatched).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second immediate call with same SKU and stock -> suppressed
      const second = await triggerAutoReorderIfDepleted({
        sku: "DEDUPE-SKU",
        currentStock: 2,
        config,
      });
      expect(second.dispatched).toBe(false);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });
});
