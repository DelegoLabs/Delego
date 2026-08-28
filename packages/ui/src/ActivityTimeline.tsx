import type { ReactNode } from "react";

/** Visual treatment for a timeline event. */
export type ActivityTone = "success" | "pending" | "failed" | "refunded";

/** A single normalized event rendered as one step in the timeline. */
export interface ActivityTimelineEvent {
  id: string;
  type: string;
  title: string;
  description?: string;
  timestamp: Date;
  icon?: ReactNode;
  tone?: ActivityTone;
  /**
   * Optional rich content rendered under the timestamp for this entry — e.g.
   * a "View proof" expander for delivery evidence (#579). Kept as an opaque
   * node so the shared component stays presentation-only.
   */
  detail?: ReactNode;
}

export interface ActivityTimelineProps {
  /** Events rendered top-to-bottom in the order given — sort before passing. */
  events: ActivityTimelineEvent[];
  /** Shown in place of the list when `events` is empty. */
  emptyMessage?: string;
  ariaLabel?: string;
}

const toneStyles: Record<ActivityTone, { dot: string; text: string }> = {
  success: { dot: "#059669", text: "#065f46" },
  pending: { dot: "#2563eb", text: "#1e40af" },
  failed: { dot: "#dc2626", text: "#991b1b" },
  refunded: { dot: "#d97706", text: "#92400e" },
};

function formatRelativeTime(timestamp: Date, now: Date = new Date()): string {
  const diffMs = now.getTime() - timestamp.getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function formatAbsoluteTime(timestamp: Date): string {
  return timestamp.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * Vertical stepper for a normalized list of activity events (order lifecycle,
 * escrow transitions, delegation activity, ...). Renders events in the order
 * given — callers are responsible for sorting.
 */
export function ActivityTimeline({
  events,
  emptyMessage = "No activity yet.",
  ariaLabel = "Activity timeline",
}: ActivityTimelineProps) {
  if (events.length === 0) {
    return <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>{emptyMessage}</p>;
  }

  return (
    <ol
      aria-label={ariaLabel}
      style={{
        listStyle: "none",
        margin: 0,
        padding: 0,
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
      }}
    >
      {events.map((event) => {
        const tone = event.tone ?? "pending";
        const style = toneStyles[tone];
        return (
          <li
            key={event.id}
            data-tone={tone}
            style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}
          >
            <span
              aria-hidden="true"
              style={{
                flexShrink: 0,
                width: "1.5rem",
                height: "1.5rem",
                borderRadius: "9999px",
                backgroundColor: style.dot,
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.75rem",
              }}
            >
              {event.icon}
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.125rem" }}>
              <span style={{ fontWeight: 600, fontSize: "0.875rem", color: style.text }}>
                {event.title}
              </span>
              {event.description && (
                <span style={{ fontSize: "0.8125rem", color: "#6b7280" }}>
                  {event.description}
                </span>
              )}
              <time
                dateTime={event.timestamp.toISOString()}
                title={formatAbsoluteTime(event.timestamp)}
                style={{ fontSize: "0.75rem", color: "#9ca3af" }}
              >
                {formatRelativeTime(event.timestamp)}
              </time>
              {event.detail != null && (
                <div style={{ marginTop: "0.375rem" }}>{event.detail}</div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
