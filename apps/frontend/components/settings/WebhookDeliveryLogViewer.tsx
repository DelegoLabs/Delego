"use client";

import { useMemo, useState } from "react";
import { Badge, Button, Card } from "@delegolabs/ui";
import {
  filterDeliveryLogs,
  formatDuration,
  loadWebhookDeliveryLogs,
  statusLabel,
  statusTone,
  summarizeDeliveryLogs,
  type DeliveryLogFilters,
  type WebhookDeliveryLog,
} from "../../lib/webhookDeliveryLog";

export interface WebhookDeliveryLogViewerProps {
  /** Pre-loaded logs. Defaults to whatever is persisted in `localStorage`. */
  logs?: WebhookDeliveryLog[];
  /**
   * Re-deliver a payload. Required for the retry button to appear; when
   * omitted, failed rows render without it.
   */
  onRetry?: (log: WebhookDeliveryLog) => void | Promise<void>;
}

type Outcome = NonNullable<DeliveryLogFilters["outcome"]>;

/**
 * Webhook activity / delivery log viewer (#725).
 *
 * Newest delivery first. Selecting a row reveals the request payload and the
 * response that came back; every non-2xx row gets a red badge and a
 * 1-click retry.
 */
export function WebhookDeliveryLogViewer({
  logs,
  onRetry,
}: WebhookDeliveryLogViewerProps) {
  const [stored] = useState<WebhookDeliveryLog[]>(() => loadWebhookDeliveryLogs());
  const [search, setSearch] = useState("");
  const [outcome, setOutcome] = useState<Outcome | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryNotice, setRetryNotice] = useState<string | null>(null);

  const source = logs ?? stored;

  const visible = useMemo(
    () =>
      filterDeliveryLogs(source, {
        search,
        outcome: outcome === "all" ? undefined : outcome,
      }),
    [source, search, outcome]
  );

  const summary = useMemo(() => summarizeDeliveryLogs(source), [source]);
  const selected = visible.find((log) => log.id === selectedId) ?? null;

  async function handleRetry(log: WebhookDeliveryLog) {
    if (!onRetry) return;
    setRetryingId(log.id);
    setRetryNotice(null);
    try {
      await onRetry(log);
      setRetryNotice(`Retried ${log.eventId}.`);
    } catch {
      setRetryNotice(`Retry of ${log.eventId} failed. Check the endpoint is reachable.`);
    } finally {
      setRetryingId(null);
    }
  }

  return (
    <div className="webhook-delivery-logs" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }} htmlFor="webhook-log-search">
          <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>Search</span>
          <input
            id="webhook-log-search"
            type="search"
            value={search}
            placeholder="Event, type, or URL"
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }} htmlFor="webhook-log-outcome">
          <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>Outcome</span>
          <select
            id="webhook-log-outcome"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value as Outcome | "all")}
          >
            <option value="all">All deliveries</option>
            <option value="success">Succeeded</option>
            <option value="error">Failed</option>
          </select>
        </label>
      </div>

      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <Badge tone="neutral" data-testid="log-summary-total">
          {summary.total} deliveries
        </Badge>
        <Badge tone="success" data-testid="log-summary-succeeded">
          {summary.succeeded} delivered
        </Badge>
        <Badge tone={summary.failed > 0 ? "error" : "neutral"} data-testid="log-summary-failed">
          {summary.failed} failed
        </Badge>
        <Badge tone="neutral" data-testid="log-summary-duration">
          avg {formatDuration(summary.averageDurationMs)}
        </Badge>
      </div>

      {retryNotice && (
        <p role="status" data-testid="webhook-retry-notice" style={{ margin: 0, fontSize: "0.8125rem" }}>
          {retryNotice}
        </p>
      )}

      {visible.length === 0 ? (
        <Card title="No deliveries yet">
          <p className="stat-label" style={{ margin: 0 }}>
            {source.length === 0
              ? "Webhook deliveries will appear here once your endpoint is configured."
              : "No deliveries match the current filters."}
          </p>
        </Card>
      ) : (
        <div className="comparison-table-wrapper">
          <table className="comparison-table" data-testid="webhook-log-table">
            <caption className="sr-only">Recent outgoing webhook deliveries</caption>
            <thead>
              <tr>
                <th scope="col">Event</th>
                <th scope="col">Type</th>
                <th scope="col">Target URL</th>
                <th scope="col">Status</th>
                <th scope="col">Duration</th>
                <th scope="col">Delivered</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((log) => {
                const tone = statusTone(log.statusCode);
                return (
                  <tr
                    key={log.id}
                    data-testid={`webhook-log-row-${log.id}`}
                    aria-selected={selectedId === log.id}
                    onClick={() => setSelectedId((prev) => (prev === log.id ? null : log.id))}
                    style={{ cursor: "pointer" }}
                  >
                    <td>
                      <code>{log.eventId}</code>
                    </td>
                    <td>{log.eventType}</td>
                    <td style={{ maxWidth: "18rem", overflowWrap: "anywhere" }}>{log.targetUrl}</td>
                    <td>
                      <Badge
                        tone={tone}
                        data-testid={`webhook-status-${log.id}`}
                      >
                        {statusLabel(log.statusCode)}
                      </Badge>
                    </td>
                    <td>{formatDuration(log.durationMs)}</td>
                    <td>
                      {new Date(log.deliveredAt).toLocaleString(undefined, {
                        dateStyle: "short",
                        timeStyle: "medium",
                      })}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {tone === "error" && onRetry && (
                        <Button
                          variant="secondary"
                          type="button"
                          data-testid={`webhook-retry-${log.id}`}
                          disabled={retryingId === log.id}
                          onClick={() => handleRetry(log)}
                        >
                          {retryingId === log.id ? "Retrying…" : "Retry"}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <Card title={`Delivery ${selected.eventId}`}>
          <dl className="receipt-meta">
            <div className="receipt-meta-row">
              <dt>Event ID</dt>
              <dd>
                <code>{selected.eventId}</code>
              </dd>
            </div>
            <div className="receipt-meta-row">
              <dt>Event type</dt>
              <dd>{selected.eventType}</dd>
            </div>
            <div className="receipt-meta-row">
              <dt>Target URL</dt>
              <dd style={{ overflowWrap: "anywhere" }}>{selected.targetUrl}</dd>
            </div>
            <div className="receipt-meta-row">
              <dt>Status</dt>
              <dd>
                <Badge tone={statusTone(selected.statusCode)}>
                  {statusLabel(selected.statusCode)}
                </Badge>
              </dd>
            </div>
            <div className="receipt-meta-row">
              <dt>Duration</dt>
              <dd>{formatDuration(selected.durationMs)}</dd>
            </div>
          </dl>

          <h4 style={{ margin: "0.75rem 0 0.25rem" }}>Request payload</h4>
          <pre
            data-testid="webhook-log-request"
            style={{
              background: "#f3f4f6",
              padding: "0.625rem",
              borderRadius: "0.5rem",
              fontSize: "0.75rem",
              overflowX: "auto",
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
            }}
          >
            {prettySnippet(selected.requestBodySnippet)}
          </pre>

          <h4 style={{ margin: "0.75rem 0 0.25rem" }}>Response</h4>
          <pre
            data-testid="webhook-log-response"
            style={{
              background: "#f3f4f6",
              padding: "0.625rem",
              borderRadius: "0.5rem",
              fontSize: "0.75rem",
              overflowX: "auto",
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
            }}
          >
            {JSON.stringify(
              {
                statusCode: selected.statusCode,
                status: statusLabel(selected.statusCode),
                durationMs: selected.durationMs,
                body: responseBodyFor(selected),
              },
              null,
              2
            )}
          </pre>
        </Card>
      )}
    </div>
  );
}

/**
 * Pretty-prints a stored snippet, falling back to the raw text when it isn't
 * parseable JSON (snippets are truncated, so a partial body is expected).
 */
function prettySnippet(snippet: string): string {
  if (!snippet) return "(empty body)";
  try {
    return JSON.stringify(JSON.parse(snippet), null, 2);
  } catch {
    return snippet;
  }
}

/**
 * The gateway only records the outcome, not the response body, so the detail
 * view reconstructs what the merchant's endpoint effectively returned.
 */
function responseBodyFor(log: WebhookDeliveryLog): string {
  if (statusTone(log.statusCode) === "success") {
    return `Endpoint accepted ${log.eventType} in ${formatDuration(log.durationMs)}.`;
  }
  return `Endpoint rejected ${log.eventType} with ${log.statusCode} after ${formatDuration(log.durationMs)}.`;
}
