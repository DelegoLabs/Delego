"use client";

import { useMemo, useState } from "react";
import { Badge, Button, Card } from "@delegolabs/ui";
import {
  filterDeliveryLogs,
  loadWebhookDeliveryLogs,
  statusLabel,
  statusTone,
  summarizeDeliveryLogs,
  type DeliveryLogFilters,
  type WebhookDeliveryLog,
} from "../../lib/webhookDeliveryLog";

export interface WebhookDeliveryLogViewerProps {
  logs?: WebhookDeliveryLog[];
  onRetry?: (log: WebhookDeliveryLog) => void | Promise<void>;
}

type Outcome = NonNullable<DeliveryLogFilters["outcome"]>;

export function WebhookDeliveryLogViewer({
  logs,
  onRetry,
}: WebhookDeliveryLogViewerProps) {
  const [stored] = useState<WebhookDeliveryLog[]>(() => loadWebhookDeliveryLogs());
  const [search, setSearch] = useState("");
  const [outcome, setOutcome] = useState<Outcome | "all">("all");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [retryingEventId, setRetryingEventId] = useState<string | null>(null);
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
  const selected = visible.find((log) => log.eventId === selectedEventId) ?? null;

  async function handleRetry(log: WebhookDeliveryLog) {
    if (!onRetry) return;
    setRetryingEventId(log.eventId);
    setRetryNotice(null);
    try {
      await onRetry(log);
      setRetryNotice(`Retried ${log.eventId}.`);
    } catch {
      setRetryNotice(`Retry of ${log.eventId} failed. Check the endpoint is reachable.`);
    } finally {
      setRetryingEventId(null);
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
            placeholder="Event or URL"
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
                <th scope="col">Target URL</th>
                <th scope="col">Status</th>
                <th scope="col">Delivered</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((log) => {
                const tone = statusTone(log.httpStatus);
                return (
                  <tr
                    key={log.eventId}
                    data-testid={`webhook-log-row-${log.eventId}`}
                    aria-selected={selectedEventId === log.eventId}
                    onClick={() => setSelectedEventId((prev) => (prev === log.eventId ? null : log.eventId))}
                    style={{ cursor: "pointer" }}
                  >
                    <td>
                      <code>{log.eventId}</code>
                    </td>
                    <td style={{ maxWidth: "18rem", overflowWrap: "anywhere" }}>{log.endpointUrl}</td>
                    <td>
                      <Badge
                        tone={tone}
                        data-testid={`webhook-status-${log.eventId}`}
                      >
                        {statusLabel(log.httpStatus)}
                      </Badge>
                    </td>
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
                          data-testid={`webhook-retry-${log.eventId}`}
                          disabled={retryingEventId === log.eventId}
                          onClick={() => handleRetry(log)}
                        >
                          {retryingEventId === log.eventId ? "Retrying…" : "Retry"}
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
        <div className="webhook-modal-overlay dispute-modal-overlay" onClick={() => setSelectedEventId(null)} data-testid="webhook-modal-backdrop" style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: "rgba(0, 0, 0, 0.5)", display: "flex",
          alignItems: "center", justifyContent: "center", zIndex: 50,
          padding: "1rem"
        }}>
          <div
            className="webhook-modal dispute-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="webhook-modal-title"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "white", padding: "1.5rem", borderRadius: "0.5rem",
              width: "100%", maxWidth: "42rem", maxHeight: "90vh", overflowY: "auto",
              boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)"
            }}
          >
            <div className="dispute-modal-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
              <h2 id="webhook-modal-title" style={{ margin: 0, fontSize: "1.25rem", fontWeight: 600 }}>Delivery {selected.eventId}</h2>
              <button type="button" aria-label="Close" onClick={() => setSelectedEventId(null)} style={{ background: "transparent", border: "none", fontSize: "1.5rem", cursor: "pointer", color: "var(--color-text-muted)" }}>
                ×
              </button>
            </div>

            <dl className="receipt-meta" style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "0.5rem 1.5rem", marginBottom: "1.5rem" }}>
              <dt style={{ color: "var(--color-text-muted)", fontSize: "0.875rem" }}>Event ID</dt>
              <dd style={{ margin: 0, fontWeight: 500 }}>
                <code>{selected.eventId}</code>
              </dd>
              <dt style={{ color: "var(--color-text-muted)", fontSize: "0.875rem" }}>Target URL</dt>
              <dd style={{ margin: 0, overflowWrap: "anywhere", fontWeight: 500 }}>{selected.endpointUrl}</dd>
              <dt style={{ color: "var(--color-text-muted)", fontSize: "0.875rem" }}>Status</dt>
              <dd style={{ margin: 0 }}>
                <Badge tone={statusTone(selected.httpStatus)}>
                  {statusLabel(selected.httpStatus)}
                </Badge>
              </dd>
            </dl>

            <h4 style={{ margin: "1rem 0 0.5rem", fontSize: "1rem", fontWeight: 600 }}>Request payload</h4>
            <pre
              data-testid="webhook-log-request"
              style={{
                background: "#f9fafb",
                border: "1px solid #e5e7eb",
                padding: "1rem",
                borderRadius: "0.375rem",
                fontSize: "0.8125rem",
                overflowX: "auto",
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere",
                maxHeight: "300px",
                overflowY: "auto"
              }}
            >
              {prettySnippet(selected.requestPayload)}
            </pre>

            <h4 style={{ margin: "1.5rem 0 0.5rem", fontSize: "1rem", fontWeight: 600 }}>Response</h4>
            <pre
              data-testid="webhook-log-response"
              style={{
                background: "#f9fafb",
                border: "1px solid #e5e7eb",
                padding: "1rem",
                borderRadius: "0.375rem",
                fontSize: "0.8125rem",
                overflowX: "auto",
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere",
                maxHeight: "300px",
                overflowY: "auto"
              }}
            >
              {prettySnippet(selected.responseBody || responseBodyFor(selected))}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

function prettySnippet(snippet: string): string {
  if (!snippet) return "(empty body)";
  try {
    return JSON.stringify(JSON.parse(snippet), null, 2);
  } catch {
    return snippet;
  }
}

function responseBodyFor(log: WebhookDeliveryLog): string {
  if (statusTone(log.httpStatus) === "success") {
    return `Endpoint accepted event.`;
  }
  return `Endpoint rejected event with ${log.httpStatus}.`;
}
