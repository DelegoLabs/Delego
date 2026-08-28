"use client";

import type { PriceAdvisory } from "../../lib/priceAdvisory";

export interface PriceAdvisoryStripProps {
  advisory: PriceAdvisory;
  /** Whether the approver has acknowledged an above-range price (session-remembered). */
  acknowledged: boolean;
  onAcknowledgedChange: (next: boolean) => void;
}

const LEVEL_META: Record<
  PriceAdvisory["level"],
  { className: string; label: string; body: string }
> = {
  within: {
    className: "approval-advisory approval-advisory-within",
    label: "Within typical range",
    body: "Item pricing matches the range we've seen for these products recently.",
  },
  above: {
    className: "approval-advisory approval-advisory-above",
    label: "Above recent prices",
    body: "At least one item is priced higher than the range we've seen recently. It may still be a fair price — take a moment to check before approving.",
  },
  "no-data": {
    className: "approval-advisory approval-advisory-nodata",
    label: "No price comparison",
    body: "We don't have recent comparable prices for these items, so there's nothing to compare against here.",
  },
};

/**
 * Non-blocking price advisory strip shown in the approval drawer (#571).
 * Purely informational for the green/gray states; the amber (above-range)
 * state asks for one confirmation tick before Approve is enabled — that tick
 * is remembered for the session, so it never becomes a repeated speed bump.
 */
export function PriceAdvisoryStrip({
  advisory,
  acknowledged,
  onAcknowledgedChange,
}: PriceAdvisoryStripProps) {
  const meta = LEVEL_META[advisory.level];
  const needsAck = advisory.level === "above";

  return (
    <section
      className={meta.className}
      role="status"
      aria-label="Price advisory"
      data-advisory-level={advisory.level}
    >
      <div>
        <strong>{meta.label}.</strong> {meta.body}
      </div>
      {needsAck && (
        <label className="approval-advisory-ack">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => onAcknowledgedChange(e.target.checked)}
          />
          <span>I&rsquo;ve reviewed the pricing and want to approve anyway.</span>
        </label>
      )}
    </section>
  );
}
