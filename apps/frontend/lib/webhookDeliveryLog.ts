/**
 * Webhook activity / delivery log viewer data layer (#725).
 */

export interface WebhookDeliveryLog {
  eventId: string;
  endpointUrl: string;
  httpStatus: number;
  deliveredAt: Date;
  requestPayload: string;
  responseBody?: string;
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

export function formatDuration(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs < 0) return "—";
  if (durationMs < 1000) return `${Math.round(durationMs)} ms`;
  return `${(durationMs / 1000).toFixed(2)} s`;
}

// ─── Payload snippet ─────────────────────────────────────────────────────────

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
  endpointUrl: string;
  httpStatus: number;
  requestPayload: string;
  responseBody?: string;
  deliveredAt?: Date;
}

/** Normalises a raw delivery into a `WebhookDeliveryLog`. */
export function buildDeliveryLog(input: BuildDeliveryLogInput): WebhookDeliveryLog {
  return {
    eventId: input.eventId,
    endpointUrl: input.endpointUrl,
    httpStatus: input.httpStatus,
    deliveredAt: input.deliveredAt ?? new Date(),
    requestPayload: buildRequestBodySnippet(input.requestPayload),
    responseBody: input.responseBody,
  };
}

// ─── Persistence ─────────────────────────────────────────────────────────────

function isLogShape(value: unknown): value is WebhookDeliveryLog {
  if (!value || typeof value !== "object") return false;
  const log = value as Record<string, unknown>;
  return (
    typeof log.eventId === "string" &&
    typeof log.endpointUrl === "string" &&
    typeof log.httpStatus === "number" &&
    (typeof log.deliveredAt === "string" || log.deliveredAt instanceof Date) &&
    typeof log.requestPayload === "string"
  );
}

export function loadWebhookDeliveryLogs(): WebhookDeliveryLog[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(WEBHOOK_LOG_STORAGE_KEY);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isLogShape).map(log => ({
      ...log,
      deliveredAt: new Date(log.deliveredAt as string | Date)
    })).slice(0, MAX_DELIVERY_LOGS);
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
    .sort((a, b) => b.deliveredAt.getTime() - a.deliveredAt.getTime())
    .filter((log) => {
      if (filters.outcome === "success" && !isSuccessfulStatus(log.httpStatus)) return false;
      if (filters.outcome === "error" && isSuccessfulStatus(log.httpStatus)) return false;
      if (!search) return true;
      return [log.eventId, log.endpointUrl]
        .join(" ")
        .toLowerCase()
        .includes(search);
    });
}

export interface DeliveryLogSummary {
  total: number;
  succeeded: number;
  failed: number;
  averageDurationMs: number;
}

export function summarizeDeliveryLogs(
  logs: WebhookDeliveryLog[]
): DeliveryLogSummary {
  const succeeded = logs.filter((log) => isSuccessfulStatus(log.httpStatus)).length;
  return {
    total: logs.length,
    succeeded,
    failed: logs.length - succeeded,
    averageDurationMs: 0,
  };
}
