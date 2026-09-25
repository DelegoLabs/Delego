"use client";

import { useEffect, useState } from "react";

export interface ResolutionCountdownProps {
  deadline: string; // ISO timestamp
  label?: string;
}

interface TimeRemaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  expired: boolean;
}

/**
 * Display resolution countdown clock showing time remaining until arbitration deadline.
 * Updates every second to show real-time countdown.
 */
export function ResolutionCountdown({ deadline, label = "Resolution Deadline" }: ResolutionCountdownProps) {
  const [timeRemaining, setTimeRemaining] = useState<TimeRemaining>(() =>
    calculateTimeRemaining(deadline)
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeRemaining(calculateTimeRemaining(deadline));
    }, 1000);

    return () => clearInterval(interval);
  }, [deadline]);

  const { days, hours, minutes, seconds, expired } = timeRemaining;

  return (
    <div className="resolution-countdown" role="timer" aria-live="polite">
      <div className="countdown-label">{label}</div>
      <div className={`countdown-display ${expired ? "expired" : ""}`}>
        {expired ? (
          <span className="countdown-expired">Deadline Expired</span>
        ) : (
          <>
            {days > 0 && (
              <div className="countdown-segment">
                <span className="countdown-value">{String(days).padStart(2, "0")}</span>
                <span className="countdown-unit">days</span>
              </div>
            )}
            <div className="countdown-segment">
              <span className="countdown-value">{String(hours).padStart(2, "0")}</span>
              <span className="countdown-unit">hrs</span>
            </div>
            <div className="countdown-segment">
              <span className="countdown-value">{String(minutes).padStart(2, "0")}</span>
              <span className="countdown-unit">min</span>
            </div>
            <div className="countdown-segment">
              <span className="countdown-value">{String(seconds).padStart(2, "0")}</span>
              <span className="countdown-unit">sec</span>
            </div>
          </>
        )}
      </div>

      <style jsx>{`
        .resolution-countdown {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          padding: 1rem;
          background: #f9fafb;
          border-radius: 0.5rem;
          border: 1px solid #e5e7eb;
        }

        .countdown-label {
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #6b7280;
        }

        .countdown-display {
          display: flex;
          gap: 0.5rem;
          align-items: center;
        }

        .countdown-display.expired {
          justify-content: center;
        }

        .countdown-segment {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 0.5rem;
          background: #fff;
          border-radius: 0.375rem;
          min-width: 3.5rem;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
        }

        .countdown-value {
          font-size: 1.5rem;
          font-weight: 700;
          color: #1f2937;
          line-height: 1;
          font-variant-numeric: tabular-nums;
        }

        .countdown-unit {
          font-size: 0.625rem;
          color: #6b7280;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-top: 0.25rem;
        }

        .countdown-expired {
          font-size: 1rem;
          font-weight: 600;
          color: #dc2626;
          padding: 0.5rem 1rem;
          background: #fef2f2;
          border-radius: 0.375rem;
        }

        @media (max-width: 640px) {
          .countdown-segment {
            min-width: 2.75rem;
            padding: 0.375rem;
          }

          .countdown-value {
            font-size: 1.25rem;
          }

          .countdown-unit {
            font-size: 0.5rem;
          }
        }
      `}</style>
    </div>
  );
}

function calculateTimeRemaining(deadline: string): TimeRemaining {
  const deadlineTime = new Date(deadline).getTime();
  const now = Date.now();
  const difference = deadlineTime - now;

  if (difference <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true };
  }

  const days = Math.floor(difference / (1000 * 60 * 60 * 24));
  const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((difference % (1000 * 60)) / 1000);

  return { days, hours, minutes, seconds, expired: false };
}
