import type { AutoReorderConfig } from "@delegolabs/types";

export type { AutoReorderConfig };

export const AUTO_REORDER_CONFIG_KEY = "delego_merchant_auto_reorder_config";
export const AUTO_REORDER_EVENT = "delego:auto-reorder-config";

export const DEFAULT_AUTO_REORDER_CONFIG: AutoReorderConfig = {
  supplierWebhookUrl: "",
  authHeaderMasked: "",
  minimumThreshold: 5,
  reorderQuantity: 20,
  isEnabled: false,
};

export function isValidSupplierWebhookUrl(url: string): boolean {
  if (!url || typeof url !== "string") return false;
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol === "https:") return true;
    if (parsed.protocol === "http:") {
      return (
        parsed.hostname === "localhost" ||
        parsed.hostname === "127.0.0.1" ||
        process.env.NODE_ENV !== "production"
      );
    }
    return false;
  } catch {
    return false;
  }
}

export function maskAuthHeader(header: string): string {
  if (!header) return "";
  const trimmed = header.trim();
  if (trimmed.length <= 8) return "••••••••";
  if (trimmed.toLowerCase().startsWith("bearer ")) {
    const token = trimmed.slice(7).trim();
    if (token.length <= 6) return "Bearer ••••••";
    return `Bearer ••••••${token.slice(-4)}`;
  }
  return `••••••••${trimmed.slice(-4)}`;
}

export interface AutoReorderValidationErrors {
  supplierWebhookUrl?: string;
  authHeaderMasked?: string;
  minimumThreshold?: string;
  reorderQuantity?: string;
}

export function validateAutoReorderConfig(
  config: Partial<AutoReorderConfig>
): { isValid: boolean; errors: AutoReorderValidationErrors } {
  const errors: AutoReorderValidationErrors = {};

  const url = (config.supplierWebhookUrl ?? "").trim();
  if (config.isEnabled) {
    if (!url) {
      errors.supplierWebhookUrl = "Supplier webhook URL is required when auto-reorder is enabled.";
    } else if (!isValidSupplierWebhookUrl(url)) {
      errors.supplierWebhookUrl = "Webhook URL must be a valid HTTPS URL (or HTTP for localhost).";
    }
  } else if (url && !isValidSupplierWebhookUrl(url)) {
    errors.supplierWebhookUrl = "Webhook URL must be a valid HTTPS URL (or HTTP for localhost).";
  }

  const threshold = config.minimumThreshold;
  if (threshold === undefined || threshold === null || String(threshold).trim() === "") {
    errors.minimumThreshold = "Minimum threshold is required.";
  } else {
    const parsed = typeof threshold === "number" ? threshold : Number(threshold);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
      errors.minimumThreshold = "Minimum threshold must be a whole number of 0 or greater.";
    }
  }

  const qty = config.reorderQuantity;
  if (qty === undefined || qty === null || String(qty).trim() === "") {
    errors.reorderQuantity = "Reorder quantity is required.";
  } else {
    const parsed = typeof qty === "number" ? qty : Number(qty);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
      errors.reorderQuantity = "Reorder quantity must be a whole number of at least 1.";
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

export function loadAutoReorderConfig(): AutoReorderConfig {
  if (typeof window === "undefined") return DEFAULT_AUTO_REORDER_CONFIG;
  try {
    const stored = window.localStorage.getItem(AUTO_REORDER_CONFIG_KEY);
    if (!stored) return DEFAULT_AUTO_REORDER_CONFIG;
    const parsed = JSON.parse(stored) as Partial<AutoReorderConfig>;
    return {
      ...DEFAULT_AUTO_REORDER_CONFIG,
      ...parsed,
      minimumThreshold:
        parsed.minimumThreshold !== undefined && Number.isFinite(Number(parsed.minimumThreshold))
          ? Math.max(0, Math.trunc(Number(parsed.minimumThreshold)))
          : DEFAULT_AUTO_REORDER_CONFIG.minimumThreshold,
      reorderQuantity:
        parsed.reorderQuantity !== undefined && Number.isFinite(Number(parsed.reorderQuantity))
          ? Math.max(1, Math.trunc(Number(parsed.reorderQuantity)))
          : DEFAULT_AUTO_REORDER_CONFIG.reorderQuantity,
      isEnabled: Boolean(parsed.isEnabled),
    };
  } catch {
    return DEFAULT_AUTO_REORDER_CONFIG;
  }
}

export function saveAutoReorderConfig(config: AutoReorderConfig): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AUTO_REORDER_CONFIG_KEY, JSON.stringify(config));
    window.dispatchEvent(new CustomEvent(AUTO_REORDER_EVENT, { detail: config }));
  } catch {
    // Ignore storage quota or disabled storage errors
  }
}

