import type { CSSProperties } from "react";

export type TrackingStatus =
  | "label_created"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "exception";

export interface TrackingMilestone {
  status: TrackingStatus;
  location: string;
  timestamp: string;
  description: string;
}

export interface ShipmentTrackerProps {
  carrier: string;
  trackingNumber: string;
  milestones: TrackingMilestone[];
  estimatedDelivery: string;
}

const STATUS_LABEL: Record<TrackingStatus, string> = {
  label_created: "Picked up",
  in_transit: "In transit",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  exception: "Exception",
};

const EXCEPTION_INSTRUCTIONS =
  "This shipment has an exception. Review the carrier update and follow their instructions before it can continue.";

const DOT: Record<"complete" | "current" | "exception", string> = {
  complete: "#059669",
  current: "#2563eb",
  exception: "#d97706",
};

/**
 * Official carrier tracking pages. Unknown carriers do not get a guessed URL.
 */
export function carrierTrackingUrl(carrier: string, trackingNumber: string): string | null {
  const normalized = carrier.trim().toLowerCase();
  const id = encodeURIComponent(trackingNumber.trim());
  if (!id) return null;
  if (normalized.includes("fedex")) {
    return `https://www.fedex.com/fedextrack/?trknbr=${id}`;
  }
  if (normalized.includes("usps") || normalized.includes("u.s. postal")) {
    return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${id}`;
  }
  if (normalized.includes("dhl")) {
    return `https://www.dhl.com/global-en/home/tracking.html?tracking-id=${id}`;
  }
  if (/\bups\b/.test(normalized)) {
    return `https://www.ups.com/track?tracknum=${id}`;
  }
  return null;
}

function timeValue(timestamp: string): number {
  const value = Date.parse(timestamp);
  return Number.isNaN(value) ? Number.POSITIVE_INFINITY : value;
}

/** Oldest first. Unparseable timestamps stay at the end, in their original order. */
export function sortMilestones(milestones: TrackingMilestone[]): TrackingMilestone[] {
  return milestones
    .map((milestone, index) => ({ milestone, index }))
    .sort((a, b) => {
      const aTime = timeValue(a.milestone.timestamp);
      const bTime = timeValue(b.milestone.timestamp);
      if (aTime !== bTime) {
        if (aTime === Number.POSITIVE_INFINITY) return 1;
        if (bTime === Number.POSITIVE_INFINITY) return -1;
        return aTime - bTime;
      }
      return a.index - b.index;
    })
    .map(({ milestone }) => milestone);
}

function formatWhen(timestamp: string): string {
  const value = Date.parse(timestamp);
  if (Number.isNaN(value)) return timestamp;
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * Vertical stepper for carrier milestones. An exception step is amber and
 * includes instructions; other steps stay on the green/blue progress scale.
 */
export function ShipmentTracker({
  carrier,
  trackingNumber,
  milestones,
  estimatedDelivery,
}: ShipmentTrackerProps) {
  const steps = sortMilestones(milestones);
  const trackingUrl = carrierTrackingUrl(carrier, trackingNumber);
  const lastIndex = steps.length - 1;

  return (
    <section aria-label={`Shipment tracking for ${carrier}`} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: "0.875rem" }}>{carrier}</div>
          <div style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.8125rem", color: "#374151" }}>
            {trackingNumber}
          </div>
        </div>
        {trackingUrl ? (
          <a
            href={trackingUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={linkButtonStyle}
          >
            Track on {carrier}
          </a>
        ) : (
          <button type="button" disabled style={{ ...linkButtonStyle, cursor: "not-allowed", opacity: 0.6 }}>
            Carrier tracking unavailable
          </button>
        )}
      </div>

      <p style={{ margin: 0, fontSize: "0.8125rem", color: "#4b5563" }}>
        Estimated delivery: {formatWhen(estimatedDelivery)}
      </p>

      {steps.length === 0 ? (
        <p style={{ margin: 0, fontSize: "0.875rem", color: "#6b7280" }}>No tracking updates yet.</p>
      ) : (
        <ol aria-label="Shipment milestones" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {steps.map((step, index) => {
            const isException = step.status === "exception";
            const isCurrent = index === lastIndex;
            const tone = isException ? "exception" : isCurrent ? "current" : "complete";
            return (
              <li
                key={`${step.status}-${step.timestamp}-${index}`}
                data-status={step.status}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.25rem 1fr",
                  columnGap: "0.75rem",
                }}
              >
                <div aria-hidden="true" style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <span
                    style={{
                      width: "0.75rem",
                      height: "0.75rem",
                      marginTop: "0.25rem",
                      borderRadius: "9999px",
                      background: DOT[tone],
                      flexShrink: 0,
                    }}
                  />
                  {index < lastIndex && (
                    <span style={{ width: "2px", flex: 1, minHeight: "1.5rem", background: "#e5e7eb" }} />
                  )}
                </div>
                <div
                  style={{
                    marginBottom: index < lastIndex ? "0.75rem" : 0,
                    padding: "0.5rem 0.625rem",
                    borderRadius: "0.375rem",
                    background: isException ? "#fef3c7" : "transparent",
                    color: isException ? "#92400e" : "#111827",
                    border: isException ? "1px solid #d97706" : "1px solid transparent",
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: "0.875rem" }}>{STATUS_LABEL[step.status]}</div>
                  {step.location && (
                    <div style={{ fontSize: "0.8125rem" }}>{step.location}</div>
                  )}
                  <time dateTime={step.timestamp} style={{ fontSize: "0.75rem", color: isException ? "#92400e" : "#6b7280" }}>
                    {formatWhen(step.timestamp)}
                  </time>
                  {step.description && (
                    <p style={{ margin: "0.25rem 0 0", fontSize: "0.8125rem" }}>{step.description}</p>
                  )}
                  {isException && (
                    <p style={{ margin: "0.375rem 0 0", fontSize: "0.8125rem", fontWeight: 600 }}>
                      {EXCEPTION_INSTRUCTIONS}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

const linkButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  alignSelf: "flex-start",
  padding: "0.375rem 0.75rem",
  borderRadius: "0.375rem",
  border: "1px solid #2563eb",
  background: "#ffffff",
  color: "#2563eb",
  fontSize: "0.8125rem",
  fontWeight: 600,
  textDecoration: "none",
  cursor: "pointer",
};
