"use client";

import { useRef } from "react";
import {
  MAX_FEEDBACK_RATING,
  MIN_FEEDBACK_RATING,
  feedbackRatingLabel,
} from "../../lib/releaseConfirmation";

export interface StarRatingProps {
  /** Current rating (1–5), or null when the buyer hasn't rated yet. */
  value: number | null;
  onChange: (value: number | null) => void;
  /** Total number of stars. Defaults to 5. */
  max?: number;
  /** Clicking the active star clears the rating. Defaults to false. */
  allowClear?: boolean;
  disabled?: boolean;
  /** Accessible name for the rating group. */
  label?: string;
  /** id of the element that describes the group (e.g. "(optional)"). */
  describedBy?: string;
}

/**
 * Optional 1–5 star merchant rating (#707).
 *
 * Implemented as a `radiogroup` of buttons (not a native radio input stack)
 * so the stars can be styled as icons while still exposing the correct role,
 * `aria-checked` state, and Left/Right/Home/End keyboard handling — and page
 * arrow keys don't have to fight the browser's radio-group behaviour.
 */
export function StarRating({
  value,
  onChange,
  max = MAX_FEEDBACK_RATING,
  allowClear = false,
  disabled = false,
  label = "Merchant rating",
  describedBy,
}: StarRatingProps) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const stars = Array.from(
    { length: Math.max(MIN_FEEDBACK_RATING, max) },
    (_, index) => index + MIN_FEEDBACK_RATING
  );

  const select = (next: number) => {
    if (disabled) return;
    onChange(allowClear && value === next ? null : next);
  };

  const focusStar = (star: number) => {
    buttonRefs.current[star - MIN_FEEDBACK_RATING]?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, star: number) => {
    if (disabled) return;

    let next: number | null = null;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        next = star >= stars.length ? MIN_FEEDBACK_RATING : star + 1;
        break;
      case "ArrowLeft":
      case "ArrowDown":
        next = star <= MIN_FEEDBACK_RATING ? stars.length : star - 1;
        break;
      case "Home":
        next = MIN_FEEDBACK_RATING;
        break;
      case "End":
        next = stars.length;
        break;
      case " ":
      case "Enter":
        select(star);
        event.preventDefault();
        return;
      default:
        return;
    }

    event.preventDefault();
    onChange(next);
    focusStar(next);
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-describedby={describedBy}
      aria-disabled={disabled || undefined}
      data-testid="star-rating"
      style={{ display: "inline-flex", alignItems: "center", gap: "0.125rem" }}
    >
      {stars.map((star) => {
        const selected = value !== null && star <= value;
        return (
          <button
            key={star}
            ref={(el) => {
              buttonRefs.current[star - MIN_FEEDBACK_RATING] = el;
            }}
            type="button"
            role="radio"
            aria-checked={value === star}
            aria-label={`${star} ${star === 1 ? "star" : "stars"} — ${
              feedbackRatingLabel(star) || "rated"
            }`}
            tabIndex={value === null ? (star === MIN_FEEDBACK_RATING ? 0 : -1) : value === star ? 0 : -1}
            disabled={disabled}
            onClick={() => select(star)}
            onKeyDown={(event) => handleKeyDown(event, star)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "1.75rem",
              height: "1.75rem",
              padding: 0,
              border: "none",
              background: "transparent",
              cursor: disabled ? "not-allowed" : "pointer",
              color: selected ? "#f59e0b" : "#d1d5db",
              lineHeight: 1,
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill={selected ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </button>
        );
      })}
    </div>
  );
}