export function subscribeAutoReorderConfig(
  listener: (config: AutoReorderConfig) => void
): () => void {
  if (typeof window === "undefined") return () => {};
  const onCustom = (event: Event) => {
    listener((event as CustomEvent<AutoReorderConfig>).detail || loadAutoReorderConfig());
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== AUTO_REORDER_CONFIG_KEY) return;
    listener(loadAutoReorderConfig());
  };
  window.addEventListener(AUTO_REORDER_EVENT, onCustom);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(AUTO_REORDER_EVENT, onCustom);
    window.removeEventListener("storage", onStorage);
  };
}

export async function pingSupplierEndpoint(
  url: string,
  authHeader?: string
): Promise<{ ok: boolean; status?: number; message: string }> {
  if (!url || !isValidSupplierWebhookUrl(url)) {
    return {
      ok: false,
      message: "Please enter a valid webhook URL before testing connectivity.",
    };
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (authHeader && authHeader.trim()) {
    headers["Authorization"] = authHeader.trim();
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        event: "supplier.ping",
        timestamp: new Date().toISOString(),
        data: {
          message: "Delego auto-reorder mock ping connectivity test",
        },
      }),
    });

    if (res.ok) {
      return {
        ok: true,
        status: res.status,
        message: `Endpoint reachable (${res.status} ${res.statusText || "OK"})`,
      };
    } else {
      return {
        ok: false,
        status: res.status,
        message: `Endpoint responded with HTTP ${res.status}`,
      };
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Network error";
    return {
      ok: false,
      message: `Connection failed: ${msg}`,
    };
  }
}

export interface RestockWebhookPayload {
  event: "inventory.depleted" | "inventory.reorder";
  sku: string;
  quantity: number;
  currentStock: number;
  minimumThreshold: number;
  productId?: string;
  title?: string;
  timestamp: string;
  data: {
    sku: string;
    quantity: number;
    currentStock: number;
    minimumThreshold: number;
    productId?: string;
  };
}

export async function dispatchAutoReorderWebhook(params: {
  sku: string;
  currentStock: number;
  productId?: string;
  title?: string;
  config?: AutoReorderConfig;
}): Promise<{ ok: boolean; dispatched: boolean; status?: number; error?: string }> {
  const config = params.config ?? loadAutoReorderConfig();

  if (!config.isEnabled || !config.supplierWebhookUrl) {
    return { ok: true, dispatched: false };
  }

  // Trigger fires when inventory breaches minimum threshold
  if (params.currentStock > config.minimumThreshold) {
    return { ok: true, dispatched: false };
  }

  const payload: RestockWebhookPayload = {
    event: "inventory.depleted",
    sku: params.sku,
    quantity: config.reorderQuantity,
    currentStock: params.currentStock,
    minimumThreshold: config.minimumThreshold,
    productId: params.productId,
    title: params.title,
    timestamp: new Date().toISOString(),
    data: {
      sku: params.sku,
      quantity: config.reorderQuantity,
      currentStock: params.currentStock,
      minimumThreshold: config.minimumThreshold,
      productId: params.productId,
    },
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.authHeaderMasked && config.authHeaderMasked.trim()) {
    headers["Authorization"] = config.authHeaderMasked.trim();
  }

  try {
    const res = await fetch(config.supplierWebhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    return {
      ok: res.ok,
      dispatched: true,
      status: res.status,
      error: res.ok ? undefined : `Supplier responded with status ${res.status}`,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Network error";
    return {
      ok: false,
      dispatched: true,
      error: errorMsg,
    };
  }
}

/** Track dispatches in session to prevent duplicate spam for the same SKU at the same stock level */
const recentDispatches = new Map<string, number>();

export async function triggerAutoReorderIfDepleted(product: {
  sku: string;
  currentStock: number;
  productId?: string;
  title?: string;
  config?: AutoReorderConfig;
}): Promise<{ ok: boolean; dispatched: boolean; error?: string }> {
  const config = product.config ?? loadAutoReorderConfig();
  if (!config.isEnabled || !config.supplierWebhookUrl) {
    return { ok: true, dispatched: false };
  }

  if (product.currentStock > config.minimumThreshold) {
    return { ok: true, dispatched: false };
  }

  const dedupeKey = `${product.sku}:${product.currentStock}`;
  const now = Date.now();
  const lastTime = recentDispatches.get(dedupeKey);
  // Don't re-dispatch within 5 seconds for same SKU and same stock count
  if (lastTime && now - lastTime < 5000) {
    return { ok: true, dispatched: false };
  }

  recentDispatches.set(dedupeKey, now);
  return dispatchAutoReorderWebhook({
    sku: product.sku,
    currentStock: product.currentStock,
    productId: product.productId,
    title: product.title,
    config,
  });
}
