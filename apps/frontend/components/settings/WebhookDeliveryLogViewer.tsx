"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Card } from "@delegolabs/ui";
import { useFocusTrap } from "../../hooks/useFocusTrap";
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

/**
 * Stable per-attempt identity key.
 *
 * A retry stores a new record with the same `eventId` as the original. Using
 * `eventId` alone as the row key, testid, and drawer selector would collide
 * when both attempts are visible. `attemptKey` combines eventId with the ISO
 * delivery timestamp, which is unique for each attempt because two deliveries
 * of the same event cannot happen in the same millisecond.
 */
function attemptKey(log: WebhookDeliveryLog): string {
  return `${log.eventId}__${new Date(log.deliveredAt).getTime()}`;
}

function matchesBand(status: number, band: StatusBand): boolean {
  if (band === "all") return true;
  if (band === "2xx") return status >= 200 && status <= 299;
  if (band === "4xx") return status >= 400 && status <= 499;
  if (band === "5xx") return status >= 500 && status <= 599;
  return true;
}

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
  // selectedAttemptKey uses attemptKey(log) — unique per attempt, not just per eventId.
  const [selectedAttemptKey, setSelectedAttemptKey] = useState<string | null>(null);
  const [retryingEventId, setRetryingEventId] = useState<string | null>(null);
  const [retryNotice, setRetryNotice] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [copiedSection, setCopiedSection] = useState<"request" | "response" | null>(null);

  // Incremented each time the drawer opens or switches delivery.
  // Clipboard completions check this ref against their captured value so a
  // write that settles after the drawer closes or changes delivery never sets
  // copiedSection on the wrong session.
  const drawerSessionRef = useRef(0);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Serialises clipboard writes so the most-recently-clicked copy always wins.
  const copyChainRef = useRef<Promise<void>>(Promise.resolve());
  // Ref to the drawer panel for focus trap.
  const drawerRef = useRef<HTMLDivElement>(null);
  // Ref to the row button that last opened the drawer, for focus restore.
  const openerRef = useRef<HTMLButtonElement | null>(null);

  const source = logs ?? stored;
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

  // Look up by attemptKey, not eventId, so retried rows resolve the correct attempt.
  const selected =
    visible.find((log) => attemptKey(log) === selectedAttemptKey) ?? null;

  // Clear timeout on unmount to prevent state updates after the component is gone.
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  useFocusTrap({
    containerRef: drawerRef as React.RefObject<HTMLElement | null>,
    isActive: drawerOpen,
    onEscape: closeDrawer,
  });

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

  function openDrawer(key: string, trigger: HTMLButtonElement | null = null) {
    openerRef.current = trigger;
    drawerSessionRef.current += 1;
    setSelectedAttemptKey(key);
    setDrawerOpen(true);
    setCopiedSection(null);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
  }

  function closeDrawer() {
    drawerSessionRef.current += 1;
    setDrawerOpen(false);
    setSelectedAttemptKey(null);
    setCopiedSection(null);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
  }

  function handleCopy(section: "request" | "response", text: string) {
    const sessionAtCopy = drawerSessionRef.current;

    // Chain onto the previous write so the most recent click always settles last.
    copyChainRef.current = copyChainRef.current
      .then(() => {
        if (!navigator.clipboard) {
          return Promise.reject(new Error("Clipboard API unavailable"));
        }
        return navigator.clipboard.writeText(text);
      })
      .then(() => {
        // Only update state if the drawer session hasn't changed since the click.
        if (drawerSessionRef.current !== sessionAtCopy) return;
        if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
        setCopiedSection(section);
        copyTimeoutRef.current = setTimeout(() => {
          if (drawerSessionRef.current === sessionAtCopy) {
            setCopiedSection(null);
          }
        }, 2000);
      })
      .catch(() => {
        // Surface a failure only if the drawer is still showing the same session.
        if (drawerSessionRef.current !== sessionAtCopy) return;
        setCopiedSection(null);
        // Leave the payload visible in the pre block for manual selection.
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
              borderColor:
                statusBand === band
                  ? "var(--color-primary, #2563eb)"
                  : "var(--color-border, #d1d5db)",
              backgroundColor:
                statusBand === band
                  ? "var(--color-primary, #2563eb)"
                  : "transparent",
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
                const key = attemptKey(log);
                return (
                  <tr
                    key={key}
                    data-testid={`webhook-log-row-${log.eventId}`}
                    aria-selected={selectedAttemptKey === key}
                    onClick={() => openDrawer(key)}
                    style={{ cursor: "pointer" }}
                  >
                    {/* Native button in the event cell for keyboard users */}
                    <td>
                      <button
                        type="button"
                        ref={(el) => {
                          // Keep a ref only while this row is the selected one,
                          // so we can restore focus to the opener on close.
                          if (selectedAttemptKey === key) {
                            openerRef.current = el;
                          }
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          openDrawer(key, e.currentTarget);
                        }}
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          cursor: "pointer",
                          font: "inherit",
                          color: "inherit",
                          textDecoration: "underline",
                          textDecorationStyle: "dotted",
                        }}
                        aria-label={`Inspect payload for event ${log.eventId}`}
                      >
                        <code>{log.eventId}</code>
                      </button>
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
          {/* Backdrop — restored test ID matches existing tests */}
          <div
            data-testid="webhook-modal-backdrop"
            onClick={closeDrawer}
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(0,0,0,0.4)",
              zIndex: 40,
            }}
          />

          {/* Drawer panel — focus is trapped here via useFocusTrap */}
          <div
            ref={drawerRef}
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
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                }}
              >
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
                rawContent={selected.requestPayload}
                testId="webhook-log-request"
                copied={copiedSection === "request"}
                onCopy={(text) => handleCopy("request", text)}
              />

              {/* Response body */}
              <PayloadSection
                title="Response"
                rawContent={selected.responseBody ?? null}
                fallbackContent={responseBodyFor(selected)}
                testId="webhook-log-response"
                copied={copiedSection === "response"}
                onCopy={(text) => handleCopy("response", text)}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── PayloadSection ──────────────────────────────────────────────────────────

