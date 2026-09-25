/** A merchant's webhook endpoint configuration. */
export interface MerchantWebhookConfig {
  webhookUrl: string;
  secretKey: string;
  subscribedEvents: (
    | "order.created"
    | "escrow.funded"
    | "escrow.released"
    | "dispute.opened"
  )[];
  isActive: boolean;
}

export const WEBHOOK_EVENT_TYPES: MerchantWebhookConfig["subscribedEvents"] = [
  "order.created",
  "escrow.funded",
  "escrow.released",
  "dispute.opened",
];

const STORAGE_KEY = "delego_merchant_webhook_config";

export const DEFAULT_MERCHANT_WEBHOOK_CONFIG: MerchantWebhookConfig = {
  webhookUrl: "",
  secretKey: "",
  subscribedEvents: [],
  isActive: false,
};

export function loadMerchantWebhookConfig(): MerchantWebhookConfig {
  if (typeof window === "undefined") return DEFAULT_MERCHANT_WEBHOOK_CONFIG;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_MERCHANT_WEBHOOK_CONFIG;
    return { ...DEFAULT_MERCHANT_WEBHOOK_CONFIG, ...JSON.parse(stored) };
  } catch {
    return DEFAULT_MERCHANT_WEBHOOK_CONFIG;
  }
}

export function saveMerchantWebhookConfig(config: MerchantWebhookConfig): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

/** Generates a random webhook signing secret (32 bytes, hex-encoded). */
export function generateWebhookSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Requires HTTPS in production (per acceptance criteria); allows http:// only for localhost during development. */
export function isValidWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:") return true;
    if (parsed.protocol === "http:" && process.env.NODE_ENV !== "production") {
      return parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    }
    return false;
  } catch {
    return false;
  }
}
