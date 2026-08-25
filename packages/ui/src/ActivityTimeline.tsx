export type ActivityTone = "neutral" | "positive" | "negative" | "warning";

export interface ActivityEvent {
  id: string;
  label: string;
  tone: ActivityTone;
  timestamp: Date;
  /** Pre-formatted amount string to show alongside the event (e.g. a partial refund amount). */
  amount?: string;
}

export interface ActivityTimelineProps {
  events: ActivityEvent[];
  /** Accessible label for the list, e.g. "Refund status". */
  ariaLabel?: string;
}

const TONE_COLORS: Record<ActivityTone, { dot: string; text: string }> = {
  neutral: { dot: "var(--color-text-muted, #6b7280)", text: "var(--color-text-primary, #111827)" },
  positive: { dot: "var(--color-success-text, #047857)", text: "var(--color-success-text, #047857)" },
  negative: { dot: "var(--color-error-text, #dc2626)", text: "var(--color-error-text, #dc2626)" },
  warning: { dot: "var(--color-stat-neutral, #d97706)", text: "var(--color-stat-neutral, #d97706)" },
};

function formatTimestamp(date: Date): string {
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Chronological list of discrete events, each with its own tone (e.g. a
 * refund's requested -> settled/rejected progression). Unlike StatusTimeline
 * (a fixed-lifecycle stepper over a single current status), this renders an
 * arbitrary, growing list of past events.
 */
export function ActivityTimeline({ events, ariaLabel }: ActivityTimelineProps) {
  if (events.length === 0) {
    return <p className="stat-label">No activity yet.</p>;
  }

  return (
    <ol aria-label={ariaLabel} style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {events.map((event) => {
        const colors = TONE_COLORS[event.tone];
        return (
          <li
            key={event.id}
            style={{
              display: "flex",
              gap: "0.625rem",
              alignItems: "flex-start",
              padding: "0.375rem 0",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                marginTop: "0.375rem",
                width: "0.5rem",
                height: "0.5rem",
                borderRadius: "50%",
                background: colors.dot,
                flexShrink: 0,
              }}
            />
            <span>
              <span style={{ color: colors.text, fontWeight: 500 }}>{event.label}</span>
              {event.amount && <span> — {event.amount}</span>}
              <br />
              <span style={{ fontSize: "0.8125rem", color: "var(--color-text-muted, #6b7280)" }}>
                {formatTimestamp(event.timestamp)}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
