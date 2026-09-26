/**
 * Webhook activity / delivery log viewer data layer (#725).
 *
 * There is no gateway endpoint that lists past deliveries yet, so the log is
 * persisted client-side in `localStorage` — the same pattern as
 * `lib/merchantWebhooks.ts`. `TODO`: replace the storage helpers with
 * `GET /webhooks/deliveries` once the gateway exposes it; the exported
 * `WebhookDeliveryLog` shape is already the one the API should return.
 */

export interface WebhookDeliveryLog {
  id: string;
  eventId: string;
  eventType: string;
  targetUrl: string;
  statusCode: number;
  durationMs: number;
  deliveredAt: string;
  /** Truncated copy of the request body, for "what did we actually send?". */
  requestBodySnippet: string;
}

export const WEBHOOK_LOG_STORAGE_KEY = "delego_webhook_delivery_logs";

/** Newest-first, capped so `localStorage` can't grow without bound. */
export const MAX_DELIVERY_LOGS = 100;

/** Characters of the request body kept in the snippet. */
export const SNIPPET_MAX_LENGTH = 280;

// ─── Status classification ───────────────────────────────────────────────────

/** True for any 2xx — the delivery is considered a success. */
export function isSuccessfulStatus(statusCode: number): boolean {
  return statusCode >= 200 && statusCode <= 299;
}

/** `true` → "success", anything else → "error" (drives the red badge). */
export function statusTone(statusCode: number): "success" | "error" {
  return isSuccessfulStatus(statusCode) ? "success" : "error";
}

const STATUS_LABELS: Record<number, string> = {
  200: "OK",
  201: "Created",
  202: "Accepted",
  204: "No Content",
  301: "Moved Permanently",
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  408: "Request Timeout",
  410: "Gone",
  422: "Unprocessable Entity",
  429: "Too Many Requests",
  500: "Internal Server Error",
  502: "Bad Gateway",
  503: "Service Unavailable",
  504: "Gateway Timeout",
};

/** "200 OK" / "418 Unknown" — the human label beside the badge. */
export function statusLabel(statusCode: number): string {
  const known = STATUS_LABELS[statusCode];
  if (known) return `${statusCode} ${known}`;
  if (isSuccessfulStatus(statusCode)) return `${statusCode} Success`;
  return `${statusCode} Failed`;
}

/** "412 ms" / "1.42 s" — compact, for a narrow table cell. */
export function formatDuration(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs < 0) return "—";
  if (durationMs < 1000) return `${Math.round(durationMs)} ms`;
  return `${(durationMs / 1000).toFixed(2)} s`;
}

// ─── Payload snippet ─────────────────────────────────────────────────────────

/**
 * Truncates a request body to a single-line, length-capped preview. Control
 * characters are escaped so a log table can never be broken (or spoofed) by
 * a payload containing newlines or ANSI escapes.
 */
export function buildRequestBodySnippet(
  body: string,
  maxLength: number = SNIPPET_MAX_LENGTH
): string {
  const flattened = (body ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .trim();
  if (flattened.length <= maxLength) return flattened;
  return `${flattened.slice(0, maxLength - 1)}…`;
}

// ─── Building entries ────────────────────────────────────────────────────────

export interface BuildDeliveryLogInput {
  eventId: string;
  eventType: string;
  targetUrl: string;
  statusCode: number;
  durationMs: number;
  requestBody: string;
  deliveredAt?: string;
  id?: string;
}

function randomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Normalises a raw delivery into a `WebhookDeliveryLog`. */
export function buildDeliveryLog(input: BuildDeliveryLogInput): WebhookDeliveryLog {
  return {
    id: input.id ?? `whd_${randomId()}`,
    eventId: input.eventId,
    eventType: input.eventType,
    targetUrl: input.targetUrl,
    statusCode: input.statusCode,
    durationMs: input.durationMs,
    deliveredAt: input.deliveredAt ?? new Date().toISOString(),
    requestBodySnippet: buildRequestBodySnippet(input.requestBody),
  };
}

// ─── Persistence ─────────────────────────────────────────────────────────────

function isLogShape(value: unknown): value is WebhookDeliveryLog {
  if (!value || typeof value !== "object") return false;
  const log = value as Record<string, unknown>;
  return (
    typeof log.id === "string" &&
    typeof log.eventId === "string" &&
    typeof log.eventType === "string" &&
    typeof log.targetUrl === "string" &&
    typeof log.statusCode === "number" &&
    typeof log.durationMs === "number" &&
    typeof log.deliveredAt === "string" &&
    typeof log.requestBodySnippet === "string"
  );
}

export function loadWebhookDeliveryLogs(): WebhookDeliveryLog[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(WEBHOOK_LOG_STORAGE_KEY);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isLogShape).slice(0, MAX_DELIVERY_LOGS);
  } catch {
    return [];
  }
}

export function saveWebhookDeliveryLogs(logs: WebhookDeliveryLog[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      WEBHOOK_LOG_STORAGE_KEY,
      JSON.stringify(logs.slice(0, MAX_DELIVERY_LOGS))
    );
  } catch {
    // Quota exceeded or storage disabled — the log is best-effort only.
  }
}

/** Prepends a new delivery and persists the trimmed list. */
export function recordWebhookDelivery(
  log: WebhookDeliveryLog,
  existing: WebhookDeliveryLog[] = loadWebhookDeliveryLogs()
): WebhookDeliveryLog[] {
  const next = [log, ...existing].slice(0, MAX_DELIVERY_LOGS);
  saveWebhookDeliveryLogs(next);
  return next;
}

export function clearWebhookDeliveryLogs(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(WEBHOOK_LOG_STORAGE_KEY);
}

// ─── Filtering ───────────────────────────────────────────────────────────────

export interface DeliveryLogFilters {
  /** Free-text match against event id, event type, and target URL. */
  search?: string;
  /** `"success"` keeps 2xx, `"error"` keeps everything else, omit for all. */
  outcome?: "success" | "error";
}

/** Newest-first, with search and outcome filters applied. */
export function filterDeliveryLogs(
  logs: WebhookDeliveryLog[],
  filters: DeliveryLogFilters = {}
): WebhookDeliveryLog[] {
  const search = filters.search?.trim().toLowerCase();
  return [...logs]
    .sort((a, b) => (a.deliveredAt < b.deliveredAt ? 1 : a.deliveredAt > b.deliveredAt ? -1 : 0))
    .filter((log) => {
      if (filters.outcome === "success" && !isSuccessfulStatus(log.statusCode)) return false;
      if (filters.outcome === "error" && isSuccessfulStatus(log.statusCode)) return false;
      if (!search) return true;
      return [log.id, log.eventId, log.eventType, log.targetUrl]
        .join(" ")
        .toLowerCase()
        .includes(search);
    });
}

export interface DeliveryLogSummary {
  total: number;
  succeeded: number;
  failed: number;
  /** Mean duration across every delivery, 0 when the log is empty. */
  averageDurationMs: number;
}

export function summarizeDeliveryLogs(
  logs: WebhookDeliveryLog[]
): DeliveryLogSummary {
  const succeeded = logs.filter((log) => isSuccessfulStatus(log.statusCode)).length;
  const durationTotal = logs.reduce((sum, log) => sum + (log.durationMs || 0), 0);
  return {
    total: logs.length,
    succeeded,
    failed: logs.length - succeeded,
    averageDurationMs:
      logs.length === 0 ? 0 : Math.round(durationTotal / logs.length),
  };
}
