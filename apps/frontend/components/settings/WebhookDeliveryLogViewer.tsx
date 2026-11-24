"use client";

import { useMemo, useRef, useState } from "react";
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

/** Which status-code band the pill filter selects. */
type StatusBand = "all" | "2xx" | "4xx" | "5xx";

function matchesBand(status: number, band: StatusBand): boolean {
  if (band === "all") return true;
  if (band === "2xx") return status >= 200 && status <= 299;
  if (band === "4xx") return status >= 400 && status <= 499;
  if (band === "5xx") return status >= 500 && status <= 599;
  return true;
}

/** Derive the legacy outcome value that filterDeliveryLogs understands. */
function bandToOutcome(band: StatusBand): Outcome | undefined {
  if (band === "2xx") return "success";
  if (band === "4xx" || band === "5xx") return "error";
  return undefined;
}

const STATUS_PILLS: { label: string; band: StatusBand }[] = [
  { label: "All", band: "all" },
  { label: "2xx", band: "2xx" },
  { label: "4xx", band: "4xx" },
  { label: "5xx", band: "5xx" },
];

export function WebhookDeliveryLogViewer({
  logs,
  onRetry,
}: WebhookDeliveryLogViewerProps) {
  const [stored] = useState<WebhookDeliveryLog[]>(() =>
    loadWebhookDeliveryLogs()
  );
  const [search, setSearch] = useState("");
  const [outcome, setOutcome] = useState<Outcome | "all">("all");
  const [statusBand, setStatusBand] = useState<StatusBand>("all");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [retryingEventId, setRetryingEventId] = useState<string | null>(null);
  const [retryNotice, setRetryNotice] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [copiedSection, setCopiedSection] = useState<
    "request" | "response" | null
  >(null);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const source = logs ?? stored;

  // When the status-band pill is used, it takes precedence over the outcome
  // dropdown. The band is applied as a post-filter step so "4xx" and "5xx"
  // can each be isolated — filterDeliveryLogs only knows success/error.
  const bandOutcome = bandToOutcome(statusBand);

  const visible = useMemo(() => {
    const afterOutcome = filterDeliveryLogs(source, {
      search,
      outcome: bandOutcome ?? (outcome === "all" ? undefined : outcome),
    });
    if (statusBand === "all") return afterOutcome;
    return afterOutcome.filter((log) => matchesBand(log.httpStatus, statusBand));
  }, [source, search, outcome, statusBand, bandOutcome]);

  const summary = useMemo(() => summarizeDeliveryLogs(source), [source]);

  const selected =
    visible.find((log) => log.eventId === selectedEventId) ?? null;

  async function handleRetry(log: WebhookDeliveryLog) {
    if (!onRetry) return;
    setRetryingEventId(log.eventId);
    setRetryNotice(null);
    try {
      await onRetry(log);
      setRetryNotice(`Retried ${log.eventId}.`);
    } catch {
      setRetryNotice(
        `Retry of ${log.eventId} failed. Check the endpoint is reachable.`
      );
    } finally {
      setRetryingEventId(null);
    }
  }

  function openDrawer(eventId: string) {
    setSelectedEventId(eventId);
    setDrawerOpen(true);
    setCopiedSection(null);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setSelectedEventId(null);
  }

  function handleCopy(section: "request" | "response", text: string) {
    navigator.clipboard.writeText(text).then(() => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      setCopiedSection(section);
      copyTimeoutRef.current = setTimeout(() => setCopiedSection(null), 2000);
    });
  }

  return (
    <div
      className="webhook-delivery-logs"
      style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
    >
      {/* ── Filters ─────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          gap: "1rem",
          flexWrap: "wrap",
          alignItems: "flex-end",
        }}
      >
        <label
          style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}
          htmlFor="webhook-log-search"
        >
          <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>Search</span>
          <input
            id="webhook-log-search"
            type="search"
            value={search}
            placeholder="Event or URL"
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label
          style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}
          htmlFor="webhook-log-outcome"
        >
          <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>Outcome</span>
          <select
            id="webhook-log-outcome"
            value={outcome}
            onChange={(e) => {
              setOutcome(e.target.value as Outcome | "all");
              setStatusBand("all");
            }}
          >
            <option value="all">All deliveries</option>
            <option value="success">Succeeded</option>
            <option value="error">Failed</option>
          </select>
        </label>
      </div>

      {/* ── Status-code filter pills ─────────────────────────── */}
      <div
        role="group"
        aria-label="Filter by status code"
        style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}
      >
        {STATUS_PILLS.map(({ label, band }) => (
          <button
            key={band}
            type="button"
            data-testid={`status-pill-${band}`}
            aria-pressed={statusBand === band}
            onClick={() => {
              setStatusBand(band);
              setOutcome("all");
            }}
            style={{
              padding: "0.25rem 0.875rem",
              borderRadius: "9999px",
              border: "1px solid",
              fontSize: "0.8125rem",
              fontWeight: 500,
              cursor: "pointer",
              borderColor: statusBand === band ? "var(--color-primary, #2563eb)" : "var(--color-border, #d1d5db)",
              backgroundColor: statusBand === band ? "var(--color-primary, #2563eb)" : "transparent",
              color: statusBand === band ? "#fff" : "inherit",
              transition: "background-color 0.15s, color 0.15s",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Summary badges ───────────────────────────────────── */}
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <Badge tone="neutral" data-testid="log-summary-total">
          {summary.total} deliveries
        </Badge>
        <Badge tone="success" data-testid="log-summary-succeeded">
          {summary.succeeded} delivered
        </Badge>
        <Badge
          tone={summary.failed > 0 ? "error" : "neutral"}
          data-testid="log-summary-failed"
        >
          {summary.failed} failed
        </Badge>
      </div>

      {retryNotice && (
        <p
          role="status"
          data-testid="webhook-retry-notice"
          style={{ margin: 0, fontSize: "0.8125rem" }}
        >
          {retryNotice}
        </p>
      )}

      {/* ── Log table ────────────────────────────────────────── */}
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
          <table
            className="comparison-table"
            data-testid="webhook-log-table"
          >
            <caption className="sr-only">
              Recent outgoing webhook deliveries
            </caption>
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
                    onClick={() => openDrawer(log.eventId)}
                    style={{ cursor: "pointer" }}
                  >
                    <td>
                      <code>{log.eventId}</code>
                    </td>
                    <td
                      style={{
                        maxWidth: "18rem",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {log.endpointUrl}
                    </td>
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
                          {retryingEventId === log.eventId
                            ? "Retrying…"
                            : "Try again"}
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

      {/* ── JSON payload inspector drawer ────────────────────── */}
      {drawerOpen && selected && (
        <>
          {/* Backdrop */}
          <div
            data-testid="webhook-drawer-backdrop"
            onClick={closeDrawer}
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(0,0,0,0.4)",
              zIndex: 40,
            }}
          />

          {/* Drawer panel */}
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="webhook-drawer-title"
            data-testid="webhook-payload-drawer"
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              bottom: 0,
              width: "min(44rem, 100vw)",
              backgroundColor: "#fff",
              boxShadow: "-4px 0 24px rgba(0,0,0,0.12)",
              zIndex: 50,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            {/* Drawer header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "1.25rem 1.5rem",
                borderBottom: "1px solid var(--color-border, #e5e7eb)",
                flexShrink: 0,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <h2
                  id="webhook-drawer-title"
                  style={{ margin: 0, fontSize: "1.125rem", fontWeight: 600 }}
                >
                  Payload Inspector
                </h2>
                <Badge tone={statusTone(selected.httpStatus)}>
                  {statusLabel(selected.httpStatus)}
                </Badge>
              </div>
              <button
                type="button"
                aria-label="Close payload inspector"
                data-testid="webhook-drawer-close"
                onClick={closeDrawer}
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: "1.5rem",
                  lineHeight: 1,
                  cursor: "pointer",
                  color: "var(--color-text-muted, #6b7280)",
                  padding: "0.25rem",
                }}
              >
                ✕
              </button>
            </div>

            {/* Drawer body — scrollable */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "1.5rem",
                display: "flex",
                flexDirection: "column",
                gap: "1.5rem",
              }}
            >
              {/* Meta */}
              <dl
                className="receipt-meta"
                style={{
                  display: "grid",
                  gridTemplateColumns: "max-content 1fr",
                  gap: "0.5rem 1.5rem",
                  margin: 0,
                }}
              >
                <dt
                  style={{
                    color: "var(--color-text-muted, #6b7280)",
                    fontSize: "0.875rem",
                  }}
                >
                  Event ID
                </dt>
                <dd style={{ margin: 0, fontWeight: 500 }}>
                  <code>{selected.eventId}</code>
                </dd>
                <dt
                  style={{
                    color: "var(--color-text-muted, #6b7280)",
                    fontSize: "0.875rem",
                  }}
                >
                  Target URL
                </dt>
                <dd
                  style={{
                    margin: 0,
                    overflowWrap: "anywhere",
                    fontWeight: 500,
                  }}
                >
                  {selected.endpointUrl}
                </dd>
                <dt
                  style={{
                    color: "var(--color-text-muted, #6b7280)",
                    fontSize: "0.875rem",
                  }}
                >
                  Delivered
                </dt>
                <dd style={{ margin: 0, fontWeight: 500 }}>
                  {new Date(selected.deliveredAt).toLocaleString(undefined, {
                    dateStyle: "long",
                    timeStyle: "medium",
                  })}
                </dd>
              </dl>

              {/* Request payload */}
              <PayloadSection
                title="Request payload"
                content={selected.requestPayload}
                testId="webhook-log-request"
                copied={copiedSection === "request"}
                onCopy={(text) => handleCopy("request", text)}
              />

              {/* Response body */}
              <PayloadSection
                title="Response"
                content={selected.responseBody || responseBodyFor(selected)}
                testId="webhook-log-response"
                copied={copiedSection === "response"}
                onCopy={(text) => handleCopy("response", text)}
              />
            </div>
          </aside>
        </>
      )}
    </div>
  );
}

// ─── PayloadSection ──────────────────────────────────────────────────────────

interface PayloadSectionProps {
  title: string;
  content: string;
  testId: string;
  copied: boolean;
  onCopy: (text: string) => void;
}

function PayloadSection({
  title,
  content,
  testId,
  copied,
  onCopy,
}: PayloadSectionProps) {
  const pretty = prettyJson(content);

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "0.5rem",
        }}
      >
        <h4 style={{ margin: 0, fontSize: "0.9375rem", fontWeight: 600 }}>
          {title}
        </h4>
        <button
          type="button"
          data-testid={`${testId}-copy`}
          onClick={() => onCopy(pretty)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.25rem",
            background: "transparent",
            border: "1px solid var(--color-border, #d1d5db)",
            borderRadius: "0.375rem",
            padding: "0.25rem 0.625rem",
            fontSize: "0.75rem",
            fontWeight: 500,
            cursor: "pointer",
            color: copied
              ? "var(--color-success, #16a34a)"
              : "var(--color-text-muted, #6b7280)",
            transition: "color 0.15s",
          }}
        >
          {copied ? "✓ Copied" : "Copy"}
        </button>
      </div>
      <pre
        data-testid={testId}
        style={{
          background: "#f9fafb",
          border: "1px solid var(--color-border, #e5e7eb)",
          padding: "1rem",
          borderRadius: "0.375rem",
          fontSize: "0.8125rem",
          overflowX: "auto",
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
          maxHeight: "320px",
          overflowY: "auto",
          margin: 0,
        }}
      >
        {pretty}
      </pre>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function prettyJson(snippet: string): string {
  if (!snippet) return "(empty body)";
  try {
    return JSON.stringify(JSON.parse(snippet), null, 2);
  } catch {
    return snippet;
  }
}

function responseBodyFor(log: WebhookDeliveryLog): string {
  if (statusTone(log.httpStatus) === "success") {
    return "Endpoint accepted event.";
  }
  return `Endpoint rejected event with ${log.httpStatus}.`;
}