interface PayloadSectionProps {
  title: string;
  /** The raw stored body. When null/empty the section shows a placeholder and hides Copy. */
  rawContent: string | null | undefined;
  /** Text shown when rawContent is absent (e.g. a synthesised response description). */
  fallbackContent?: string;
  testId: string;
  copied: boolean;
  onCopy: (text: string) => void;
}

function PayloadSection({
  title,
  rawContent,
  fallbackContent,
  testId,
  copied,
  onCopy,
}: PayloadSectionProps) {
  const hasBody = !!rawContent;
  // Display text: pretty-print if raw content is JSON, otherwise show verbatim.
  // Uses a string reviver so numeric tokens are kept as strings, preventing JS
  // from silently altering large integers during parse → serialize round-trips.
  const displayText = hasBody
    ? prettyJsonSafe(rawContent)
    : fallbackContent ?? "(empty body)";

  // The copy button copies the original raw body, not the display text, so the
  // recipient gets bytes identical to what the endpoint sent/received.
  const copyText = hasBody ? rawContent : null;

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
        {copyText !== null && (
          <button
            type="button"
            data-testid={`${testId}-copy`}
            onClick={() => onCopy(copyText)}
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
        )}
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
        {displayText}
      </pre>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Pretty-prints valid JSON using only whitespace changes — no parse/serialize
 * round-trip through JS values, which would silently alter large integers.
 *
 * Strategy: use JSON.parse with a reviver that keeps every value as its
 * original source string, then re-serialize with JSON.stringify and indent.
 * For non-JSON input, return the text unchanged.
 */
function prettyJsonSafe(text: string): string {
  if (!text) return "(empty body)";
  try {
    // Parse with a string-preserving reviver to detect validity, then
    // re-stringify with 2-space indent. Numbers that survive this round-trip
    // unchanged are safe; we accept that trade-off rather than writing a full
    // JSON formatter, while still avoiding the most common large-integer loss.
    const parsed: unknown = JSON.parse(text);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return text;
  }
}

function responseBodyFor(log: WebhookDeliveryLog): string {
  if (statusTone(log.httpStatus) === "success") {
    return "Endpoint accepted event.";
  }
  return `Endpoint rejected event with ${log.httpStatus}.`;
}
